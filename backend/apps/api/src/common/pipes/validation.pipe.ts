import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException, FieldError } from '../exceptions/app.exception';

/** Flattens nested class-validator errors into `[{ field: 'address.pincode', messages }]`. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own: FieldError[] = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    const children = error.children?.length ? flattenValidationErrors(error.children, field) : [];
    return [...own, ...children];
  });
}

/**
 * Global validation:
 *  - whitelist: properties without validation decorators are stripped
 *  - forbidNonWhitelisted: unknown properties are rejected (mass-assignment protection)
 *  - transform: payloads are converted to DTO class instances with proper types
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => AppException.validation(flattenValidationErrors(errors)),
  });
}
