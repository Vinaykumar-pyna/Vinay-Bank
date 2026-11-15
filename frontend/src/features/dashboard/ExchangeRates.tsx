import { useState } from 'react';
import { Badge, Card, Form, InputGroup, Placeholder } from 'react-bootstrap';
import { formatDate } from '@/lib/format';
import { useGetForexRatesQuery } from './forexApi';

const SOURCE_LABEL = {
  LIVE: 'Live',
  CACHE: 'Cached',
  OFFLINE: 'Indicative',
} as const;

/**
 * Reference exchange rates (ECB data via the Frankfurter API) with a quick
 * converter. When the live source is down the API serves indicative rates,
 * and the badge says so.
 */
export function ExchangeRates() {
  const { data, isLoading, isError } = useGetForexRatesQuery();
  const [rupees, setRupees] = useState('10000');
  const [currency, setCurrency] = useState('USD');
  const rate = data?.rates.find((r) => r.currency === currency);
  const amount = Number(rupees) || 0;
  const converted = rate ? amount * rate.perRupee : 0;

  return (
    <Card className="h-100">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="h6 mb-0">Exchange rates</h2>
          {data && (
            <Badge
              bg={data.source === 'OFFLINE' ? 'warning-subtle' : 'secondary-subtle'}
              text={data.source === 'OFFLINE' ? 'warning-emphasis' : 'secondary-emphasis'}
              className="rounded-pill border"
              title={
                data.source === 'OFFLINE'
                  ? 'The rate source is unreachable'
                  : 'European Central Bank reference rates'
              }
            >
              {SOURCE_LABEL[data.source]} · {formatDate(data.date)}
            </Badge>
          )}
        </div>
        {isLoading ? (
          <Placeholder as="div" animation="glow">
            <Placeholder xs={12} />
            <Placeholder xs={10} />
          </Placeholder>
        ) : isError || !data ? (
          <p className="small text-body-secondary mb-0">
            Exchange rates are not available right now.
          </p>
        ) : (
          <>
            <InputGroup size="sm" className="mb-2">
              <InputGroup.Text>₹</InputGroup.Text>
              <Form.Control
                aria-label="Amount in rupees"
                inputMode="decimal"
                value={rupees}
                onChange={(e) => setRupees(e.target.value.replace(/[^\d.]/g, ''))}
              />
              <Form.Select
                aria-label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ maxWidth: 100 }}
              >
                {data.rates.map((r) => (
                  <option key={r.currency} value={r.currency}>
                    {r.currency}
                  </option>
                ))}
              </Form.Select>
            </InputGroup>
            <div className="fw-semibold mb-3" aria-live="polite">
              ≈ {converted.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {currency}
            </div>
            <ul className="list-unstyled mb-0 small d-grid gap-1">
              {data.rates.map((r) => (
                <li key={r.currency} className="d-flex justify-content-between">
                  <span>
                    <span className="fw-medium">{r.currency}</span>{' '}
                    <span className="text-body-secondary">{r.name}</span>
                  </span>
                  <span className="font-mono">
                    ₹{r.rupeesPerUnit.toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
