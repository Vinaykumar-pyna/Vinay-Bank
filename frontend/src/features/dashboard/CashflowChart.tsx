import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { niceTicks } from '@/lib/niceTicks';

interface CashflowPoint {
  month: string;
  label: string;
  inflow: number;
  outflow: number;
}

const SERIES = [
  { key: 'inflow', label: 'Money in', color: 'var(--ab-series-1)' },
  { key: 'outflow', label: 'Money out', color: 'var(--ab-series-2)' },
] as const;

interface TooltipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value: number }[];
}

function CashflowTooltip({ active, label, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const value = (key: string) => payload.find((p) => p.dataKey === key)?.value ?? 0;
  const net = value('inflow') - value('outflow');
  return (
    <div className="card shadow-sm px-3 py-2 small" style={{ minWidth: 180 }}>
      <div className="fw-semibold mb-1">{label}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="d-flex align-items-center gap-2">
          <span
            className="rounded-1"
            style={{ width: 10, height: 10, background: s.color }}
            aria-hidden="true"
          />
          <span className="text-body-secondary">{s.label}</span>
          <span className="ms-auto fw-medium">{formatMoney(value(s.key))}</span>
        </div>
      ))}
      <div className="d-flex border-top mt-1 pt-1">
        <span className="text-body-secondary">Net</span>
        <span className="ms-auto fw-semibold">{formatMoney(net)}</span>
      </div>
    </div>
  );
}

/**
 * Money in vs money out per month: two categorical series (validated blue and
 * orange, never green/red, which are reserved for status), thin columns with
 * rounded data-ends, hairline gridlines, legend + hover tooltip, and a hidden
 * data table for screen readers.
 */
export function CashflowChart({ data }: { data: CashflowPoint[] }) {
  const ticks = niceTicks(Math.max(0, ...data.flatMap((d) => [d.inflow, d.outflow])));
  return (
    <div>
      <ul className="list-unstyled d-flex gap-3 small mb-2" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="d-flex align-items-center gap-2 text-body-secondary">
            <span
              className="rounded-1"
              style={{ width: 12, height: 12, background: s.color }}
              aria-hidden="true"
            />
            {s.label}
          </li>
        ))}
      </ul>
      <div style={{ width: '100%', height: 260 }} aria-hidden="true">
        <ResponsiveContainer>
          <BarChart
            data={data}
            barGap={2}
            barCategoryGap="30%"
            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--bs-border-color)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--bs-border-color)' }}
              tick={{ fill: 'var(--bs-secondary-color)', fontSize: 12 }}
            />
            <YAxis
              width={64}
              ticks={ticks}
              domain={[0, ticks.at(-1) ?? 0]}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatMoneyCompact(v)}
              tick={{ fill: 'var(--bs-secondary-color)', fontSize: 12 }}
            />
            <Tooltip content={<CashflowTooltip />} cursor={{ fill: 'var(--bs-tertiary-bg)' }} />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="visually-hidden">
        <caption>Money in and money out by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Money in</th>
            <th scope="col">Money out</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{d.label}</th>
              <td>{formatMoney(d.inflow)}</td>
              <td>{formatMoney(d.outflow)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
