"use client";
import { report } from "@/lib/reports";
import type { JournalView } from "@/lib/accounting";
export function IncomeExpenseChart({
  income,
  expenses,
  currency,
  month,
}: {
  income: number;
  expenses: number;
  currency: string;
  month: string;
}) {
  const money = (v: number) =>
      new Intl.NumberFormat("es-CL", { style: "currency", currency }).format(
        v / 100,
      ),
    max = Math.max(Math.abs(income), Math.abs(expenses), 1);
  return (
    <section className="card">
      <div className="flex justify-between gap-4">
        <h3 className="text-lg font-semibold">Ingresos y gastos</h3>
        <span className="muted text-sm">{month}</span>
      </div>
      <svg
        role="img"
        aria-label={`Ingresos ${money(income)} y gastos ${money(expenses)} en ${month}`}
        viewBox="0 0 500 240"
        className="w-full mt-5"
      >
        <line x1="40" y1="190" x2="460" y2="190" stroke="#dce5df" />
        {[
          { name: "Ingresos", value: income, x: 125, color: "#376d56" },
          {
            name: "Gastos y costos",
            value: expenses,
            x: 305,
            color: "#d9bd82",
          },
        ].map((v) => {
          const height = (Math.abs(v.value) / max) * 125;
          return (
            <g key={v.name}>
              <rect
                x={v.x}
                y={190 - height}
                width="64"
                height={height}
                rx="7"
                fill={v.color}
              />
              <text
                x={v.x + 32}
                y={175 - height}
                textAnchor="middle"
                fontSize="14"
                fill="#293936"
              >
                {money(v.value)}
              </text>
              <text
                x={v.x + 32}
                y="220"
                textAnchor="middle"
                fontSize="14"
                fill="#71877b"
              >
                {v.name}
              </text>
            </g>
          );
        })}
      </svg>
      {!income && !expenses && (
        <p className="muted text-sm">
          Todavía no hay ingresos ni gastos registrados en este mes.
        </p>
      )}
    </section>
  );
}
export function FinanceTrend({
  entries,
  month,
  timezone,
  currency,
}: {
  entries: JournalView[];
  month: string;
  timezone: string;
  currency: string;
}) {
  const end = new Date(month + "-01T12:00:00Z");
  const series = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(end);
    date.setUTCMonth(date.getUTCMonth() - 5 + i);
    const key = date.toISOString().slice(0, 7);
    return { month: key, ...report(entries, key, timezone, currency).totals };
  });
  const maximum = Math.max(
    1,
    ...series.flatMap((v) => [Math.abs(v.income), Math.abs(v.expenses)]),
  );
  const points = (field: "income" | "expenses") =>
    series
      .map((s, i) => `${45 + i * 82},${180 - (s[field] / maximum) * 125}`)
      .join(" ");
  return (
    <section className="card">
      <h3 className="text-lg font-semibold">Evolución de ingresos y gastos</h3>
      <p className="muted text-sm mt-2">
        Últimos seis meses · importes contables
      </p>
      <svg
        role="img"
        aria-label="Evolución mensual de ingresos y gastos; los valores también aparecen en la tabla"
        viewBox="0 0 500 225"
        className="w-full mt-4 max-h-72"
      >
        <line x1="40" y1="180" x2="460" y2="180" stroke="#dce5df" />
        <polyline
          points={points("income")}
          fill="none"
          stroke="#376d56"
          strokeWidth="3"
        />
        <polyline
          points={points("expenses")}
          fill="none"
          stroke="#d9bd82"
          strokeWidth="3"
        />
        {series.map((s, i) => (
          <text
            key={s.month}
            x={45 + i * 82}
            y="211"
            textAnchor="middle"
            fontSize="12"
            fill="#71877b"
          >
            {new Intl.DateTimeFormat("es-CL", {
              month: "short",
              timeZone: "UTC",
            }).format(new Date(s.month + "-15T12:00:00Z"))}
          </text>
        ))}
      </svg>
      <div className="flex gap-5 text-xs">
        <span className="text-[#376d56]">● Ingresos</span>
        <span className="text-[#9e7d3c]">● Gastos</span>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer muted">
          Ver valores del gráfico
        </summary>
        <table className="w-full mt-3">
          <thead>
            <tr>
              <th className="text-left">Mes</th>
              <th>Ingresos</th>
              <th>Gastos</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.month}>
                <td>{s.month}</td>
                <td className="text-right">
                  {new Intl.NumberFormat("es-CL").format(s.income / 100)}
                </td>
                <td className="text-right">
                  {new Intl.NumberFormat("es-CL").format(s.expenses / 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
