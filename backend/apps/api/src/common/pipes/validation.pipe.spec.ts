import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsString, Length, Min, ValidateNested } from 'class-validator';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-codes';
import { createValidationPipe } from './validation.pipe';

class AddressDto {
  @IsString()
  @Length(6, 6)
  pincode: string;
}

class CustomerDto {
  @IsEmail()
  email: string;

  @IsInt()
  @Min(18)
  age: number;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();
  const metadata = { type: 'body' as const, metatype: CustomerDto };

  it('returns a typed DTO instance for valid input', async () => {
    const result = await pipe.transform(
      { email: 'a@b.co', age: 30, address: { pincode: '411001' } },
      metadata,
    );
    expect(result).toBeInstanceOf(CustomerDto);
    expect(result.address).toBeInstanceOf(AddressDto);
  });

  it('flattens nested errors into field paths', async () => {
    const promise = pipe.transform(
      { email: 'nope', age: 12, address: { pincode: '12' } },
      metadata,
    );
    await expect(promise).rejects.toBeInstanceOf(AppException);
    const error = (await promise.catch((e: unknown) => e)) as AppException;
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    const fields = (error.details as { field: string }[]).map((d) => d.field);
    expect(fields).toEqual(['email', 'age', 'address.pincode']);
  });

  it('rejects unknown properties (mass-assignment protection)', async () => {
    const promise = pipe.transform(
      { email: 'a@b.co', age: 30, address: { pincode: '411001' }, role: 'ADMIN' },
      metadata,
    );
    const error = (await promise.catch((e: unknown) => e)) as AppException;
    expect(error).toBeInstanceOf(AppException);
    expect(JSON.stringify(error.details)).toContain('role');
  });
});
