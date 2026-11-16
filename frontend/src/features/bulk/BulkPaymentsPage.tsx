import { useState } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { Money } from '@/components/banking/Money';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useGetAccountsQuery } from '@/features/banking/bankingApi';
import { errorMessage } from '@/lib/apiError';
import { formatDateTime, formatMoney, maskAccount, titleCase } from '@/lib/format';
import { http } from '@/lib/http';
import {
  useGetBulkBatchesQuery,
  usePreviewBulkMutation,
  useSubmitBulkMutation,
  type BulkPreview,
  type BulkResult,
} from './bulkApi';

function PreviewTable({ preview }: { preview: BulkPreview }) {
  const issuesFor = (index: number) => preview.issues.filter((i) => i.payment === index);
  return (
    <Table className="table-ab table-stack table-stack-lg align-middle small">
      <thead>
        <tr>
          <th>#</th>
          <th>Payee</th>
          <th>Bank</th>
          <th>Method</th>
          <th>Check</th>
          <th className="text-end">Amount</th>
        </tr>
      </thead>
      <tbody>
        {preview.payments.map((p) => {
          const problems = issuesFor(p.index);
          return (
            <tr key={p.index} className={problems.length ? 'table-danger' : undefined}>
              <td data-label="#" className="font-mono">
                {p.index}
              </td>
              <td data-label="Payee">
                <div className="fw-medium">{p.creditorName || '-'}</div>
                <div className="text-body-secondary font-mono">
                  {p.creditorAccount ? maskAccount(p.creditorAccount) : '-'} · {p.endToEndId}
                </div>
              </td>
              <td data-label="Bank">
                {p.payeeBank}
                <div className="text-body-secondary font-mono">{p.creditorIfsc}</div>
              </td>
              <td data-label="Method">{p.rail === 'INTERNAL' ? 'Within Vinay Bank' : 'NEFT'}</td>
              <td data-label="Check">
                {problems.length ? (
                  <ul className="mb-0 ps-3 text-danger-emphasis">
                    {problems.map((i) => (
                      <li key={i.path}>{i.message}</li>
                    ))}
                  </ul>
                ) : (
                  <StatusBadge status="VERIFIED" label="OK" />
                )}
              </td>
              <td data-label="Amount" className="text-end">
                <Money paise={p.amount} className="fw-semibold" />
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/**
 * Bulk payments from an ISO 20022 pain.001 file: upload, see every check the
 * bank runs (XPath parsing, control totals, balances), approve with an OTP,
 * and the whole file is paid in one atomic transaction.
 */
export default function BulkPaymentsPage() {
  const { data: accounts = [] } = useGetAccountsQuery();
  const { data: batches = [] } = useGetBulkBatchesQuery();
  const [xml, setXml] = useState('');
  const [fileName, setFileName] = useState('');
  const [sampleAccount, setSampleAccount] = useState('');
  const [otp, setOtp] = useState('');
  const [key, setKey] = useState('');
  const [result, setResult] = useState<BulkResult>();
  const [preview, previewState] = usePreviewBulkMutation();
  const [submit, submitState] = useSubmitBulkMutation();
  const checked = previewState.data;
  const active = accounts.filter((a) => a.status === 'ACTIVE');
  const sampleFor = sampleAccount || active[0]?.id || '';

  const reset = () => {
    setXml('');
    setFileName('');
    setOtp('');
    setResult(undefined);
    previewState.reset();
    submitState.reset();
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 200_000) {
      toast.error('The file is larger than 200 KB');
      return;
    }
    reset();
    setXml(await file.text());
    setFileName(file.name);
  };

  const downloadSample = async () => {
    try {
      const response = await http.get<Blob>('/bulk-payments/sample', {
        params: { accountId: sampleFor },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      Object.assign(document.createElement('a'), {
        href: url,
        download: 'pain001-sample.xml',
      }).click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const check = async () => {
    setOtp('');
    setKey(crypto.randomUUID());
    await preview({ xml })
      .unwrap()
      .catch(() => undefined);
  };

  const pay = async () => {
    if (!checked?.otp) return;
    try {
      const paid = await submit({
        xml,
        challengeId: checked.otp.challengeId,
        otp,
        idempotencyKey: key,
      }).unwrap();
      setResult(paid);
      toast.success(`${paid.count} payments accepted`);
    } catch {
      // Shown below.
    }
  };

  return (
    <>
      <PageHeader
        title="Bulk payments"
        subtitle="Pay salaries or vendors from an ISO 20022 pain.001 file, approved with one OTP."
      />

      {result ? (
        <Card className="mb-4">
          <Card.Body className="p-4">
            <div className="d-flex align-items-center gap-3 mb-3">
              <span className="icon-tile icon-tile-success" aria-hidden="true">
                <i className="bi bi-check2-all" />
              </span>
              <div>
                <h2 className="h5 mb-0">File {result.messageId} accepted</h2>
                <div className="text-body-secondary small">
                  {result.count} payments, {formatMoney(result.totalAmount)} debited. NEFT payments
                  settle in the next batch.
                </div>
              </div>
              <Button className="ms-auto" variant="outline-primary" onClick={reset}>
                New file
              </Button>
            </div>
            <Table size="sm" className="small mb-0">
              <thead>
                <tr>
                  <th>End-to-end ID</th>
                  <th>Reference</th>
                  <th>Method</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.payments.map((p) => (
                  <tr key={p.reference}>
                    <td className="font-mono">{p.endToEndId}</td>
                    <td className="font-mono">{p.reference}</td>
                    <td>{p.rail === 'INTERNAL' ? 'Within Vinay Bank' : p.rail}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      ) : (
        <Row className="g-4 mb-4">
          <Col lg={5}>
            <Card className="h-100">
              <Card.Body>
                <h2 className="card-title-sm mb-3">1. Choose a file</h2>
                <Form.Group controlId="bulk-file" className="mb-3">
                  <Form.Label>pain.001 XML file</Form.Label>
                  <Form.Control
                    type="file"
                    accept=".xml,text/xml,application/xml"
                    onChange={(e) => void onFile((e.target as HTMLInputElement).files?.[0])}
                  />
                  <Form.Text>
                    {fileName
                      ? `${fileName} (${(xml.length / 1024).toFixed(1)} KB)`
                      : 'Customer Credit Transfer Initiation, version 03 or 09. Up to 100 payments.'}
                  </Form.Text>
                </Form.Group>
                <Button disabled={!xml || previewState.isLoading} onClick={() => void check()}>
                  {previewState.isLoading && <Spinner size="sm" className="me-2" />}
                  Check file
                </Button>
                <hr />
                <div className="small text-body-secondary mb-2">
                  No file? Download a sample for one of your accounts:
                </div>
                <div className="d-flex gap-2">
                  <Form.Select
                    size="sm"
                    aria-label="Account for the sample"
                    value={sampleFor}
                    onChange={(e) => setSampleAccount(e.target.value)}
                  >
                    {active.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nickname ?? titleCase(a.type)} · {a.maskedNumber}
                      </option>
                    ))}
                  </Form.Select>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => void downloadSample()}
                    disabled={!sampleFor}
                  >
                    Sample
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
          <Col lg={7}>
            <Card className="h-100">
              <Card.Body>
                <h2 className="card-title-sm mb-3">2. Review and approve</h2>
                {previewState.error && (
                  <Alert variant="danger">{errorMessage(previewState.error)}</Alert>
                )}
                {!checked ? (
                  <EmptyState
                    icon="bi-file-earmark-code"
                    title="No file checked yet"
                    description="Choose a file and select Check file."
                  />
                ) : (
                  <>
                    {checked.issues.filter((i) => !i.payment).length > 0 && (
                      <Alert variant="danger" className="small">
                        <div className="fw-semibold mb-1">The file cannot be paid:</div>
                        <ul className="mb-0 ps-3">
                          {checked.issues
                            .filter((i) => !i.payment)
                            .map((i) => (
                              <li key={i.path + i.message}>
                                <span className="font-mono">{i.path}</span>: {i.message}
                              </li>
                            ))}
                        </ul>
                      </Alert>
                    )}
                    {checked.messageId && (
                      <div className="row g-2 small mb-3">
                        <div className="col-6 col-md-3">
                          <div className="text-body-secondary">Message ID</div>
                          <div className="font-mono text-break">{checked.messageId}</div>
                        </div>
                        <div className="col-6 col-md-3">
                          <div className="text-body-secondary">Debit account</div>
                          <div className="font-mono">
                            {checked.debitAccount?.maskedNumber ?? '-'}
                          </div>
                        </div>
                        <div className="col-6 col-md-3">
                          <div className="text-body-secondary">Payments</div>
                          <div>
                            {checked.totals.count} ({checked.totals.internal} internal,{' '}
                            {checked.totals.neft} NEFT)
                          </div>
                        </div>
                        <div className="col-6 col-md-3">
                          <div className="text-body-secondary">Total</div>
                          <div className="fw-semibold">{formatMoney(checked.totals.amount)}</div>
                        </div>
                      </div>
                    )}
                    {checked.payments.length > 0 && <PreviewTable preview={checked} />}
                    {checked.valid && checked.otp && (
                      <div className="d-flex flex-column flex-md-row gap-2 align-items-md-end">
                        <Form.Group controlId="bulk-otp" className="flex-grow-1">
                          <Form.Label className="small">
                            {checked.otp.channel === 'TOTP'
                              ? 'Code from your authenticator app'
                              : `One-time password sent to ${checked.otp.destination}`}
                          </Form.Label>
                          <Form.Control
                            className="otp-input"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            placeholder="000000"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          />
                        </Form.Group>
                        <Button
                          variant="success"
                          disabled={otp.length !== 6 || submitState.isLoading}
                          onClick={() => void pay()}
                        >
                          {submitState.isLoading && <Spinner size="sm" className="me-2" />}
                          Pay {checked.totals.count} payments ({formatMoney(checked.totals.amount)})
                        </Button>
                      </div>
                    )}
                    {submitState.error && (
                      <Alert variant="danger" className="small mt-3 mb-0">
                        {errorMessage(submitState.error)}
                      </Alert>
                    )}
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      <Card>
        <Card.Body>
          <h2 className="card-title-sm mb-3">Recent files</h2>
          {batches.length ? (
            <Table className="table-ab table-stack align-middle small mb-0">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Uploaded</th>
                  <th>Payments</th>
                  <th className="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td data-label="File" className="font-mono">
                      {b.messageId}
                    </td>
                    <td data-label="Uploaded">{formatDateTime(b.createdAt)}</td>
                    <td data-label="Payments">
                      {b.paymentCount} ({b.internalCount} internal, {b.neftCount} NEFT)
                    </td>
                    <td data-label="Total" className="text-end">
                      <Money paise={b.totalAmount} className="fw-semibold" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon="bi-files" title="No bulk files yet" />
          )}
        </Card.Body>
      </Card>
    </>
  );
}
