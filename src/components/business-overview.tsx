"use client";
import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Wallet, ArrowDownLeft, TrendingUp, CalendarDays } from "lucide-react";
import type { JournalView } from "@/lib/accounting";
import type { ScheduleDates } from "@/lib/schedule";
import { report } from "@/lib/reports";
import { agendaOccupancy } from "@/lib/agenda-metrics";
import { IncomeExpenseChart, FinanceTrend } from "./finance-charts";
type Props = {
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
  finance: { ready: boolean; entries: JournalView[] };
  config: {
    timezone: string;
    currency: string;
    open: string;
    close: string;
    workingDays: number[];
  };
  schedule: ScheduleDates;
  scheduleReady: boolean;
  appointments: { start: string; end: string; status: string }[];
  blocks: { start: string; end: string }[];
};
export default function BusinessOverview(props: Props) {
  const { config } = props,
    [localMonth, setLocalMonth] = useState(() =>
      formatInTimeZone(new Date(), config.timezone, "yyyy-MM"),
    ),
    month = props.selectedMonth ?? localMonth,
    setMonth = props.onMonthChange ?? setLocalMonth,
    r = report(props.finance.entries, month, config.timezone, config.currency);
  const money = (v: number) =>
      new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: config.currency,
      }).format(v === 0 ? 0 : v / 100),
    occupancy = agendaOccupancy({
      ...props,
      ...config,
      month,
      ready: props.scheduleReady,
    }),
    margin = r.totals.income ? (r.totals.profit / r.totals.income) * 100 : 0;
  const metrics = [
    {
      label: "Ingresos contables",
      value: money(r.totals.income),
      detail: "Según el libro diario",
      icon: Wallet,
    },
    {
      label: "Gastos y costos",
      value: money(r.totals.expenses),
      detail: "Según el libro diario",
      icon: ArrowDownLeft,
    },
    {
      label: "Ganancia del mes",
      value: money(r.totals.profit),
      detail: "Ingresos menos gastos",
      icon: TrendingUp,
    },
    {
      label: "Ocupación de agenda",
      value: occupancy.percentage.toFixed(0) + "%",
      detail: occupancy.capacityMinutes
        ? "Sobre tus horarios publicados"
        : "Sin horarios publicados en este mes",
      icon: CalendarDays,
    },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold">
            Así va tu negocio.
          </h1>
          <p className="muted text-sm mt-3">
            Tu agenda y tus números, en un solo lugar.
          </p>
        </div>
        <label>
          Mes
          <input
            aria-label="Mes del negocio"
            type="month"
            value={month}
            onChange={(e) => {
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                setMonth(e.target.value);
            }}
          />
        </label>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(({ label, value, detail, icon: Icon }, i) => (
          <section
            key={label}
            className={`card ${i === 2 ? "profit-highlight" : ""}`}
          >
            <div className="flex justify-between gap-2">
              <p className="muted text-sm">{label}</p>
              <Icon size={17} className="muted" />
            </div>
            <strong className="block text-3xl mt-5">{value}</strong>
            <p className="muted text-xs mt-5">{detail}</p>
          </section>
        ))}
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <IncomeExpenseChart
          income={r.totals.income}
          expenses={r.totals.expenses}
          month={month}
          currency={config.currency}
        />
        <section className="card bg-[#eef4ef]">
          <p className="eyebrow">SALUD DEL NEGOCIO</p>
          <h2 className="text-3xl font-semibold mt-6">
            {r.totals.profit < 0
              ? "Revisa tus gastos"
              : r.totals.income
                ? "Vas por buen camino"
                : "Tu negocio comienza aquí"}
          </h2>
          <p className="muted text-sm leading-6 mt-4">
            {r.totals.profit < 0
              ? "Tus gastos registrados superan los ingresos contables."
              : r.totals.income
                ? "Tus ingresos registrados cubren los gastos del mes."
                : "Registra ventas y gastos para ver cómo va tu barbería."}
          </p>
          <div className="space-y-4 mt-7 text-sm">
            {[
              [
                "Margen de ganancia",
                r.totals.income
                  ? margin.toFixed(1) + "%"
                  : "Sin ventas registradas",
              ],
              ["Ventas por cobrar", money(r.cumulative.receivable)],
              ["Compras por pagar", money(r.cumulative.payable)],
            ].map(([label, value]) => (
              <p
                key={label}
                className="flex justify-between gap-3 border-b pb-3"
              >
                <span>{label}</span>
                <strong>{value}</strong>
              </p>
            ))}
          </div>
        </section>
      </div>
      <FinanceTrend
        entries={props.finance.entries}
        month={month}
        timezone={config.timezone}
        currency={config.currency}
      />
    </div>
  );
}
