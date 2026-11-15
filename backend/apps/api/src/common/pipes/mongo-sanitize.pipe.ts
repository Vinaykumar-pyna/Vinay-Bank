import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

const MAX_DEPTH = 20;

/**
 * Recursively removes keys that MongoDB could interpret as query operators
 * (`$gt`, `$where`, ...) or as nested paths (`a.b`). Returns a sanitized copy.
 */
export function stripMongoOperators<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripMongoOperators(item, depth + 1)) as T;
  }
  const clean: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) continue;
    clean[key] = stripMongoOperators(child, depth + 1);
  }
  return clean as T;
}

/**
 * Defence in depth against NoSQL injection, e.g. `{"email": {"$ne": null}}`.
 * DTO validation already rejects non-string values for string fields; this
 * pipe makes sure operator keys never reach a query even if a DTO is loose.
 * Runs before the ValidationPipe on body, query and route params.
 */
@Injectable()
export class MongoSanitizePipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type === 'custom') return value;
    return stripMongoOperators(value);
  }
}
