import { DOMParser, type Document } from '@xmldom/xmldom';
import * as xpath from 'xpath';
import { paiseToRupeeString, rupeesToPaise } from '@app/shared';
import { IFSC_PATTERN } from '../../common/validators/banking.validators';

/** ISO 20022 Customer Credit Transfer Initiation versions we accept. */
export const PAIN001_NAMESPACES = [
  'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
  'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09',
] as const;

export const MAX_BULK_PAYMENTS = 100;
export const MAX_PAIN001_CHARS = 200_000;

export interface Pain001Payment {
  index: number;
  endToEndId: string;
  /** Paise */
  amount: number;
  currency: string;
  creditorName: string;
  creditorAccount: string;
  creditorIfsc: string;
  remittanceInfo?: string;
}

export interface Pain001Batch {
  namespace: string;
  messageId: string;
  createdAt: string;
  numberOfTransactions: number;
  /** Paise, from GrpHdr/CtrlSum */
  controlSum: number;
  initiatingParty: string;
  debtorName: string;
  debtorAccount: string;
  requestedExecutionDate?: string;
  payments: Pain001Payment[];
}

export interface Pain001Issue {
  /** XPath-like location, e.g. CdtTrfTxInf[3]/Amt/InstdAmt */
  path: string;
  message: string;
  /** 1-based payment number, when the problem is in one payment */
  payment?: number;
}

export interface Pain001Result {
  batch?: Pain001Batch;
  issues: Pain001Issue[];
}

const ACCOUNT_NUMBER = /^\d{9,18}$/;

/** Parses a decimal amount ("1500.5") into paise, or null if it is not a valid amount. */
function amountToPaise(value: string): number | null {
  try {
    return rupeesToPaise(value);
  } catch {
    return null;
  }
}

/**
 * Parses and validates an ISO 20022 pain.001 bulk payment file using XPath.
 *
 * Security: DOCTYPE declarations are refused outright, which blocks XML
 * external entity (XXE) and entity-expansion ("billion laughs") attacks; the
 * size is capped before parsing. Business checks follow the standard's own
 * controls: NbOfTxs and CtrlSum must match the payments actually present.
 */
