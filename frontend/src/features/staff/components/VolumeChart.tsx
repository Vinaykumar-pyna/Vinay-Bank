import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { niceTicks } from '@/lib/niceTicks';
import type { DailyVolume } from '../types';

interface TooltipProps {
  active?: boolean;
  label?: string;
  payload?: { payload: DailyVolume }[];
}

function VolumeTooltip({ active, label, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="card shadow-sm px-3 py-2 small" style={{ minWidth: 170 }}>
      <div className="fw-semibold mb-1">{label}</div>
      <div className="d-flex gap-3">
        <span className="text-body-secondary">Value</span>
        <span className="ms-auto fw-medium">{formatMoney(point.amount)}</span>
      </div>
      <div className="d-flex gap-3">
        <span className="text-body-secondary">Transactions</span>
        <span className="ms-auto fw-medium">{point.count.toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
}

/**
 * Settled transaction value per day for the last 7 days. One series, so no
 * legend box (the card title names it); thin columns with rounded data-ends,
 * round-number ticks, a hover tooltip and a hidden table for screen readers.
 */
export function VolumeChart({ data }: { data: DailyVolume[] }) {
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.amount)));
  return (
    <div>
      <div style={{ width: '100%', height: 240 }} aria-hidden="true">
        <ResponsiveContainer>
          <BarChart
            data={data}
            barCategoryGap="35%"
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
            {/* isAnimationActive: animate on every device (by default Recharts skips it under reduced motion). */}
            <Tooltip
              content={<VolumeTooltip />}
              cursor={{ fill: 'var(--bs-tertiary-bg)' }}
              isAnimationActive
            />
            <Bar
              dataKey="amount"
              name="Value"
              fill="var(--vb-series-1)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="visually-hidden">
        <caption>Settled transaction value per day, last 7 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Value</th>
            <th scope="col">Transactions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.label}</th>
              <td>{formatMoney(d.amount)}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
