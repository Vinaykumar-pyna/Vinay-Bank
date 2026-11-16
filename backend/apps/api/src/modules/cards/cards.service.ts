import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types, type Model } from 'mongoose';
import { istDateStamp, sha256Hex } from '@app/shared';
import { AccountStatus } from '../../common/enums/banking.enums';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AuthUser, RequestContext } from '../../common/types/auth.types';
import { Account } from '../accounts/schemas/account.schema';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { NotificationType } from '../notifications/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { OtpService, type IssuedChallenge } from '../otp/otp.service';
import { KycStatus } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { formatExpiry, toCardView, type CardView } from './card.mapper';
import { CardSecurityService, isWeakPin } from './card-security.service';
import type { HotlistCardDto, UpdateCardSettingsDto } from './dto/cards.dto';
import { Card, CardStatus, MAX_PIN_TRIES, type CardDocument } from './schemas/card.schema';

type OtpPurpose = 'CARD_REVEAL' | 'CARD_PIN';

export interface RevealedCard {
  pan: string;
  expiry: string;
  cvv: string;
  cardholderName: string;
}

/** Customer self-service for debit cards: issue, view, PIN, controls, block and hotlist. */
@Injectable()
export class CardsService {
  constructor(
    @InjectModel(Card.name) private readonly cards: Model<Card>,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    private readonly security: CardSecurityService,
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  view(card: Card & { _id: Types.ObjectId }): CardView {
    return toCardView(card, MAX_PIN_TRIES);
  }

  async list(user: AuthUser): Promise<CardView[]> {
    const cards = await this.cards.find({ customerId: user.id }).sort({ createdAt: -1 }).lean();
    return cards.map((card) => this.view(card));
  }

  /** Issues a virtual RuPay debit card instantly: KYC-verified customers, one live card per account. */
  async issue(user: AuthUser, accountId: string, ctx: RequestContext): Promise<CardView> {
    const customer = await this.users.findByIdOrThrow(user.id);
    if (customer.kyc?.status !== KycStatus.VERIFIED) {
      throw new AppException(
        ErrorCode.KYC_REQUIRED,
        'Cards are issued once your KYC is verified',
        HttpStatus.FORBIDDEN,
      );
    }
    const account = isValidObjectId(accountId)
      ? await this.accounts.findOne({ _id: accountId, customerId: user.id }).lean()
      : null;
    if (!account) throw AppException.notFound('Account');
    if (account.status !== AccountStatus.ACTIVE) {
      throw AppException.unprocessable(
        ErrorCode.ACCOUNT_NOT_ACTIVE,
        'Cards can only be linked to an active account',
      );
    }
    const existing = await this.cards.exists({
      accountId: account._id,
      status: { $ne: CardStatus.HOTLISTED },
    });
    if (existing) throw AppException.conflict('This account already has a debit card');

    const issued = new Date();
    const expiry = `${String((issued.getFullYear() + 5) % 100).padStart(2, '0')}${String(issued.getMonth() + 1).padStart(2, '0')}`;
    let card: CardDocument | null = null;
    for (let attempt = 0; attempt < 5 && !card; attempt++) {
      const id = new Types.ObjectId();
      const pan = this.security.generatePan();
      try {
        card = await this.cards.create({
          _id: id,
          customerId: customer._id,
          accountId: account._id,
          panEncrypted: this.security.encryptPan(pan, id.toString()),
          panIndex: this.security.panIndex(pan),
          bin: this.security.bin,
          last4: pan.slice(-4),
          expiry,
          cardholderName: `${customer.firstName} ${customer.lastName}`.toUpperCase().slice(0, 26),
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error; // PAN collision: draw again
      }
    }
    if (!card) throw new Error('Could not generate a unique card number');

    await this.audit.record({
      action: AuditAction.CARD_ISSUED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'Card', id: card.id as string },
      context: ctx,
      details: { last4: card.last4, accountId, expiry: formatExpiry(expiry) },
    });
    await this.notifications.notify(user.id, {
      type: NotificationType.ACCOUNT,
      title: 'Your virtual debit card is ready',
      message: `RuPay card ending ${card.last4} is active. Set a PIN before using it at an ATM or shop.`,
      link: '/app/cards',
    });
    return this.view(card.toObject());
  }

  /** Step 1 of a sensitive card action: an OTP bound to this card and purpose. */
  async challenge(user: AuthUser, cardId: string, purpose: OtpPurpose): Promise<IssuedChallenge> {
    const card = await this.owned(user, cardId);
    if (card.status === CardStatus.HOTLISTED)
      throw AppException.unprocessable(ErrorCode.INVALID_STATE, 'This card is permanently blocked');
    const customer = await this.users.findByIdOrThrow(user.id);
    return this.otp.issue(
      { id: user.id, phone: customer.phone, mfaEnabled: Boolean(customer.mfa?.enabled) },
      purpose,
      this.contextHash(cardId, purpose),
      (code) =>
        purpose === 'CARD_REVEAL'
          ? `${code} is your Vinay Bank OTP to view the details of card XX${card.last4}. Never share it.`
          : `${code} is your Vinay Bank OTP to set the PIN of card XX${card.last4}. Never share it.`,
    );
  }

  /** Step 2: full card number, expiry and CVV, after OTP verification. Nothing is cached. */
  async reveal(
    user: AuthUser,
    cardId: string,
    challengeId: string,
    code: string,
    ctx: RequestContext,
  ): Promise<RevealedCard> {
    const card = await this.owned(user, cardId);
    await this.otp.verify(challengeId, user.id, code, this.contextHash(cardId, 'CARD_REVEAL'));
    const pan = this.security.decryptPan(card.panEncrypted, card.id as string);
    await this.audit.record({
      action: AuditAction.CARD_DETAILS_REVEALED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'Card', id: card.id as string },
      context: ctx,
      details: { last4: card.last4 },
    });
    return {
      pan,
      expiry: formatExpiry(card.expiry),
      cvv: this.security.cvv(pan, card.expiry),
      cardholderName: card.cardholderName,
    };
  }

  async setPin(
    user: AuthUser,
    cardId: string,
    challengeId: string,
    code: string,
    pin: string,
    ctx: RequestContext,
  ): Promise<CardView> {
    const card = await this.owned(user, cardId);
    if (card.status === CardStatus.HOTLISTED)
      throw AppException.unprocessable(ErrorCode.INVALID_STATE, 'This card is permanently blocked');
    if (isWeakPin(pin)) {
      throw AppException.validation([
        {
          field: 'pin',
          messages: ['Choose a PIN that is not a repeated digit or a sequence such as 1234'],
        },
      ]);
    }
    await this.otp.verify(challengeId, user.id, code, this.contextHash(cardId, 'CARD_PIN'));
    const pan = this.security.decryptPan(card.panEncrypted, card.id as string);
    card.pinVerificationValue = this.security.pinVerificationValue(pan, pin);
    card.pinTries = 0;
    card.pinChangedAt = new Date();
    await card.save();
    await this.audit.record({
      action: AuditAction.CARD_PIN_SET,
      actor: { id: user.id, role: user.role },
      entity: { type: 'Card', id: card.id as string },
      context: ctx,
      details: { last4: card.last4 },
    });
    await this.notifications.notify(user.id, {
      type: NotificationType.SECURITY,
      title: 'Card PIN set',
      message: `The PIN for card ending ${card.last4} was set. If this was not you, block the card now.`,
      link: '/app/cards',
    });
    return this.view(card.toObject());
  }

  async updateSettings(
    user: AuthUser,
    cardId: string,
    dto: UpdateCardSettingsDto,
    ctx: RequestContext,
  ): Promise<CardView> {
    const card = await this.owned(user, cardId);
    if (card.status === CardStatus.HOTLISTED)
      throw AppException.unprocessable(ErrorCode.INVALID_STATE, 'This card is permanently blocked');
    const before = {
      controls: { ...card.toObject().controls },
      limits: { ...card.toObject().limits },
    };
    for (const [key, value] of Object.entries(dto.controls ?? {})) {
      if (typeof value === 'boolean') card.controls[key as keyof typeof card.controls] = value;
    }
    for (const [key, value] of Object.entries(dto.limits ?? {})) {
      if (typeof value === 'number') card.limits[key as keyof typeof card.limits] = value;
    }
    card.markModified('controls');
    card.markModified('limits');
    await card.save();
    await this.audit.record({
      action: AuditAction.CARD_LIMITS_UPDATED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'Card', id: card.id as string },
      context: ctx,
      details: { last4: card.last4, before, after: { controls: dto.controls, limits: dto.limits } },
    });
    return this.view(card.toObject());
  }

