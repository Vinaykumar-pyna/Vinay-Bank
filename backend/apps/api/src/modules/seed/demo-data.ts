import { Role } from '../../common/enums/role.enum';
import { KycStatus } from '../users/user.schema';

/**
 * Demo data for local development and walkthroughs.
 * These are test credentials for a local, non-production database only.
 */
export const DEMO_PASSWORD = 'Demo@1234';

/** Demo debit cards are issued to these customers, with this PIN, for the ATM/POS simulator. */
export const DEMO_CARD_PIN = '4826';
export const DEMO_CARD_HOLDERS = ['priya@example.com', 'rahul@example.com'];

export interface DemoStaff {
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  employeeId: string;
  branchCode: string;
}

export interface DemoCustomer {
  key: 'priya' | 'rahul' | 'ananya';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  pan: string;
  dateOfBirth: string;
  kycStatus: KycStatus;
  address: { line1: string; city: string; state: string; pincode: string };
}

export const DEMO_STAFF: DemoStaff[] = [
  {
    role: Role.ADMIN,
    firstName: 'Aarav',
    lastName: 'Mehta',
    email: 'admin@vinaybank.test',
    phone: '9000000001',
    employeeId: 'EMP0001',
    branchCode: '0001',
  },
  {
    role: Role.MANAGER,
    firstName: 'Kavya',
    lastName: 'Iyer',
    email: 'manager@vinaybank.test',
    phone: '9000000002',
    employeeId: 'EMP0002',
    branchCode: '0001',
  },
  {
    role: Role.TELLER,
    firstName: 'Rohan',
    lastName: 'Das',
    email: 'teller@vinaybank.test',
    phone: '9000000003',
    employeeId: 'EMP0003',
    branchCode: '0001',
  },
];

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    key: 'priya',
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya@example.com',
    phone: '9876543210',
    pan: 'ABCPS1234K',
    dateOfBirth: '1994-05-12',
    kycStatus: KycStatus.VERIFIED,
    address: {
      line1: '12, Lake View Apartments, Koregaon Park',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    },
  },
  {
    key: 'rahul',
    firstName: 'Rahul',
    lastName: 'Verma',
    email: 'rahul@example.com',
    phone: '9876501234',
    pan: 'BQRPV5678L',
    dateOfBirth: '1990-09-03',
    kycStatus: KycStatus.VERIFIED,
    address: {
      line1: '45, 3rd Cross, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
    },
  },
  {
    key: 'ananya',
    firstName: 'Ananya',
    lastName: 'Gupta',
    email: 'ananya@example.com',
    phone: '9812345670',
    pan: 'CXYPG4321M',
    dateOfBirth: '1998-01-21',
    kycStatus: KycStatus.PENDING,
    address: {
      line1: 'B-204, Green Park Extension',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110016',
    },
  },
];
