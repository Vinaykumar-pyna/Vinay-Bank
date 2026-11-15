import { useMemo, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Col, Form, Row, Spinner } from 'react-bootstrap';
import { Link } from 'react-router';
import { AmountInput } from '@/components/banking/AmountInput';
import { Money } from '@/components/banking/Money';
import {
  useGetAccountsQuery,
  useGetBeneficiariesQuery,
  useGetRailsQuery,
  useQuoteTransferMutation,
} from '@/features/banking/bankingApi';
import type { ExternalRail, TransferQuote, TransferRequest } from '@/features/banking/types';
import { TRANSFER_PURPOSES } from '@/features/banking/types';
import { toApiError, type ApiError } from '@/lib/apiError';
import { formatMoney, rupeesToPaise, titleCase } from '@/lib/format';

interface Props {
  initialPayeeId?: string;
  initial?: TransferRequest;
  onQuoted: (quote: TransferQuote, request: TransferRequest) => void;
}

const LAKH = 100_000 * 100;
const REMARKS_PATTERN = /^[A-Za-z0-9 .,&()/'-]*$/;

export function TransferDetailsForm({ initialPayeeId, initial, onQuoted }: Props) {
  const accounts = useGetAccountsQuery();
  const beneficiaries = useGetBeneficiariesQuery();
  const rails = useGetRailsQuery();
  const [quoteTransfer, { isLoading }] = useQuoteTransferMutation();

  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.status === 'ACTIVE'),
    [accounts.data],
  );
  const [selectedFromId, setFromAccountId] = useState(initial?.fromAccountId ?? '');
  const [mode, setMode] = useState<'OWN' | 'BENEFICIARY'>(initial?.mode ?? 'BENEFICIARY');
  const [beneficiaryId, setBeneficiaryId] = useState(
    initial?.beneficiaryId ?? initialPayeeId ?? '',
  );
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? '');
  const [rail, setRail] = useState<ExternalRail>(initial?.rail ?? 'IMPS');
  const [amount, setAmount] = useState(initial ? String(initial.amount / 100) : '');
  const [purpose, setPurpose] = useState(initial?.purpose ?? 'TRANSFER');
  const [remarks, setRemarks] = useState(initial?.remarks ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);

  // Default to the first active account until the user picks one (derived, not stored).
  const fromAccountId = selectedFromId || activeAccounts[0]?.id || '';

  const from = activeAccounts.find((a) => a.id === fromAccountId);
  const ownTargets = activeAccounts.filter((a) => a.id !== fromAccountId);
  const payee = beneficiaries.data?.find((b) => b.id === beneficiaryId);
  const paise = rupeesToPaise(amount) ?? 0;
  const external = mode === 'BENEFICIARY' && payee && !payee.isInternal;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!from) next.fromAccountId = 'Choose an account to pay from';
    if (mode === 'BENEFICIARY' && !payee) next.payee = 'Choose a payee';
    if (mode === 'OWN' && !toAccountId) next.payee = 'Choose the account to move money to';
    if (!paise || paise < 100) next.amount = 'Enter an amount of at least ₹1';
    else if (from && paise > from.availableBalance)
      next.amount = `You have ${formatMoney(from.availableBalance)} available`;
    if (external && rail === 'RTGS' && paise < 2 * LAKH)
      next.rail = 'RTGS is only for ₹2,00,000 or more';
    if (external && rail === 'IMPS' && paise > 5 * LAKH)
      next.rail = 'IMPS allows at most ₹5,00,000. Use NEFT or RTGS.';
    if (payee?.inCoolingPeriod && paise > 50_000 * 100)
      next.amount = 'New payees can receive at most ₹50,000 per transfer for the first 24 hours';
    if (!REMARKS_PATTERN.test(remarks)) next.remarks = 'Use letters, digits and basic punctuation';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setApiError(null);
    if (!validate()) return;
    const request: TransferRequest = {
      fromAccountId,
      mode,
      amount: paise,
      ...(mode === 'OWN'
        ? { toAccountId }
        : { beneficiaryId, rail: external ? rail : undefined, purpose }),
      remarks: remarks.trim() || undefined,
    };
    try {
      onQuoted(await quoteTransfer(request).unwrap(), request);
    } catch (err) {
      setApiError(toApiError(err));
    }
  };

  if (accounts.isLoading || beneficiaries.isLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <Form onSubmit={submit} noValidate>
      {apiError && (
        <Alert variant={apiError.code === 'RISK_BLOCKED' ? 'danger' : 'warning'}>
          <div className="fw-semibold">{apiError.message}</div>
          {Array.isArray((apiError.details as { reasons?: string[] } | undefined)?.reasons) && (
            <ul className="small mb-0 mt-1">
              {(apiError.details as { reasons: string[] }).reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <Form.Group className="mb-4" controlId="tf-from">
        <Form.Label>Pay from</Form.Label>
        <Form.Select
          value={fromAccountId}
          isInvalid={!!errors.fromAccountId}
          onChange={(e) => setFromAccountId(e.target.value)}
        >
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nickname ?? titleCase(a.type)} · {a.maskedNumber.slice(-8)} ·{' '}
              {formatMoney(a.availableBalance)} available
            </option>
          ))}
        </Form.Select>
        <Form.Control.Feedback type="invalid">{errors.fromAccountId}</Form.Control.Feedback>
      </Form.Group>

      <div className="mb-2 fw-medium">Pay to</div>
      <div className="btn-group w-100 mb-3" role="group" aria-label="Transfer type">
        <Button
          variant={mode === 'BENEFICIARY' ? 'primary' : 'outline-primary'}
          onClick={() => setMode('BENEFICIARY')}
        >
          <i className="bi bi-people me-1" aria-hidden="true" /> A payee
        </Button>
        <Button
          variant={mode === 'OWN' ? 'primary' : 'outline-primary'}
          onClick={() => setMode('OWN')}
          disabled={ownTargets.length === 0}
        >
          <i className="bi bi-arrow-left-right me-1" aria-hidden="true" /> My other account
        </Button>
      </div>

      {mode === 'BENEFICIARY' ? (
        <div className="mb-4">
          {beneficiaries.data?.length ? (
            <div
              className="d-grid gap-2"
              role="radiogroup"
              aria-label="Payee"
              style={{ maxHeight: 280, overflowY: 'auto' }}
            >
              {beneficiaries.data.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={beneficiaryId === b.id}
                  className={`choice-card d-flex align-items-center gap-3 ${beneficiaryId === b.id ? 'selected' : ''}`}
                  onClick={() => setBeneficiaryId(b.id)}
                >
                  <i
                    className={`bi ${beneficiaryId === b.id ? 'bi-record-circle-fill text-primary' : 'bi-circle text-body-secondary'}`}
                    aria-hidden="true"
                  />
                  <span className="flex-grow-1 min-w-0">
                    <span className="d-block fw-semibold text-truncate">
                      {b.name}
                      {b.nickname && (
                        <span className="fw-normal text-body-secondary"> ({b.nickname})</span>
                      )}
                    </span>
                    <span className="small text-body-secondary">
                      {b.bankName} · {b.maskedAccount}
                    </span>
                  </span>
                  {b.isInternal && (
                    <Badge bg="primary-subtle" text="primary-emphasis" className="rounded-pill">
                      Instant
                    </Badge>
                  )}
                  {b.inCoolingPeriod && (
                    <Badge bg="warning-subtle" text="warning-emphasis" className="rounded-pill">
                      New
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <Alert variant="info" className="mb-0">
              You have no payees yet. <Link to="/app/beneficiaries">Add a payee</Link> first.
            </Alert>
          )}
          {errors.payee && <div className="invalid-feedback d-block">{errors.payee}</div>}
          <Link to="/app/beneficiaries" className="small d-inline-block mt-2">
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
            Add a new payee
          </Link>
        </div>
      ) : (
        <Form.Group className="mb-4" controlId="tf-own">
          <Form.Select
            value={toAccountId}
            isInvalid={!!errors.payee}
            onChange={(e) => setToAccountId(e.target.value)}
          >
            <option value="">Choose account</option>
            {ownTargets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname ?? titleCase(a.type)} · {a.maskedNumber.slice(-8)}
              </option>
            ))}
          </Form.Select>
          <Form.Control.Feedback type="invalid">{errors.payee}</Form.Control.Feedback>
        </Form.Group>
      )}

      {external && (
        <fieldset className="mb-4">
          <legend className="fs-6 fw-medium mb-2">Transfer method</legend>
          <Row xs={1} md={3} className="g-2">
            {rails.data?.map((r) => (
              <Col key={r.rail}>
                <button
                  type="button"
                  className={`choice-card h-100 ${rail === r.rail ? 'selected' : ''}`}
                  aria-pressed={rail === r.rail}
                  onClick={() => setRail(r.rail)}
                >
                  <span className="d-block fw-semibold">{r.label}</span>
                  <span className="small text-body-secondary">{r.description}</span>
                </button>
              </Col>
            ))}
          </Row>
          {errors.rail && <div className="invalid-feedback d-block">{errors.rail}</div>}
        </fieldset>
      )}

      <div className="mb-4">
        <AmountInput
          id="tf-amount"
          value={amount}
          onChange={setAmount}
          error={errors.amount}
          helper={from ? `Available: ${formatMoney(from.availableBalance)}` : undefined}
        />
        {from && paise > 0 && paise <= from.availableBalance && (
          <div className="small text-body-secondary mt-1">
            Balance after transfer: <Money paise={from.availableBalance - paise} />
          </div>
        )}
      </div>

      <Row className="g-3 mb-4">
        {mode === 'BENEFICIARY' && (
          <Col md={5}>
            <Form.Group controlId="tf-purpose">
              <Form.Label>Purpose</Form.Label>
              <Form.Select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                {TRANSFER_PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
        )}
        <Col>
          <Form.Group controlId="tf-remarks">
            <Form.Label>
              Remarks <span className="text-body-secondary">(optional)</span>
            </Form.Label>
            <Form.Control
              value={remarks}
              maxLength={60}
              isInvalid={!!errors.remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Shown on both statements"
            />
            <Form.Control.Feedback type="invalid">{errors.remarks}</Form.Control.Feedback>
          </Form.Group>
        </Col>
      </Row>

      <Button
        type="submit"
        size="lg"
        className="w-100"
        disabled={isLoading || !activeAccounts.length}
      >
        {isLoading ? <Spinner size="sm" animation="border" /> : 'Review transfer'}
      </Button>
    </Form>
  );
}
