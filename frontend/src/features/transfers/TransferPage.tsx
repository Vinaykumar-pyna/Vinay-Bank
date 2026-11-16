import { useState } from 'react';
import { Card, Col, Row } from 'react-bootstrap';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import type { Transaction, TransferQuote, TransferRequest } from '@/features/banking/types';
import { TransferDetailsForm } from './TransferDetailsForm';
import { TransferResult } from './TransferResult';
import { TransferReview } from './TransferReview';

type Step = 'details' | 'review' | 'done';

const STEPS: { id: Step; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'review', label: 'Review and confirm' },
  { id: 'done', label: 'Receipt' },
];

const tips = [
  ['bi-lightning-charge', 'Vinay Bank to Vinay Bank transfers are instant and free.'],
  ['bi-clock', 'NEFT settles in half-hourly batches; IMPS and RTGS are instant.'],
  ['bi-shield-lock', 'We never call to ask for an OTP. Do not share it with anyone.'],
  ['bi-person-check', 'Transfers of ₹2 lakh or more are approved by your branch.'],
];

/** Two-phase transfer: a signed quote first (fees, limits, risk, OTP), then idempotent execution. */
export default function TransferPage() {
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>('details');
  const [request, setRequest] = useState<TransferRequest | undefined>();
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [result, setResult] = useState<Transaction | null>(null);

  const reset = () => {
    setStep('details');
    setRequest(undefined);
    setQuote(null);
    setResult(null);
  };

  const currentIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <>
      <PageHeader
        title="Send money"
        subtitle="To your own accounts, Vinay Bank customers or any bank in India."
      />
      <Row className="g-4">
        <Col lg={8} xl={7}>
          <Card>
            <Card.Body className="p-3 p-md-4">
              <ol className="stepper" aria-label="Progress">
                {STEPS.map((s, i) => (
                  <li
                    key={s.id}
                    className={i < currentIndex ? 'done' : i === currentIndex ? 'current' : ''}
                    aria-current={i === currentIndex ? 'step' : undefined}
                  >
                    {s.label}
                  </li>
                ))}
              </ol>
              {step === 'details' && (
                <TransferDetailsForm
                  initialPayeeId={params.get('payee') ?? undefined}
                  initial={request}
                  onQuoted={(q, r) => {
                    setQuote(q);
                    setRequest(r);
                    setIdempotencyKey(crypto.randomUUID());
                    setStep('review');
                  }}
                />
              )}
              {step === 'review' && quote && (
                <TransferReview
                  quote={quote}
                  idempotencyKey={idempotencyKey}
                  onBack={() => setStep('details')}
                  onDone={(txn) => {
                    setResult(txn);
                    setStep('done');
                  }}
                />
              )}
              {step === 'done' && result && <TransferResult transaction={result} onNew={reset} />}
            </Card.Body>
          </Card>
        </Col>
        <Col lg={4} xl={5} className="no-print">
          <Card>
            <Card.Body>
              <h2 className="h6 mb-3">Good to know</h2>
              <ul className="list-unstyled d-grid gap-3 mb-0">
                {tips.map(([icon, text]) => (
                  <li key={text} className="d-flex gap-3 small">
                    <i className={`bi ${icon} text-primary fs-5`} aria-hidden="true" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
