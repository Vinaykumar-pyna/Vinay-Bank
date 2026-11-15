import { MongoSanitizePipe, stripMongoOperators } from './mongo-sanitize.pipe';

describe('stripMongoOperators', () => {
  it('removes operator keys used for NoSQL injection', () => {
    const malicious = { email: { $ne: null }, password: { $gt: '' } };
    expect(stripMongoOperators(malicious)).toEqual({ email: {}, password: {} });
  });

  it('removes dotted keys and cleans nested objects and arrays', () => {
    const input = {
      name: 'Priya',
      'profile.role': 'ADMIN',
      tags: [{ $where: 'sleep(1000)', ok: true }],
      address: { city: 'Pune', $set: { city: 'X' } },
    };
    expect(stripMongoOperators(input)).toEqual({
      name: 'Priya',
      tags: [{ ok: true }],
      address: { city: 'Pune' },
    });
  });

  it('leaves primitives, dates and buffers untouched', () => {
    const date = new Date();
    expect(stripMongoOperators('$ne')).toBe('$ne');
    expect(stripMongoOperators(42)).toBe(42);
    expect(stripMongoOperators(date)).toBe(date);
    expect(stripMongoOperators(null)).toBeNull();
  });

  it('does not mutate the original object', () => {
    const input = { a: { $gt: 1 } };
    stripMongoOperators(input);
    expect(input).toEqual({ a: { $gt: 1 } });
  });
});

describe('MongoSanitizePipe', () => {
  const pipe = new MongoSanitizePipe();

  it('sanitizes body, query and params', () => {
    expect(pipe.transform({ q: { $regex: '.*' } }, { type: 'query' })).toEqual({ q: {} });
    expect(pipe.transform({ a: 1, $or: [] }, { type: 'body' })).toEqual({ a: 1 });
  });

  it('skips custom decorators such as @CurrentUser()', () => {
    const user = { $internal: true };
    expect(pipe.transform(user, { type: 'custom' })).toBe(user);
  });
});
