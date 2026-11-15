import { Alert, Button, Card, Col, Row, Spinner, Table } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime, formatMoney, titleCase } from '@/lib/format';
import { StatTile } from '../components/StatTile';
import {
  useGetJournalQuery,
  useGetReconciliationQuery,
  useGetTrialBalanceQuery,
  useSyncLedgerMutation,
} from '../staffApi';

const amount = (paise: number) => (paise ? formatMoney(paise) : '-');

/**
 * The SQL side of the bank: a double-entry general ledger projected from the
 * MongoDB core, with a trial balance and a reconciliation of every customer
 * account against the ledger.
 */
export default function LedgerPage() {
  const trial = useGetTrialBalanceQuery();
  const recon = useGetReconciliationQuery();
  const journal = useGetJournalQuery({ limit: 8 });
  const [sync, syncState] = useSyncLedgerMutation();

  const postPending = async () => {
    try {
      const result = await sync().unwrap();
      toast.success(
        result.posted || result.reversed
          ? `Posted ${result.posted} entries and ${result.reversed} reversals`
          : 'The ledger is up to date',
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const tb = trial.data;
  const rc = recon.data;

  return (
    <>
      <PageHeader
        title="General ledger"
        subtitle="Double-entry accounts in SQL, posted from every core banking transaction."
        actions={
          <Button
            variant="outline-primary"
            onClick={() => void postPending()}
            disabled={syncState.isLoading}
          >
            {syncState.isLoading ? (
              <Spinner size="sm" className="me-2" />
            ) : (
              <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
            )}
            Post pending
          </Button>
        }
      />
      {(trial.error || recon.error) && (
        <Alert variant="danger">{errorMessage(trial.error ?? recon.error)}</Alert>
      )}

      <Row className="g-3 mb-4">
        <Col md={4}>
          <StatTile
            label="Journal entries"
            icon="bi-journal-text"
            loading={trial.isLoading}
            value={tb?.entries.toLocaleString('en-IN')}
            hint="One per transaction, one more per reversal"
          />
        </Col>
        <Col md={4}>
          <StatTile
            label="Trial balance"
            icon={tb?.balanced === false ? 'bi-x-octagon' : 'bi-check2-circle'}
            tone={tb ? (tb.balanced ? 'success' : 'danger') : 'primary'}
            loading={trial.isLoading}
            value={tb ? (tb.balanced ? 'Balanced' : 'Out of balance') : undefined}
            hint={
              tb &&
              `Debits ${formatMoney(tb.totals.debit)} = credits ${formatMoney(tb.totals.credit)}`
            }
          />
        </Col>
        <Col md={4}>
          <StatTile
            label="Customer accounts reconciled"
            icon={rc?.mismatches.length ? 'bi-exclamation-triangle' : 'bi-check2-all'}
            tone={rc ? (rc.mismatches.length ? 'warning' : 'success') : 'primary'}
            loading={recon.isLoading}
            value={rc && `${rc.matched} of ${rc.accountsChecked}`}
            hint="Core balances (MongoDB) against the SQL sub-ledger"
          />
        </Col>
      </Row>

      <Row className="g-4">
        <Col xl={7}>
          <Card className="mb-4">
            <Card.Body>
              <h2 className="card-title-sm mb-3">Trial balance</h2>
              {!tb ? (
                <PageLoader />
              ) : (
                <Table className="table-ab table-stack align-middle small mb-0">
                  <thead>
                    <tr>
                      <th>GL account</th>
                      <th>Type</th>
                      <th className="text-end">Debit</th>
                      <th className="text-end">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tb.rows.map((r) => (
                      <tr key={r.code}>
                        <td data-label="GL account">
                          <span className="font-mono text-body-secondary me-2">{r.code}</span>
                          {r.name}
                        </td>
                        <td data-label="Type">{titleCase(r.type)}</td>
                        <td data-label="Debit" className="text-end font-mono">
                          {amount(r.debit)}
                        </td>
                        <td data-label="Credit" className="text-end font-mono">
                          {amount(r.credit)}
                        </td>
                      </tr>
                    ))}
                    <tr className="fw-semibold">
                      <td data-label="Total" colSpan={2}>
                        Total
                      </td>
                      <td data-label="Debit" className="text-end font-mono">
                        {formatMoney(tb.totals.debit)}
                      </td>
                      <td data-label="Credit" className="text-end font-mono">
                        {formatMoney(tb.totals.credit)}
                      </td>
                    </tr>
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>

          <Card>
            <Card.Body>
              <h2 className="card-title-sm mb-3">Reconciliation</h2>
              {!rc ? (
                <PageLoader />
              ) : rc.mismatches.length === 0 ? (
                <Alert variant="success" className="mb-0 d-flex gap-2">
                  <i className="bi bi-check2-all" aria-hidden="true" />
                  All {rc.accountsChecked} customer accounts agree with the ledger.
                </Alert>
              ) : (
                <>
                  <p className="small text-body-secondary">
                    These balances changed without a matching transaction, or a transaction is still
                    waiting to post ({rc.pendingTransactions} pending).
                  </p>
                  <Table size="sm" className="small mb-0">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th className="text-end">Core</th>
                        <th className="text-end">Ledger</th>
                        <th className="text-end">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rc.mismatches.map((m) => (
                        <tr key={m.accountNumber}>
                          <td className="font-mono">{m.maskedNumber}</td>
                          <td className="text-end font-mono">{formatMoney(m.coreBalance)}</td>
                          <td className="text-end font-mono">{formatMoney(m.ledgerBalance)}</td>
                          <td className="text-end font-mono text-danger-emphasis">
                            {formatMoney(m.difference)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col xl={5}>
          <Card>
            <Card.Body>
              <h2 className="card-title-sm mb-3">Latest journal entries</h2>
              {!journal.data ? (
                <PageLoader />
              ) : (
                <ul className="list-unstyled mb-0 d-grid gap-3">
                  {journal.data.items.map((e) => (
                    <li key={e.id} className="border rounded-3 p-2">
                      <div className="d-flex flex-wrap align-items-center gap-2 small mb-1">
                        <span className="font-mono fw-semibold">#{e.id}</span>
                        <span>{titleCase(e.transactionType)}</span>
                        {e.kind === 'REVERSAL' && (
                          <StatusBadge status="REVERSED" label="Reversal" />
                        )}
                        <span className="text-body-secondary ms-auto">
                          {formatDateTime(e.postedAt)}
                        </span>
                      </div>
                      <Table size="sm" className="small mb-0 inspector-table">
                        <tbody>
                          {e.lines.map((l, i) => (
                            <tr key={i}>
                              <td className={l.credit ? 'ps-4' : undefined}>
                                {l.credit ? 'Cr' : 'Dr'} {l.glName}
                                {l.accountNumber && (
                                  <span className="text-body-secondary font-mono">
                                    {' '}
                                    {l.accountNumber}
                                  </span>
                                )}
                              </td>
                              <td className="text-end font-mono">{amount(l.debit)}</td>
                              <td className="text-end font-mono">{amount(l.credit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </li>
                  ))}
                </ul>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
