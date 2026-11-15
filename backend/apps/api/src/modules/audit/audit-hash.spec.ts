import {
  computeAuditHash,
  GENESIS_HASH,
  verifyAuditChain,
  type HashableAuditFields,
} from './audit-hash';

function buildChain(count: number) {
  const records: (HashableAuditFields & { prevHash: string; hash: string })[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= count; i++) {
    const fields: HashableAuditFields = {
      seq: i,
      at: new Date(Date.UTC(2026, 10, 13, 10, i)),
      action: 'TRANSFER_COMPLETED',
      outcome: 'SUCCESS',
      actorId: 'u1',
      details: { amount: i * 1000, to: 'XXXX1234' },
    };
    const hash = computeAuditHash(prev, fields);
    records.push({ ...fields, prevHash: prev, hash });
    prev = hash;
  }
  return records;
}

describe('audit hash chain', () => {
  it('verifies an intact chain', () => {
    const result = verifyAuditChain(buildChain(5));
    expect(result).toMatchObject({ valid: true, checked: 5 });
  });

  it('detects a modified record', () => {
    const chain = buildChain(5);
    chain[2].details = { amount: 999999, to: 'XXXX1234' };
    expect(verifyAuditChain(chain)).toMatchObject({
      valid: false,
      firstInvalidSeq: 3,
      checked: 2,
    });
  });

  it('detects a deleted record', () => {
    const chain = buildChain(5);
    chain.splice(1, 1);
    expect(verifyAuditChain(chain)).toMatchObject({ valid: false, firstInvalidSeq: 3 });
  });

  it('detects a record whose hash was recomputed but whose successor was not', () => {
    const chain = buildChain(4);
    chain[1].details = { amount: 1 };
    chain[1].hash = computeAuditHash(chain[1].prevHash, chain[1]);
    const result = verifyAuditChain(chain);
    expect(result.valid).toBe(false);
    expect(result.firstInvalidSeq).toBe(3);
    expect(result.reason).toContain('Link broken');
  });

  it('is independent of key order in details', () => {
    const at = new Date();
    const a = computeAuditHash(GENESIS_HASH, {
      seq: 1,
      at,
      action: 'X',
      outcome: 'SUCCESS',
      details: { a: 1, b: 2 },
    });
    const b = computeAuditHash(GENESIS_HASH, {
      seq: 1,
      at,
      action: 'X',
      outcome: 'SUCCESS',
      details: { b: 2, a: 1 },
    });
    expect(a).toBe(b);
  });
});