  /** Temporary block (and unblock) by the customer. */
  async setBlocked(
    user: AuthUser,
    cardId: string,
    blocked: boolean,
    ctx: RequestContext,
  ): Promise<CardView> {
    const card = await this.owned(user, cardId);
    if (card.status === CardStatus.HOTLISTED)
      throw AppException.unprocessable(ErrorCode.INVALID_STATE, 'This card is permanently blocked');
    const status = blocked ? CardStatus.BLOCKED : CardStatus.ACTIVE;
    if (card.status !== status) {
      const previous = card.status;
      card.status = status;
      card.statusReason = blocked ? 'Temporarily blocked by the customer' : undefined;
      await card.save();
      await this.audit.record({
        action: AuditAction.CARD_STATUS_CHANGED,
        actor: { id: user.id, role: user.role },
        entity: { type: 'Card', id: card.id as string },
        context: ctx,
        details: { last4: card.last4, from: previous, to: status },
      });
    }
    return this.view(card.toObject());
  }

  /** Permanent block for a lost, stolen or damaged card. A new card can then be issued. */
  async hotlist(
    user: AuthUser,
    cardId: string,
    dto: HotlistCardDto,
    ctx: RequestContext,
  ): Promise<CardView> {
    const card = await this.owned(user, cardId);
    if (card.status === CardStatus.HOTLISTED) return this.view(card.toObject());
    const previous = card.status;
    card.status = CardStatus.HOTLISTED;
    card.hotlistReason = dto.reason;
    card.statusReason = `Reported ${dto.reason.toLowerCase()} on ${istDateStamp().replace(/(\d{4})(\d{2})(\d{2})/, '$3-$2-$1')}`;
    await card.save();
    await this.audit.record({
      action: AuditAction.CARD_STATUS_CHANGED,
      actor: { id: user.id, role: user.role },
      entity: { type: 'Card', id: card.id as string },
      context: ctx,
      details: { last4: card.last4, from: previous, to: CardStatus.HOTLISTED, reason: dto.reason },
    });
    await this.notifications.notify(user.id, {
      type: NotificationType.SECURITY,
      title: 'Card permanently blocked',
      message: `Card ending ${card.last4} was reported ${dto.reason.toLowerCase()} and can no longer be used. You can get a new card from the Cards page.`,
      link: '/app/cards',
    });
    return this.view(card.toObject());
  }

  private contextHash(cardId: string, purpose: OtpPurpose): string {
    return sha256Hex(`card:${cardId}:${purpose}`);
  }

  private async owned(user: AuthUser, cardId: string): Promise<CardDocument> {
    const card = isValidObjectId(cardId)
      ? await this.cards.findOne({ _id: cardId, customerId: user.id })
      : null;
    if (!card) throw AppException.notFound('Card');
    return card;
  }
}
