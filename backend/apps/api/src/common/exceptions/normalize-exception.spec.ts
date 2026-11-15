import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Error as MongooseError } from 'mongoose';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';
import { normalizeException } from './normalize-exception';

describe('normalizeException', () => {
  it('keeps the code, status and details of an AppException', () => {
    const ex = AppException.unprocessable(ErrorCode.INSUFFICIENT_FUNDS, 'Not enough balance', {
      available: 100,
    });
    expect(normalizeException(ex)).toEqual({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ErrorCode.INSUFFICIENT_FUNDS,
      message: 'Not enough balance',
      details: { available: 100 },
    });
  });

  it('maps built-in Nest HTTP exceptions to generic codes', () => {
    expect(normalizeException(new NotFoundException('Missing'))).toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'Missing',
      details: undefined,
    });
    expect(normalizeException(new BadRequestException(['a is bad', 'b is bad']))).toMatchObject({
      status: 400,
      code: ErrorCode.BAD_REQUEST,
      message: 'a is bad; b is bad',
    });
  });

  it('maps throttling to RATE_LIMITED', () => {
    expect(normalizeException(new ThrottlerException())).toMatchObject({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
    });
  });

  it('turns MongoDB duplicate key errors into 409 without leaking values', () => {
    const duplicate = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyPattern: { email: 1 },
      keyValue: { email: 'secret@example.com' },
    });
    const result = normalizeException(duplicate);
    expect(result).toMatchObject({
      status: 409,
      code: ErrorCode.DUPLICATE_RESOURCE,
      details: { fields: ['email'] },
    });
    expect(JSON.stringify(result)).not.toContain('secret@example.com');
  });

  it('maps Mongoose cast errors to INVALID_ID', () => {
    const cast = new MongooseError.CastError('ObjectId', 'not-an-id', '_id');
    expect(normalizeException(cast)).toMatchObject({ status: 400, code: ErrorCode.INVALID_ID });
  });

  it('maps body-parser JSON errors to MALFORMED_REQUEST', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    expect(normalizeException(parseError)).toMatchObject({
      status: 400,
      code: ErrorCode.MALFORMED_REQUEST,
    });
  });

  it('hides the details of unexpected errors', () => {
    const result = normalizeException(new Error('connection string mongodb://admin:pw@db'));
    expect(result.status).toBe(500);
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(result.message).not.toContain('mongodb://');
  });
});
