import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { maskTail } from '@app/shared';
import { Role } from '../../common/enums/role.enum';
import type { AppConfig } from '../../config/configuration';
import { PasswordService } from '../auth/password.service';
import { CountersService } from '../counters/counters.service';
import { FieldEncryptionService } from '../crypto/field-encryption.service';
import type { UserDocument } from '../users/user.schema';
import { KycStatus } from '../users/user.schema';
import { CardSeeder } from '../cards/card-seeder.service';
import { UsersService } from '../users/users.service';
import { BankingSeeder } from './banking-seeder';
import { DEMO_CUSTOMERS, DEMO_PASSWORD, DEMO_STAFF, type DemoCustomer } from './demo-data';

const CUSTOMER_ID_BASE = 100_000_000;

/**
 * Seeds demo users on first start (empty database, SEED_DEMO_DATA=true, never in tests).
 * Later phases extend it with accounts, transactions and cards.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly crypto: FieldEncryptionService,
    private readonly counters: CountersService,
    private readonly banking: BankingSeeder,
    private readonly cardSeeder: CardSeeder,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const enabled = this.config.get('seedDemoData', { infer: true });
    if (!enabled || this.config.get('env', { infer: true }) === 'test') return;
    if ((await this.users.model.estimatedDocumentCount()) > 0) return;
    await this.seed();
  }

  async seed(): Promise<void> {
    this.logger.log('Empty database detected: seeding demo data');
    const passwordHash = await this.passwords.hash(DEMO_PASSWORD);

    for (const staff of DEMO_STAFF) {
      await this.users.create({ ...staff, passwordHash, kyc: { status: KycStatus.VERIFIED } });
    }
    const reviewer = await this.users.model.findOne({ role: Role.MANAGER }).lean();
    const customers = {} as Record<DemoCustomer['key'], UserDocument>;
    for (const customer of DEMO_CUSTOMERS) {
      customers[customer.key] = await this.createCustomer(customer, passwordHash, reviewer?._id);
    }
    await this.banking.seed(customers);
    await this.cardSeeder.seedDemoCards();
    this.logger.log(
      `Seeded ${DEMO_STAFF.length} staff and ${DEMO_CUSTOMERS.length} customers (see README for demo sign-ins)`,
    );
  }

  private async createCustomer(
    customer: DemoCustomer,
    passwordHash: string,
    reviewerId?: Types.ObjectId,
  ): Promise<UserDocument> {
    const userId = new Types.ObjectId();
    const verified = customer.kycStatus === KycStatus.VERIFIED;
    return this.users.create({
      _id: userId,
      role: Role.CUSTOMER,
      email: customer.email,
      phone: customer.phone,
      passwordHash,
      firstName: customer.firstName,
      lastName: customer.lastName,
      dateOfBirth: new Date(customer.dateOfBirth),
      address: customer.address,
      customerId: String(CUSTOMER_ID_BASE + (await this.counters.next('customer'))),
      kyc: {
        status: customer.kycStatus,
        panEncrypted: this.crypto.encrypt(customer.pan, `user:${userId.toString()}:pan`),
        panMasked: maskTail(customer.pan, 4),
        panBlindIndex: this.crypto.blindIndex(customer.pan, 'pan'),
        ...(verified
          ? { reviewedBy: reviewerId, reviewedAt: new Date(), remarks: 'Video KYC completed' }
          : {}),
      },
    });
  }
}
