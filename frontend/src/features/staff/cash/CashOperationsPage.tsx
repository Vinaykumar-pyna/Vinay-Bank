import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { AmountInput } from '@/components/banking/AmountInput';
import { Money } from '@/components/banking/Money';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useGetTransactionsQuery } from '@/features/banking/bankingApi';
import type { Transaction } from '@/features/banking/types';
import { errorMessage } from '@/lib/apiError';
import { formatMoney, formatRelative, formatRupees, rupeesToPaise } from '@/lib/format';
import { useCashOperationMutation, useLookupAccountQuery } from '../staffApi';
import { CASH_APPROVAL_THRESHOLDS, type CashKind } from '../types';
import { AccountHolderPanel } from './AccountHolderPanel';
import { CashReceipt } from './CashReceipt';

const MIN_PAISE = 100 * 100;
const MAX_PAISE = 50_00_000 * 100;

const schema = z.object({
  accountNumber: z.string().regex(/^\d{12}$/, 'Enter the 12-digit account number'),
  amount: z.string().refine(
    (value) => {
      const paise = rupeesToPaise(value);
      return paise !== null && paise >= MIN_PAISE && paise <= MAX_PAISE;
    },
    `Enter an amount from ${formatRupees(MIN_PAISE)} to ${formatRupees(MAX_PAISE)}`,
  ),
  counterpartyName: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z .'-]*$/, 'Use letters, spaces, dots and hyphens only'),
  remarks: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z0-9 .,&()/'-]*$/, 'Use letters, digits and basic punctuation only'),
});

type CashForm = z.infer<typeof schema>;

const EMPTY: CashForm = { accountNumber: '', amount: '', counterpartyName: '', remarks: '' };

const KINDS: { kind: CashKind; label: string; icon: string; hint: string }[] = [
  {
    kind: 'deposit',
    label: 'Cash deposit',
    icon: 'bi-box-arrow-in-down',
    hint: 'Customer hands over cash',
  },
  {
    kind: 'withdrawal',
    label: 'Cash withdrawal',
    icon: 'bi-box-arrow-up',
    hint: 'Customer collects cash',
  },
];

