import { canonicalJson } from './canonical-json';

describe('canonicalJson', () => {
  it('produces the same output regardless of key order', () => {
    const a = { b: 1, a: { d: [3, { y: 2, x: 1 }], c: 'x' } };
    const b = { a: { c: 'x', d: [3, { x: 1, y: 2 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":"x","d":[3,{"x":1,"y":2}]},"b":1}');
  });

  it('serializes dates as ISO strings and drops undefined values', () => {
    const date = new Date('2026-11-13T10:00:00.000Z');
    expect(canonicalJson({ at: date, skip: undefined })).toBe('{"at":"2026-11-13T10:00:00.000Z"}');
  });

  it('uses toJSON for non-plain objects such as ObjectId', () => {
    class FakeObjectId {
      toJSON() {
        return '65f0c0ffee';
      }
    }
    expect(canonicalJson({ id: new FakeObjectId() })).toBe('{"id":"65f0c0ffee"}');
  });

  it('normalizes non-finite numbers and nulls', () => {
    expect(canonicalJson({ n: Number.NaN, z: null })).toBe('{"n":null,"z":null}');
  });
});
