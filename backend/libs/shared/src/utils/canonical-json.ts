/**
 * Deterministic JSON serialization: object keys are sorted recursively, so the
 * same logical value always produces the same string. Required before hashing or
 * signing data (audit hash chain, HMAC signatures), because plain JSON.stringify
 * depends on property insertion order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (typeof value === 'object') {
    const asObject = value as Record<string, unknown> & { toJSON?: () => unknown };
    // ObjectId, Decimal128 and similar types expose toJSON/toString.
    if (typeof asObject.toJSON === 'function' && asObject.constructor !== Object) {
      return normalize(asObject.toJSON());
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(asObject).sort()) {
      const child = asObject[key];
      if (child !== undefined && typeof child !== 'function') sorted[key] = normalize(child);
    }
    return sorted;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}