function RecentCash() {
  const { data } = useGetTransactionsQuery({ rail: 'CASH', limit: 6 });
  if (!data?.items.length)
    return <p className="small text-body-secondary mb-0">No cash transactions yet.</p>;
  return (
    <ul className="list-unstyled mb-0">
      {data.items.map((t: Transaction) => {
        const deposit = t.type === 'CASH_DEPOSIT';
        return (
          <li key={t.id} className="d-flex align-items-center gap-2 py-2 border-bottom small">
            <i
              className={`bi ${deposit ? 'bi-box-arrow-in-down' : 'bi-box-arrow-up'} text-body-secondary`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-grow-1">
              <div className="fw-medium text-truncate">{(deposit ? t.to : t.from)?.name}</div>
              <div className="text-body-secondary">
                {deposit ? 'Deposit' : 'Withdrawal'} · {formatRelative(t.createdAt)}
              </div>
            </div>
            <div className="text-end">
              <Money paise={t.amount} className="fw-semibold d-block" />
              {t.status !== 'COMPLETED' && <StatusBadge status={t.status} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Teller counter for cash deposits and withdrawals. The account holder is shown
 * before anything is posted, amounts at or above the thresholds go to a manager
 * (maker-checker), and each slip carries its own idempotency key so a retry
 * after a network error can never post the money twice.
 */
export default function CashOperationsPage() {
  const [kind, setKind] = useState<CashKind>('deposit');
  const [pending, setPending] = useState<CashForm>();
  const [receipt, setReceipt] = useState<Transaction>();
  const [slipKey, setSlipKey] = useState(() => crypto.randomUUID());
  const [submitCash, { isLoading, error, reset }] = useCashOperationMutation();
  const {
    control,
    register,
    handleSubmit,
    reset: resetForm,
    setError,
    formState: { errors },
  } = useForm<CashForm>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const accountNumber = useWatch({ control, name: 'accountNumber' });
  const amount = rupeesToPaise(useWatch({ control, name: 'amount' }) ?? '') ?? 0;
  const lookup = useLookupAccountQuery(accountNumber, { skip: !/^\d{12}$/.test(accountNumber) });
  const holder = lookup.isError ? undefined : lookup.data;
  const threshold = CASH_APPROVAL_THRESHOLDS[kind];
  const needsApproval = amount >= threshold;
  const exceedsBalance = kind === 'withdrawal' && !!holder && amount > holder.availableBalance;

  const onSubmit = (values: CashForm) => {
    if (!holder) {
      setError('accountNumber', { message: 'Look up a valid account first' });
      return;
    }
    if (exceedsBalance) {
      setError('amount', { message: 'The amount is more than the available balance' });
      return;
    }
    setPending(values);
  };

  const confirm = async () => {
    if (!pending) return;
    try {
      const transaction = await submitCash({
        kind,
        idempotencyKey: slipKey,
        accountNumber: pending.accountNumber,
        amount: rupeesToPaise(pending.amount) ?? 0,
        counterpartyName: pending.counterpartyName || undefined,
        remarks: pending.remarks || undefined,
      }).unwrap();
      setReceipt(transaction);
      setPending(undefined);
    } catch {
      // Keep the same slip key: retrying the same slip is safe and cannot double-post.
      setPending(undefined);
    }
  };

  const startNew = () => {
    setReceipt(undefined);
    setSlipKey(crypto.randomUUID());
    resetForm(EMPTY);
    reset();
  };

  return (
    <>
      <PageHeader
        title="Cash counter"
        subtitle="Cash deposits and withdrawals for customers at your branch."
      />
      <Row className="g-4">
        <Col lg={7}>
          {receipt ? (
            <CashReceipt transaction={receipt} onNew={startNew} />
          ) : (
            <Card>
              <Card.Body className="p-4">
                <Form noValidate onSubmit={handleSubmit(onSubmit)}>
                  <div className="row g-2 mb-4" role="radiogroup" aria-label="Operation">
                    {KINDS.map((k) => (
                      <div className="col-6" key={k.kind}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={kind === k.kind}
                          className={`choice-card w-100 h-100 text-start ${kind === k.kind ? 'selected' : ''}`}
                          onClick={() => {
                            setKind(k.kind);
                            setSlipKey(crypto.randomUUID());
                            reset();
                          }}
                        >
                          <i className={`bi ${k.icon} fs-5 d-block mb-1`} aria-hidden="true" />
                          <span className="d-block fw-semibold">{k.label}</span>
                          <span className="small text-body-secondary">{k.hint}</span>
                        </button>
                      </div>
                    ))}
                  </div>

                  {error && <Alert variant="danger">{errorMessage(error)}</Alert>}

                  <Form.Group controlId="cash-account" className="mb-3">
                    <Form.Label>Account number</Form.Label>
                    <Controller
                      control={control}
                      name="accountNumber"
                      render={({ field }) => (
                        <Form.Control
                          {...field}
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={12}
                          className="font-mono"
                          placeholder="12-digit account number"
                          isInvalid={!!errors.accountNumber}
                          onChange={(e) =>
                            field.onChange(e.target.value.replace(/\D/g, '').slice(0, 12))
                          }
                        />
                      )}
                    />
                    <Form.Control.Feedback type="invalid">
                      {errors.accountNumber?.message}
                    </Form.Control.Feedback>
                  </Form.Group>

                  {/^\d{12}$/.test(accountNumber) && (
                    <div className="mb-3">
                      <AccountHolderPanel
                        data={holder}
                        loading={lookup.isFetching && !holder}
                        error={lookup.error}
                      />
                    </div>
                  )}

                  <div className="mb-3">
                    <Controller
                      control={control}
                      name="amount"
                      render={({ field }) => (
                        <AmountInput
                          id="cash-amount"
                          value={field.value}
                          onChange={field.onChange}
                          error={errors.amount?.message}
                          helper={`From ${formatRupees(MIN_PAISE)} to ${formatRupees(MAX_PAISE)}`}
                        />
                      )}
                    />
                  </div>
                  {exceedsBalance && (
                    <Alert variant="danger" className="small py-2">
                      The amount is more than the available balance of{' '}
                      {formatMoney(holder.availableBalance)}.
                    </Alert>
                  )}
                  {needsApproval && !exceedsBalance && (
                    <Alert variant="warning" className="small py-2 d-flex gap-2">
                      <i className="bi bi-person-check mt-1" aria-hidden="true" />
                      <span>
                        {kind === 'deposit'
                          ? `Deposits of ${formatRupees(threshold)} or more need a manager's approval before they are credited.`
                          : `Withdrawals of ${formatRupees(threshold)} or more need a manager's approval. The amount is held until then.`}
                      </span>
                    </Alert>
                  )}

                  <Row className="g-3 mb-4">
                    <Col md={6}>
                      <Form.Group controlId="cash-counterparty">
                        <Form.Label>
                          {kind === 'deposit' ? 'Deposited by' : 'Collected by'}
                        </Form.Label>
                        <Form.Control
                          {...register('counterpartyName')}
                          maxLength={60}
                          placeholder="Account holder"
                          isInvalid={!!errors.counterpartyName}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.counterpartyName?.message}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="cash-remarks">
                        <Form.Label>Remarks</Form.Label>
                        <Form.Control
                          {...register('remarks')}
                          maxLength={60}
                          placeholder="Optional"
                          isInvalid={!!errors.remarks}
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.remarks?.message}
                        </Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Button type="submit" size="lg" className="w-100" disabled={isLoading}>
                    {isLoading && <Spinner size="sm" className="me-2" />}
                    {kind === 'deposit' ? 'Review deposit' : 'Review withdrawal'}
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          )}
        </Col>

        <Col lg={5} className="d-grid gap-4 align-content-start">
          <Card>
            <Card.Body>
              <h2 className="card-title-sm mb-3">Approval limits</h2>
              <div className="receipt-row">
                <span>Deposits from</span>
                <span className="fw-semibold">
                  {formatRupees(CASH_APPROVAL_THRESHOLDS.deposit)}
                </span>
              </div>
              <div className="receipt-row">
                <span>Withdrawals from</span>
                <span className="fw-semibold">
                  {formatRupees(CASH_APPROVAL_THRESHOLDS.withdrawal)}
                </span>
              </div>
              <p className="small text-body-secondary mt-3 mb-0">
                Requests at or above these amounts go to the{' '}
                <Link to="/staff/approvals">approval queue</Link>. Check original photo ID before
                paying out cash.
              </p>
            </Card.Body>
          </Card>
          <Card>
            <Card.Body>
              <h2 className="card-title-sm mb-2">Recent cash transactions</h2>
              <RecentCash />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <ConfirmDialog
        show={!!pending}
        title={kind === 'deposit' ? 'Confirm cash deposit' : 'Confirm cash withdrawal'}
        confirmLabel={kind === 'deposit' ? 'Post deposit' : 'Post withdrawal'}
        busy={isLoading}
        body={
          pending &&
          holder && (
            <>
              <div className="display-6 fw-bold text-center mb-3">
                {formatMoney(rupeesToPaise(pending.amount) ?? 0)}
              </div>
              <div className="receipt-row">
                <span>{kind === 'deposit' ? 'Credit to' : 'Debit from'}</span>
                <span className="text-end">
                  {holder.holderName}
                  <br />
                  <span className="font-mono small">{holder.accountNumber}</span>
                </span>
              </div>
              {pending.counterpartyName && (
                <div className="receipt-row">
                  <span>{kind === 'deposit' ? 'Deposited by' : 'Collected by'}</span>
                  <span>{pending.counterpartyName}</span>
                </div>
              )}
              {needsApproval && (
                <p className="small text-body-secondary mt-3 mb-0">
                  This will be sent to a manager for approval.
                </p>
              )}
            </>
          )
        }
        onConfirm={confirm}
        onCancel={() => setPending(undefined)}
      />
    </>
  );
}
