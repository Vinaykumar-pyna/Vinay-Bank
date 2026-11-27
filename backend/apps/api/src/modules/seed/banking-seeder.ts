import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { istDateStamp, maskAccountNumber, randomDigits } from '@app/shared';
import { BANK_NAME } from '../../common/constants/app.constants';
import {
  AccountStatus,
  AccountType,
  Category,
  Channel,
  PaymentRail,
  PostingDirection,
  TransactionStatus,
  TransactionType,
} from '../../common/enums/banking.enums';
import { Role } from '../../common/enums/role.enum';
import { AccountsService } from '../accounts/accounts.service';
import type { AccountDocument } from '../accounts/schemas/account.schema';
import { Posting } from '../accounts/schemas/posting.schema';
import { Beneficiary } from '../beneficiaries/beneficiary.schema';
import { Transaction } from '../transactions/schemas/transaction.schema';
import type { UserDocument } from '../users/user.schema';
import { createRng, MERCHANTS, type LedgerEvent, type Rng } from './demo-banking';

const RUPEE = 100;
const DAY = 86_400_000;

interface SeededAccount {
  doc: AccountDocument;
  owner: UserDocument;
  balance: number;
}

/**
 * Builds realistic demo banking data: accounts, payees and six months of
 * history (salary, rent, bills, card spends, ATM, transfers, interest) with
 * exact running balances.
 */
@Injectable()
export class BankingSeeder {
  private readonly logger = new Logger(BankingSeeder.name);

  constructor(
    private readonly accounts: AccountsService,
    @InjectModel(Transaction.name) private readonly transactions: Model<Transaction>,
    @InjectModel(Posting.name) private readonly postings: Model<Posting>,
    @InjectModel(Beneficiary.name) private readonly beneficiaries: Model<Beneficiary>,
  ) {}

  async seed(customers: Record<'priya' | 'rahul' | 'ananya', UserDocument>): Promise<void> {
    const rng = createRng(20261113);
    const now = new Date();
    const start = new Date(now.getTime() - 180 * DAY);

    const open = async (
      owner: UserDocument,
      type: AccountType,
      branchCode: string,
      nickname: string,
    ) => {
      const doc = await this.accounts.open({
        customerId: owner._id,
        type,
        status: AccountStatus.ACTIVE,
        branchCode,
        nickname,
      });
      // Raw driver update: Mongoose treats createdAt as immutable, but demo accounts need history.
      const openedAt = new Date(start.getTime() - 400 * DAY);
      await this.accounts.model.collection.updateOne(
        { _id: doc._id },
        { $set: { createdAt: openedAt, openedAt } },
      );
      return doc;
    };

    const accounts: Record<string, SeededAccount> = {
      priyaSavings: {
        doc: await open(customers.priya, AccountType.SAVINGS, '0002', 'Salary account'),
        owner: customers.priya,
        balance: 120_000 * RUPEE,
      },
      priyaCurrent: {
        doc: await open(customers.priya, AccountType.CURRENT, '0001', 'Freelance'),
        owner: customers.priya,
        balance: 40_000 * RUPEE,
      },
      rahulSavings: {
        doc: await open(customers.rahul, AccountType.SAVINGS, '0003', 'Savings'),
        owner: customers.rahul,
        balance: 65_000 * RUPEE,
      },
      ananyaSavings: {
        doc: await open(customers.ananya, AccountType.SAVINGS, '0004', 'Savings'),
        owner: customers.ananya,
        balance: 8_000 * RUPEE,
      },
    };

    const events = this.buildEvents(rng, accounts, start, now);
    await this.writeHistory(events, accounts, start);
    await this.seedBeneficiaries(customers, accounts, now);
    this.logger.log(
      `Seeded ${Object.keys(accounts).length} accounts and ${events.length} transactions`,
    );
  }

