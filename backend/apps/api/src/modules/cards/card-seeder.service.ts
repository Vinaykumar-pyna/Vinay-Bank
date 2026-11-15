import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { AccountStatus, AccountType } from '../../common/enums/banking.enums';
import { AppException } from '../../common/exceptions/app.exception';
import type { AppConfig } from '../../config/configuration';
import { Account } from '../accounts/schemas/account.schema';
import { DEMO_CARD_HOLDERS, DEMO_CARD_PIN } from '../seed/demo-data';
import { KycStatus, User } from '../users/user.schema';
import { formatExpiry } from './card.mapper';
import { CardSecurityService } from './card-security.service';
import { Card, CardStatus } from './schemas/card.schema';

/**
 * Demo debit cards for the ATM/POS simulator. Runs on start-up when demo data
 * is enabled and no card exists yet, so databases seeded before cards existed
 * get them too. Never runs in tests or production data.
 */
@Injectable()
export class CardSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(CardSeeder.name);

  constructor(
    @InjectModel(Card.name) private readonly cards: Model<Card>,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly security: CardSecurityService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const enabled = this.config.get('seedDemoData', { infer: true });
    if (!enabled || this.config.get('env', { infer: true }) !== 'development') return;
    await this.seedDemoCards();
  }

  async seedDemoCards(): Promise<void> {
    if ((await this.cards.estimatedDocumentCount()) > 0) return;
    const holders = await this.users
      .find({ email: { $in: DEMO_CARD_HOLDERS }, 'kyc.status': KycStatus.VERIFIED })
      .lean();
    const issued = new Date();
    const expiry = `${String((issued.getFullYear() + 5) % 100).padStart(2, '0')}${String(issued.getMonth() + 1).padStart(2, '0')}`;
    let count = 0;
    for (const holder of holders) {
      const account = await this.accounts
        .findOne({
          customerId: holder._id,
          status: AccountStatus.ACTIVE,
          type: AccountType.SAVINGS,
        })
        .sort({ createdAt: 1 })
        .lean();
      if (!account) continue;
      const id = new Types.ObjectId();
      const pan = this.security.generatePan();
      await this.cards.create({
        _id: id,
        customerId: holder._id,
        accountId: account._id,
        panEncrypted: this.security.encryptPan(pan, id.toString()),
        panIndex: this.security.panIndex(pan),
        bin: this.security.bin,
        last4: pan.slice(-4),
        expiry,
        cardholderName: `${holder.firstName} ${holder.lastName}`.toUpperCase(),
        pinVerificationValue: this.security.pinVerificationValue(pan, DEMO_CARD_PIN),
        pinChangedAt: issued,
      });
      count++;
    }
    if (count) this.logger.log(`Issued ${count} demo debit card(s) (PIN in the README)`);
  }

  /** The first demo customer's card number and expiry, for the simulator's "use demo card" button. */
  async demoCard(): Promise<{
    pan: string;
    expiry: string;
    cardholderName: string;
    last4: string;
  }> {
    const holder = await this.users.findOne({ email: DEMO_CARD_HOLDERS[0] }).lean();
    const card = holder
      ? await this.cards
          .findOne({ customerId: holder._id, status: { $ne: CardStatus.HOTLISTED } })
          .sort({ createdAt: 1 })
          .lean()
      : null;
    if (!card) throw AppException.notFound('Demo card');
    return {
      pan: this.security.decryptPan(card.panEncrypted, card._id.toString()),
      expiry: formatExpiry(card.expiry),
      cardholderName: card.cardholderName,
      last4: card.last4,
    };
  }
}
