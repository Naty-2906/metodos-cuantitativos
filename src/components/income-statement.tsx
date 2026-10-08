"use client";
import { report } from "@/lib/reports";
import type { JournalView } from "@/lib/accounting";
import { IncomeExpenseChart, FinanceTrend } from "./finance-charts";
export default function IncomeStatement({
  entries,
  month,
  setMonth,
  timezone,
  currency,
  ready,
}: {
  entries: JournalView[];
  month: string;
  setMonth: (s: string) => void;
  timezone: string;
  currency: string;
  ready: boolean;
}) {
  const r = report(entries, month, timezone, currency),
    money = (v: number) =>
      new Intl.NumberFormat("es-CL", { style: "currency", currency }).format(
        v === 0 ? 0 : v / 100,
      );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-semibold">Estado de resultados</h2>
          <p className="muted text-sm mt-3">
            Ingresos, costos y gastos de {month}, en el orden en que se calcula
            tu resultado.
          </p>
        </div>
        <label>
          Mes
          <input
            aria-label="Mes del resumen"
            type="month"
            value={month}
            onChange={(e) => {
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                setMonth(e.target.value);
            }}
          />
        </label>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          ["Ingresos netos", r.totals.income],
          ["Gastos y costos", r.totals.expenses],
          ["Resultado del mes", r.totals.profit],
        ].map(([label, n], i) => (
          <section
            className={`card ${i === 2 ? "profit-highlight" : ""}`}
            key={String(label)}
          >
            <p className="muted text-sm">{label}</p>
            <strong className="block text-3xl mt-5">{money(Number(n))}</strong>
            <p className="muted text-xs mt-4">
              {i === 2
                ? "Antes de impuesto a la renta"
                : "Según el libro diario"}
            </p>
          </section>
        ))}
      </div>
      <section className="card">
        <h3 className="font-semibold text-lg mb-5">
          Ganancias y pérdidas · {month}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left pb-3">Concepto</th>
                <th className="text-right pb-3">Monto ({currency})</th>
              </tr>
            </thead>
            <tbody>
              {r.incomeStatement.map((row) => (
                <tr
                  key={row.label}
                  className={`border-b ${row.section === "result" ? "bg-[#214e3f] text-white" : row.section === "subtotal" ? "bg-[#eff5f1] font-semibold" : ""}`}
                >
                  <td className="py-4 px-3">{row.label}</td>
                  <td className="text-right py-4 px-3 whitespace-nowrap">
                    {money(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted text-xs mt-4 leading-5">
          Incluye ventas y gastos pendientes. El IVA recuperable queda fuera del
          costo; el IVA sin derecho a crédito se incluye. Aportes, retiros,
          capital de préstamos y compras de equipos no son ingresos o gastos de
          este informe. No se incluyen ajustes aún no registrados, como
          depreciación o impuesto a la renta.
        </p>
      </section>
      <div className="grid lg:grid-cols-2 gap-5">
        <IncomeExpenseChart
          income={r.totals.income}
          expenses={r.totals.expenses}
          currency={currency}
          month={month}
        />
        <FinanceTrend
          entries={entries}
          month={month}
          timezone={timezone}
          currency={currency}
        />
      </div>
      {ready && (
        <a
          className="primary inline-flex"
          href={`/api/admin/report?month=${encodeURIComponent(month)}`}
        >
          Descargar estado de resultados y reportes en Excel
        </a>
      )}
    </div>
  );
}