  private buildEvents(
    rng: Rng,
    accounts: Record<string, SeededAccount>,
    start: Date,
    now: Date,
  ): LedgerEvent[] {
    const events: LedgerEvent[] = [];
    const at = (monthStart: Date, day: number, hour = rng.int(8, 21)) => {
      const date = new Date(monthStart);
      date.setUTCDate(day);
      date.setUTCHours(hour - 5, rng.int(0, 59), rng.int(0, 59), 0); // IST hours to UTC
      return date;
    };
    const external = (name: string, bankName = 'HDFC Bank') => ({
      name,
      accountNumber: `5020${randomDigits(10)}`,
      bankName,
    });
    const merchant = (name: string) => ({
      name,
      accountNumber: '000000000000',
      bankName: 'Card network',
    });
    const acct = (key: string) => accounts[key].doc;
    const holder = (key: string) =>
      `${accounts[key].owner.firstName} ${accounts[key].owner.lastName}`;

    for (let m = 5; m >= 0; m--) {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
      const people = [
        {
          key: 'priyaSavings',
          employer: 'Infosys Ltd',
          salary: 85_000,
          rent: 22_000,
          landlord: 'Suresh Patil',
          spends: [9, 13] as const,
        },
        {
          key: 'rahulSavings',
          employer: 'Wipro Ltd',
          employerBank: 'Bank of Baroda',
          salary: 110_000,
          rent: 28_000,
          landlord: 'Lakshmi Rao',
          spends: [8, 12] as const,
        },
        {
          key: 'ananyaSavings',
          employer: 'IIT Delhi (stipend)',
          salary: 25_000,
          rent: 0,
          landlord: '',
          spends: [3, 6] as const,
        },
      ];
      for (const person of people) {
        const monthLabel = monthStart.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });
        events.push({
          at: at(monthStart, 1, 10),
          type: TransactionType.SALARY_CREDIT,
          rail: PaymentRail.NEFT,
          channel: Channel.SYSTEM,
          category: Category.SALARY,
          amount: person.salary * RUPEE,
          credit: person.key,
          counterparty: external(person.employer, person.employerBank),
          narrationCredit: `NEFT CR - ${person.employer} - Salary ${monthLabel}`,
        });
        if (person.rent) {
          events.push({
            at: at(monthStart, 3, 9),
            type: TransactionType.TRANSFER,
            rail: PaymentRail.IMPS,
            channel: Channel.NET_BANKING,
            category: Category.RENT,
            amount: person.rent * RUPEE,
            debit: person.key,
            counterparty: {
              ...external(person.landlord, 'State Bank of India'),
              ifsc: 'SBIN0000300',
            },
            narrationDebit: `IMPS to ${person.landlord} (State Bank of India) - Rent ${monthLabel}`,
          });
        }
        events.push({
          at: at(monthStart, 5),
          type: TransactionType.BILL_PAYMENT,
          rail: PaymentRail.INTERNAL,
          channel: Channel.NET_BANKING,
          category: Category.BILLS,
          amount: rng.int(900, 2600) * RUPEE,
          debit: person.key,
          counterparty: merchant('Electricity board'),
          narrationDebit: 'BillPay - Electricity bill',
        });
        events.push({
          at: at(monthStart, 7),
          type: TransactionType.BILL_PAYMENT,
          rail: PaymentRail.INTERNAL,
          channel: Channel.NET_BANKING,
          category: Category.BILLS,
          amount: rng.pick([399, 599, 799]) * RUPEE,
          debit: person.key,
          counterparty: merchant('Airtel'),
          narrationDebit: 'BillPay - Airtel postpaid',
        });
        const spendCount = rng.int(person.spends[0], person.spends[1]);
        for (let i = 0; i < spendCount; i++) {
          const shop = rng.pick(MERCHANTS);
          events.push({
            at: at(monthStart, rng.int(2, 28)),
            type: TransactionType.CARD_PAYMENT,
            rail: PaymentRail.CARD,
            channel: Channel.POS,
            category: shop.category,
            amount: rng.int(shop.min, shop.max) * RUPEE,
            debit: person.key,
            counterparty: merchant(shop.name),
            narrationDebit: `POS/ECOM ${shop.name}`,
          });
        }
        events.push({
          at: at(monthStart, rng.int(9, 24)),
          type: TransactionType.ATM_WITHDRAWAL,
          rail: PaymentRail.CARD,
          channel: Channel.ATM,
          category: Category.CASH,
          amount: rng.pick([1000, 2000, 3000, 5000]) * RUPEE,
          debit: person.key,
          counterparty: merchant('Vinay Bank ATM'),
          narrationDebit: 'ATM WDL - Vinay Bank ATM',
        });
        if (person.key !== 'ananyaSavings') {
          events.push({
            at: at(monthStart, 10, 7),
            type: TransactionType.BILL_PAYMENT,
            rail: PaymentRail.INTERNAL,
            channel: Channel.SYSTEM,
            category: Category.INVESTMENT,
            amount: 5_000 * RUPEE,
            debit: person.key,
            counterparty: merchant('Axis Mutual Fund'),
            narrationDebit: 'ACH DR - Axis Bluechip Fund SIP',
          });
        }
        events.push({
          at: at(monthStart, 28, 6),
          type: TransactionType.INTEREST_CREDIT,
          rail: PaymentRail.SYSTEM,
          channel: Channel.SYSTEM,
          category: Category.INTEREST,
          amount: rng.int(120, 480) * RUPEE,
          credit: person.key,
          counterparty: { name: BANK_NAME, accountNumber: '000100000000' },
          narrationCredit: 'Savings account interest credit',
        });
      }

