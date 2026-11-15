import { useState } from 'react';
import { Badge, Button, Card, Col, Row, Table } from 'react-bootstrap';
import { EmptyState } from '@/components/common/EmptyState';
import type { SimulatorOutcome, WireExchange, WireMessage } from '@/features/cards/types';
import { hexDump } from '@/lib/hexDump';

export interface InspectedExchange {
  id: number;
  outcome: SimulatorOutcome;
  exchange: WireExchange;
}

function MessageView({ title, message }: { title: string; message: WireMessage }) {
  return (
    <div>
      <div className="d-flex align-items-baseline gap-2 mb-1">
        <span className="fw-semibold">{title}</span>
        <span className="font-mono">{message.mti}</span>
        <span className="small text-body-secondary text-truncate">{message.mtiName}</span>
      </div>
      <div className="small text-body-secondary mb-2">
        Bitmap <span className="font-mono">{message.bitmap}</span> · {message.bytes} bytes
      </div>
      <Table size="sm" className="small mb-2 inspector-table">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Data element</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {message.fields.map((f) => (
            <tr key={f.field}>
              <td className="font-mono">{f.field}</td>
              <td>{f.name}</td>
              <td className="font-mono text-break">{f.value}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <pre className="hex-dump mb-0" aria-label={`${title} bytes`}>
        {hexDump(message.hex)}
      </pre>
    </div>
  );
}

/**
 * Shows each request/response pair as it crossed the wire: message type,
 * bitmap, data elements and a hex dump, with cardholder data masked.
 */
export function MessageInspector({ items }: { items: InspectedExchange[] }) {
  const [openId, setOpenId] = useState<number>();
  if (!items.length) {
    return (
      <Card>
        <Card.Body>
          <EmptyState
            icon="bi-diagram-3"
            title="Nothing on the wire yet"
            description="Run an echo test or a transaction to see the ISO 8583 messages here."
          />
        </Card.Body>
      </Card>
    );
  }
  const expanded = openId ?? items[0].id;
  return (
    <div className="d-grid gap-3">
      {items.map(({ id, outcome, exchange }) => {
        const open = id === expanded;
        return (
          <Card key={id}>
            <Card.Body>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className="font-mono fw-semibold">
                  {exchange.request.mti} → {exchange.response.mti}
                </span>
                <Badge
                  bg={outcome.approved ? 'success-subtle' : 'danger-subtle'}
                  text={outcome.approved ? 'success-emphasis' : 'danger-emphasis'}
                  className="rounded-pill border"
                >
                  {outcome.responseCode} {outcome.message}
                </Badge>
                <span className="small text-body-secondary">
                  {exchange.roundTripMs} ms · STAN {outcome.stan}
                </span>
                <Button
                  size="sm"
                  variant="link"
                  className="ms-auto p-0"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? -1 : id)}
                >
                  {open ? 'Hide' : 'Show'} messages
                </Button>
              </div>
              <div className="small text-body-secondary mt-1">
                <i className="bi bi-shield-lock me-1" aria-hidden="true" />
                {exchange.tls.protocol} · {exchange.tls.cipher} · server certificate CN=
                {exchange.tls.serverCertificate} · client certificate presented
              </div>
              {open && (
                <Row className="g-4 mt-1">
                  <Col xl={6}>
                    <MessageView title="Request" message={exchange.request} />
                  </Col>
                  <Col xl={6}>
                    <MessageView title="Response" message={exchange.response} />
                  </Col>
                </Row>
              )}
            </Card.Body>
          </Card>
        );
      })}
      <p className="small text-body-secondary mb-0">
        Card number masked to the first six and last four digits; PIN block (field 52) and expiry
        (field 14) hidden. Field 64 or 128 is the MAC: HMAC-SHA256 truncated to 8 bytes, checked by
        the switch and by this terminal.
      </p>
    </div>
  );
}