export function parsePain001(xml: string): Pain001Result {
  const issues: Pain001Issue[] = [];
  if (xml.length > MAX_PAIN001_CHARS) {
    return {
      issues: [{ path: '/', message: `The file is larger than ${MAX_PAIN001_CHARS / 1000} KB` }],
    };
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    return { issues: [{ path: '/', message: 'DOCTYPE and ENTITY declarations are not allowed' }] };
  }

  let doc: Document;
  const parseErrors: string[] = [];
  try {
    doc = new DOMParser({
      onError: (level, message) => {
        if (level !== 'warning') parseErrors.push(String(message).split('\n')[0]);
      },
    }).parseFromString(xml, 'text/xml');
  } catch (error) {
    return {
      issues: [
        { path: '/', message: `Not well-formed XML: ${(error as Error).message.split('\n')[0]}` },
      ],
    };
  }
  if (parseErrors.length)
    return { issues: [{ path: '/', message: `Not well-formed XML: ${parseErrors[0]}` }] };

  const root = doc.documentElement;
  const namespace = root?.namespaceURI ?? '';
  if (
    !root ||
    root.localName !== 'Document' ||
    !(PAIN001_NAMESPACES as readonly string[]).includes(namespace)
  ) {
    return {
      issues: [
        {
          path: '/Document',
          message: 'Not a pain.001.001.03 or pain.001.001.09 credit transfer initiation',
        },
      ],
    };
  }

  // xmldom implements the DOM that xpath expects; its TypeScript types are just declared separately.
  const dom = doc as unknown as Node;
  const select = xpath.useNamespaces({ p: namespace });
  const text = (expr: string, context: Node = dom) => {
    const value = select(`normalize-space(${expr})`, context, true);
    return typeof value === 'string' ? value : '';
  };
  const count = (expr: string, context: Node = dom) =>
    Number(select(`count(${expr})`, context, true));
  const base = '/p:Document/p:CstmrCdtTrfInitn';

  const required = (value: string, path: string, label: string) => {
    if (!value) issues.push({ path, message: `${label} is missing` });
    return value;
  };

  const messageId = required(text(`${base}/p:GrpHdr/p:MsgId`), 'GrpHdr/MsgId', 'Message ID');
  const createdAt = required(text(`${base}/p:GrpHdr/p:CreDtTm`), 'GrpHdr/CreDtTm', 'Creation time');
  const declaredCount = Number(text(`${base}/p:GrpHdr/p:NbOfTxs`));
  const declaredSumText = text(`${base}/p:GrpHdr/p:CtrlSum`);
  const initiatingParty = text(`${base}/p:GrpHdr/p:InitgPty/p:Nm`);

  if (count(`${base}/p:PmtInf`) !== 1) {
    issues.push({
      path: 'PmtInf',
      message: 'Exactly one payment information block (one debit account) is supported',
    });
    return { issues };
  }
  const pmtInf = select(`${base}/p:PmtInf`, dom, true) as Node;
  if (text('p:PmtMtd', pmtInf) !== 'TRF')
    issues.push({ path: 'PmtInf/PmtMtd', message: 'Payment method must be TRF (credit transfer)' });
  const debtorName = text('p:Dbtr/p:Nm', pmtInf);
  const debtorAccount = required(
    text('p:DbtrAcct/p:Id/p:Othr/p:Id', pmtInf),
    'PmtInf/DbtrAcct/Id/Othr/Id',
    'Debit account number',
  );
  // Version 03 holds the date directly; version 09 wraps it in <Dt>.
  const requestedExecutionDate =
    text('p:ReqdExctnDt/p:Dt', pmtInf) || text('p:ReqdExctnDt', pmtInf) || undefined;

  const nodes = select('p:CdtTrfTxInf', pmtInf) as Node[];
  if (nodes.length === 0)
    issues.push({ path: 'PmtInf/CdtTrfTxInf', message: 'The file contains no payments' });
  if (nodes.length > MAX_BULK_PAYMENTS) {
    issues.push({
      path: 'PmtInf/CdtTrfTxInf',
      message: `At most ${MAX_BULK_PAYMENTS} payments per file`,
    });
  }

  const seenIds = new Set<string>();
  const payments: Pain001Payment[] = nodes.slice(0, MAX_BULK_PAYMENTS).map((node, i) => {
    const n = i + 1;
    const at = (path: string) => `CdtTrfTxInf[${n}]/${path}`;
    const issue = (path: string, message: string) =>
      issues.push({ path: at(path), message, payment: n });

    const endToEndId = text('p:PmtId/p:EndToEndId', node);
    if (!endToEndId) issue('PmtId/EndToEndId', 'End-to-end ID is missing');
    else if (seenIds.has(endToEndId))
      issue('PmtId/EndToEndId', `Duplicate end-to-end ID ${endToEndId}`);
    seenIds.add(endToEndId);

    const amountText = text('p:Amt/p:InstdAmt', node);
    const currency = text('p:Amt/p:InstdAmt/@Ccy', node);
    const amount = amountToPaise(amountText);
    if (amount === null || amount <= 0)
      issue('Amt/InstdAmt', `"${amountText}" is not a valid amount`);
    if (currency !== 'INR') issue('Amt/InstdAmt/@Ccy', `Currency must be INR, not "${currency}"`);

    const creditorIfsc = text('p:CdtrAgt/p:FinInstnId/p:ClrSysMmbId/p:MmbId', node).toUpperCase();
    if (!IFSC_PATTERN.test(creditorIfsc))
      issue('CdtrAgt/FinInstnId/ClrSysMmbId/MmbId', `"${creditorIfsc}" is not a valid IFSC`);

    const creditorName = text('p:Cdtr/p:Nm', node).slice(0, 60);
    if (!creditorName) issue('Cdtr/Nm', 'Payee name is missing');

    const creditorAccount = text('p:CdtrAcct/p:Id/p:Othr/p:Id', node);
    if (!ACCOUNT_NUMBER.test(creditorAccount))
      issue('CdtrAcct/Id/Othr/Id', 'Payee account must be 9 to 18 digits');

    const remittanceInfo = text('p:RmtInf/p:Ustrd', node).slice(0, 60) || undefined;
    return {
      index: n,
      endToEndId,
      amount: amount ?? 0,
      currency,
      creditorName,
      creditorAccount,
      creditorIfsc,
      remittanceInfo,
    };
  });

  // Control totals, exactly as a bank checks them on receipt.
  if (!Number.isInteger(declaredCount) || declaredCount !== nodes.length) {
    issues.push({
      path: 'GrpHdr/NbOfTxs',
      message: `NbOfTxs says ${text(`${base}/p:GrpHdr/p:NbOfTxs`) || 'nothing'} but the file has ${nodes.length} payments`,
    });
  }
  const controlSum = amountToPaise(declaredSumText);
  const actualSum = payments.reduce((sum, p) => sum + p.amount, 0);
  if (controlSum === null) {
    issues.push({ path: 'GrpHdr/CtrlSum', message: 'Control sum is missing or invalid' });
  } else if (controlSum !== actualSum) {
    issues.push({
      path: 'GrpHdr/CtrlSum',
      message: `CtrlSum is ${paiseToRupeeString(controlSum)} but the payments add up to ${paiseToRupeeString(actualSum)}`,
    });
  }

  return {
    issues,
    batch: {
      namespace,
      messageId,
      createdAt,
      numberOfTransactions: nodes.length,
      controlSum: controlSum ?? 0,
      initiatingParty,
      debtorName,
      debtorAccount,
      requestedExecutionDate,
      payments,
    },
  };
}