      // Priya moves money to her own current account, and splits a bill with Rahul.
      events.push({
        at: at(monthStart, 15, 20),
        type: TransactionType.TRANSFER,
        rail: PaymentRail.INTERNAL,
        channel: Channel.NET_BANKING,
        category: Category.TRANSFER,
        amount: 10_000 * RUPEE,
        debit: 'priyaSavings',
        credit: 'priyaCurrent',
        counterparty: { name: 'Own account', accountNumber: acct('priyaCurrent').accountNumber },
        narrationDebit: `Transfer to own account ${maskAccountNumber(acct('priyaCurrent').accountNumber)}`,
        narrationCredit: `Transfer from own account ${maskAccountNumber(acct('priyaSavings').accountNumber)}`,
      });
      const split = rng.int(1200, 4200) * RUPEE;
      events.push({
        at: at(monthStart, rng.int(16, 26), 22),
        type: TransactionType.TRANSFER,
        rail: PaymentRail.INTERNAL,
        channel: Channel.NET_BANKING,
        category: Category.FAMILY,
        amount: split,
        debit: 'priyaSavings',
        credit: 'rahulSavings',
        counterparty: {
          name: holder('rahulSavings'),
          accountNumber: acct('rahulSavings').accountNumber,
        },
        narrationDebit: `To ${holder('rahulSavings')} (Vinay Bank) - Dinner split`,
        narrationCredit: `From ${holder('priyaSavings')} (Vinay Bank) - Dinner split`,
        remarks: 'Dinner split',
      });
      // Freelance income into Priya's current account.
      events.push({
        at: at(monthStart, rng.int(18, 27), 16),
        type: TransactionType.TRANSFER,
        rail: PaymentRail.NEFT,
        channel: Channel.SYSTEM,
        category: Category.SALARY,
        amount: rng.int(15_000, 42_000) * RUPEE,
        credit: 'priyaCurrent',
        counterparty: external('Pixel Studio LLP', 'ICICI Bank'),
        narrationCredit: 'NEFT CR - Pixel Studio LLP - Design invoice',
      });
    }

    return events
      .filter((event) => event.at.getTime() < now.getTime() - 60_000 && event.at >= start)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  private async writeHistory(
    events: LedgerEvent[],
    accounts: Record<string, SeededAccount>,
    start: Date,
  ) {
    const txnDocs: Partial<Transaction & { _id: Types.ObjectId }>[] = [];
    const postingDocs: Partial<Posting>[] = [];

    // Opening balances as a single credit on the start date.
    for (const account of Object.values(accounts)) {
      const id = new Types.ObjectId();
      const reference = `VB${istDateStamp(start).slice(2)}${randomDigits(8)}`;
      txnDocs.push({
        _id: id,
        reference,
        type: TransactionType.CASH_DEPOSIT,
        rail: PaymentRail.CASH,
        channel: Channel.BRANCH,
        status: TransactionStatus.COMPLETED,
        amount: account.balance,
        to: this.party(account),
        initiatedBy: account.owner._id,
        initiatorRole: Role.TELLER,
        fee: 0,
        currency: 'INR',
        ledgerPosted: false,
        category: Category.OTHER,
        remarks: 'Balance brought forward',
        completedAt: start,
        createdAt: start,
        updatedAt: start,
      });
      postingDocs.push({
        accountId: account.doc._id,
        transactionId: id,
        reference,
        direction: PostingDirection.CREDIT,
        amount: account.balance,
        balanceAfter: account.balance,
        narration: 'Balance brought forward',
        category: Category.OTHER,
        channel: Channel.BRANCH,
        selfTransfer: false,
        createdAt: start,
      });
    }

    for (const event of events) {
      const debit = event.debit ? accounts[event.debit] : undefined;
      const credit = event.credit ? accounts[event.credit] : undefined;
      if (debit && debit.balance - event.amount < 500 * RUPEE) continue; // never overdraw demo accounts
      const id = new Types.ObjectId();
      const reference = `VB${istDateStamp(event.at).slice(2)}${randomDigits(8)}`;
      const selfTransfer = Boolean(debit && credit && debit.owner._id.equals(credit.owner._id));
      txnDocs.push({
        _id: id,
        reference,
        type: event.type,
        rail: event.rail,
        channel: event.channel,
        status: TransactionStatus.COMPLETED,
        amount: event.amount,
        fee: 0,
        currency: 'INR',
        ledgerPosted: false,
        from: debit ? this.party(debit) : { ...event.counterparty },
        to: credit ? this.party(credit) : { ...event.counterparty },
        initiatedBy: (debit ?? credit)!.owner._id,
        initiatorRole: Role.CUSTOMER,
        category: event.category,
        remarks: event.remarks,
        risk:
          debit && event.type === TransactionType.TRANSFER
            ? { score: 0, level: 'LOW', decision: 'ALLOW', reasons: [], source: 'LOCAL_RULES' }
            : undefined,
        completedAt: event.at,
        createdAt: event.at,
        updatedAt: event.at,
      });
      if (debit) {
        debit.balance -= event.amount;
        postingDocs.push({
          accountId: debit.doc._id,
          transactionId: id,
          reference,
          direction: PostingDirection.DEBIT,
          amount: event.amount,
          balanceAfter: debit.balance,
          narration: event.narrationDebit ?? event.counterparty.name,
          counterpartyName: credit
            ? `${credit.owner.firstName} ${credit.owner.lastName}`
            : event.counterparty.name,
          counterpartyAccount: maskAccountNumber(event.counterparty.accountNumber),
          category: event.category,
          channel: event.channel,
          selfTransfer,
          createdAt: event.at,
        });
      }
      if (credit) {
        credit.balance += event.amount;
        postingDocs.push({
          accountId: credit.doc._id,
          transactionId: id,
          reference,
          direction: PostingDirection.CREDIT,
          amount: event.amount,
          balanceAfter: credit.balance,
          narration: event.narrationCredit ?? event.counterparty.name,
          counterpartyName: debit
            ? `${debit.owner.firstName} ${debit.owner.lastName}`
            : event.counterparty.name,
          counterpartyAccount: maskAccountNumber(event.counterparty.accountNumber),
          category: credit && debit && !selfTransfer ? Category.TRANSFER : event.category,
          channel: event.channel,
          selfTransfer,
          createdAt: event.at,
        });
      }
    }

    // Historical rows carry their own timestamps, so they are written with the raw driver
    // (Mongoose would stamp them with the current time).
    await this.transactions.collection.insertMany(txnDocs, { ordered: true });
    await this.postings.collection.insertMany(postingDocs, { ordered: true });
    for (const account of Object.values(accounts)) {
      await this.accounts.model.updateOne(
        { _id: account.doc._id },
        { $set: { ledgerBalance: account.balance } },
      );
    }
  }

  private async seedBeneficiaries(
    customers: Record<'priya' | 'rahul' | 'ananya', UserDocument>,
    accounts: Record<string, SeededAccount>,
    now: Date,
  ) {
    const old = new Date(now.getTime() - 120 * DAY);
    const rahul = accounts.rahulSavings.doc;
    const priya = accounts.priyaSavings.doc;
    const rows = [
      {
        ownerId: customers.priya._id,
        name: 'Rahul Verma',
        nickname: 'Rahul',
        accountNumber: rahul.accountNumber,
        ifsc: rahul.ifsc,
        bankName: BANK_NAME,
        branchName: 'Bengaluru Indiranagar',
        isInternal: true,
        internalAccountId: rahul._id,
        coolingUntil: old,
        createdAt: old,
      },
      {
        ownerId: customers.priya._id,
        name: 'Suresh Patil',
        nickname: 'Landlord',
        accountNumber: '30412987654321',
        ifsc: 'SBIN0000300',
        bankName: 'State Bank of India',
        branchName: 'Mumbai Main Branch',
        isInternal: false,
        coolingUntil: old,
        createdAt: old,
      },
      {
        ownerId: customers.priya._id,
        name: 'Amit Kulkarni',
        accountNumber: '50100234567812',
        ifsc: 'HDFC0000240',
        bankName: 'HDFC Bank',
        branchName: 'Mumbai - Sandoz House',
        isInternal: false,
        coolingUntil: old,
        createdAt: old,
      },
      {
        ownerId: customers.priya._id,
        name: 'Neha Joshi',
        nickname: 'Sister',
        accountNumber: '29080100004567',
        ifsc: 'BARB0ANDHER',
        bankName: 'Bank of Baroda',
        branchName: 'Mumbai - Andheri',
        isInternal: false,
        coolingUntil: old,
        createdAt: old,
      },
      {
        ownerId: customers.priya._id,
        name: 'Old Landlord',
        nickname: 'Closed account (NEFT return demo)',
        accountNumber: '002201550000',
        ifsc: 'ICIC0000001',
        bankName: 'ICICI Bank',
        branchName: 'Mumbai Nariman Point',
        isInternal: false,
        coolingUntil: old,
        createdAt: old,
      },
      {
        ownerId: customers.rahul._id,
        name: 'Priya Sharma',
        nickname: 'Priya',
        accountNumber: priya.accountNumber,
        ifsc: priya.ifsc,
        bankName: BANK_NAME,
        branchName: 'Pune Koregaon Park',
        isInternal: true,
        internalAccountId: priya._id,
        coolingUntil: old,
        createdAt: old,
      },
    ].map((row) => ({ ...row, status: 'ACTIVE', updatedAt: old }));
    await this.beneficiaries.collection.insertMany(rows);
  }

  private party(account: SeededAccount) {
    return {
      accountId: account.doc._id,
      accountNumber: account.doc.accountNumber,
      ifsc: account.doc.ifsc,
      name: `${account.owner.firstName} ${account.owner.lastName}`,
      bankName: BANK_NAME,
      customerId: account.owner._id,
    };
  }
}
