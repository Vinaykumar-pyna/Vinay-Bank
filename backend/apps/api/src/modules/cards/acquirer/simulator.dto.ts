import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const SIMULATOR_OPERATIONS = [
  'ECHO',
  'BALANCE',
  'WITHDRAWAL',
  'PURCHASE',
  'REVERSAL',
] as const;
export type SimulatorOperation = (typeof SIMULATOR_OPERATIONS)[number];

const needsCard = (o: SimulatorRequestDto) => o.operation !== 'ECHO';
const needsPin = (o: SimulatorRequestDto) =>
  ['BALANCE', 'WITHDRAWAL'].includes(o.operation) ||
  (o.operation === 'PURCHASE' && o.pin !== undefined);
const needsAmount = (o: SimulatorRequestDto) =>
  o.operation === 'WITHDRAWAL' || o.operation === 'PURCHASE';

export class OriginalTransactionDto {
  @Matches(/^[A-Za-z0-9]{12}$/)
  rrn: string;

  @Matches(/^\d{6}$/)
  stan: string;

  /** Field 7 of the original request (MMDDhhmmss) */
  @Matches(/^\d{10}$/)
  transmittedAt: string;

  @IsIn(['WITHDRAWAL', 'PURCHASE'])
  operation: 'WITHDRAWAL' | 'PURCHASE';

  @IsInt()
  @Min(1)
  amount: number;
}

/** What a customer does at an ATM or shop terminal in the simulator. */
export class SimulatorRequestDto {
  @IsIn(SIMULATOR_OPERATIONS)
  operation: SimulatorOperation;

  @IsIn(['ATM', 'POS'])
  terminal: 'ATM' | 'POS';

  @ValidateIf(needsCard)
  @Matches(/^\d{13,19}$/, { message: 'Enter the card number (digits only)' })
  pan?: string;

  @ValidateIf((o: SimulatorRequestDto) => needsCard(o) && o.operation !== 'REVERSAL')
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'Enter the expiry as MM/YY' })
  expiry?: string;

  @ValidateIf(needsPin)
  @Matches(/^\d{4,6}$/, { message: 'Enter the 4-digit PIN' })
  pin?: string;

  /** Paise: Rs 100 to Rs 1,00,000 */
  @ValidateIf(needsAmount)
  @IsInt()
  @Min(100 * 100)
  @Max(1_00_000 * 100)
  amount?: number;

  /** The transaction being reversed (operation REVERSAL) */
  @ValidateIf((o: SimulatorRequestDto) => o.operation === 'REVERSAL')
  @ValidateNested()
  @Type(() => OriginalTransactionDto)
  original?: OriginalTransactionDto;

  @IsOptional()
  @Matches(/^[A-Za-z ,.'-]{3,40}$/)
  reason?: string;
}
