import { parsePain001 } from './pain001.parser';

interface SamplePayment {
  id: string;
  amount: string;
  ifsc: string;
  name: string;
  account: string;
}

function painXml(
  payments: SamplePayment[],
  options: { count?: number; sum?: string; namespace?: string; prolog?: string } = {},
): string {
  const sum = options.sum ?? payments.reduce((s, p) => s + Number(p.amount), 0).toFixed(2);
  const tx = payments
    .map(
      (p) => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${p.id}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="INR">${p.amount}</InstdAmt></Amt>
        <CdtrAgt><FinInstnId><ClrSysMmbId><MmbId>${p.ifsc}</MmbId></ClrSysMmbId></FinInstnId></CdtrAgt>
        <Cdtr><Nm>${p.name}</Nm></Cdtr>
        <CdtrAcct><Id><Othr><Id>${p.account}</Id></Othr></Id></CdtrAcct>
        <RmtInf><Ustrd>Salary</Ustrd></RmtInf>
      </CdtTrfTxInf>`,
    )
    .join('');
  return `${options.prolog ?? '<?xml version="1.0" encoding="UTF-8"?>'}
<Document xmlns="${options.namespace ?? 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03'}">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>SAL-001</MsgId>
      <CreDtTm>2026-11-14T09:30:00</CreDtTm>
      <NbOfTxs>${options.count ?? payments.length}</NbOfTxs>
      <CtrlSum>${sum}</CtrlSum>
      <InitgPty><Nm>Design Studio</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>P1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <ReqdExctnDt>2026-11-14</ReqdExctnDt>
      <Dbtr><Nm>Priya Sharma</Nm></Dbtr>
      <DbtrAcct><Id><Othr><Id>000120000013</Id></Othr></Id></DbtrAcct>${tx}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

const AMIT: SamplePayment = {
  id: 'E1',
  amount: '45000.00',
  ifsc: 'HDFC0000240',
  name: 'Amit Kulkarni',
  account: '50100234567812',
};
const SURESH: SamplePayment = {
  id: 'E2',
  amount: '32500.5',
  ifsc: 'SBIN0001234',
  name: 'Suresh Patil',
  account: '30012345678',
};

describe('parsePain001', () => {
  it('reads the group header, debit account and payments with XPath', () => {
    const { batch, issues } = parsePain001(painXml([AMIT, SURESH]));
    expect(issues).toEqual([]);
    expect(batch).toMatchObject({
      messageId: 'SAL-001',
      numberOfTransactions: 2,
      controlSum: 7_750_050,
      debtorAccount: '000120000013',
      requestedExecutionDate: '2026-11-14',
    });
    expect(batch!.payments[1]).toMatchObject({
      amount: 3_250_050,
      creditorIfsc: 'SBIN0001234',
      creditorName: 'Suresh Patil',
    });
  });

  it('accepts version 09, where the execution date is wrapped in <Dt>', () => {
    const xml = painXml([AMIT], {
      namespace: 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09',
    }).replace(
      '<ReqdExctnDt>2026-11-14</ReqdExctnDt>',
      '<ReqdExctnDt><Dt>2026-11-15</Dt></ReqdExctnDt>',
    );
    expect(parsePain001(xml).batch?.requestedExecutionDate).toBe('2026-11-15');
  });

  it('checks the control totals against the payments', () => {
    const { issues } = parsePain001(painXml([AMIT, SURESH], { count: 3, sum: '1.00' }));
    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(['GrpHdr/NbOfTxs', 'GrpHdr/CtrlSum']),
    );
  });

  it('reports problems per payment with their location', () => {
    const { issues } = parsePain001(
      painXml([AMIT, { ...SURESH, id: 'E1', amount: '12.345', ifsc: 'BAD', account: '12' }]),
    );
    const second = issues.filter((i) => i.payment === 2).map((i) => i.path);
    expect(second).toEqual(
      expect.arrayContaining([
        'CdtTrfTxInf[2]/PmtId/EndToEndId',
        'CdtTrfTxInf[2]/Amt/InstdAmt',
        'CdtTrfTxInf[2]/CdtrAgt/FinInstnId/ClrSysMmbId/MmbId',
        'CdtTrfTxInf[2]/CdtrAcct/Id/Othr/Id',
      ]),
    );
  });

  it('refuses DOCTYPE declarations (XXE and entity expansion)', () => {
    const xxe = painXml([AMIT], {
      prolog: '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]>',
    });
    expect(parsePain001(xxe).issues[0].message).toMatch(/DOCTYPE/);
  });

  it('rejects other XML documents and malformed XML', () => {
    expect(parsePain001('<Document xmlns="urn:other"/>').issues[0].message).toMatch(/pain\.001/);
    expect(parsePain001('<Document><unclosed></Document>').issues[0].message).toMatch(
      /well-formed/,
    );
  });
});
