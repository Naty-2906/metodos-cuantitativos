"use client";
import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { BookOpen, Scale, FileText, Settings } from "lucide-react";
import Operations from "./operations";
import FinancialReports from "./financial-reports";
import { accountNames, type JournalView } from "@/lib/accounting";
import { report } from "@/lib/reports";
type Props = {
  finance: { ready: boolean; documentsReady?: boolean; entries: JournalView[] };
  timezone: string;
  currency: string;
  busy: boolean;
  send: (body: Record<string, unknown>) => Promise<boolean | undefined>;
  onSettings: () => void;
};
const tabs = [
  { name: "Registrar una operación", icon: BookOpen },
  { name: "Lo que tengo y debo", icon: Scale },
  { name: "Ganancias y pérdidas", icon: FileText },
  { name: "Libro diario (detalle)", icon: BookOpen },
  { name: "IVA", icon: FileText },
];
export default function AccountingWorkspace(props: Props) {
  const [tab, setTab] = useState(tabs[0].name),
    [month, setMonth] = useState(() =>
      formatInTimeZone(new Date(), props.timezone, "yyyy-MM"),
    );
  const r = report(
    props.finance.entries,
    month,
    props.timezone,
    props.currency,
  );
  const money = (n: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: props.currency,
    }).format(n / 100);
  return (
    <div className="accounting-workspace">
      <nav
        aria-label="Secciones de contabilidad"
        className="flex flex-wrap gap-2 mb-8"
      >
        {tabs.map(({ name, icon: Icon }) => (
          <button
            type="button"
            key={name}
            onClick={() => setTab(name)}
            aria-current={tab === name ? "page" : undefined}
            className={`accounting-tab ${tab === name ? "accounting-tab-active" : ""}`}
          >
            <Icon size={16} />
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={props.onSettings}
          className="accounting-tab"
        >
          <Settings size={16} />
          Configuración
        </button>
      </nav>
      {tab === "Registrar una operación" && (
        <>
          <Operations
            {...props}
            onViewLedger={() => setTab("Libro diario (detalle)")}
          />
          <FinancialReports {...props} mode="documents" />
        </>
      )}
      {tab === "Ganancias y pérdidas" && <FinancialReports {...props} />}
      {(tab === "Lo que tengo y debo" ||
        tab === "IVA" ||
        tab === "Libro diario (detalle)") && (
        <>
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <div>
              <p className="eyebrow">CONTABILIDAD SIMPLE</p>
              <h2 className="text-3xl font-semibold mt-3">{tab}</h2>
            </div>
            <label>
              Mes
              <input
                aria-label="Mes contable"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
          </div>
          {tab === "Lo que tengo y debo" && (
            <>
              <p className="muted text-sm mb-5">
                Tus bienes y deudas según lo que has registrado hasta el mes
                elegido.
              </p>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  ["Lo que tiene el negocio", r.assets],
                  ["Lo que debe el negocio", r.liabilities],
                  ["Lo que queda al dueño", r.equity],
                ].map(([label, n]) => (
                  <div className="card" key={String(label)}>
                    <p className="muted text-sm">{label}</p>
                    <strong className="text-3xl block mt-4">
                      {money(Number(n))}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="card mt-5 space-y-4">
                {[
                  ["Efectivo registrado", r.cumulative.cash],
                  ["Dinero en banco registrado", r.cumulative.bank],
                  ["Ventas que falta cobrar", r.cumulative.receivable],
                  ["Compras que falta pagar", r.cumulative.payable],
                  ["Préstamos que falta pagar", r.cumulative.loans],
                  ["Equipos y muebles", r.cumulative.equipment],
                ].map(([s, n]) => (
                  <p
                    className="flex justify-between gap-3 text-sm"
                    key={String(s)}
                  >
                    <span>{s}</span>
                    <strong>{money(Number(n))}</strong>
                  </p>
                ))}
              </div>
              <p className="muted text-xs mt-4">
                Los saldos dependen de tus registros y no incluyen dinero
                anterior al primer movimiento. El contador debe revisar saldos
                iniciales y ajustes.
              </p>
            </>
          )}
          {tab === "IVA" && (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  ["IVA de tus ventas", r.vatOutput],
                  ["IVA que puedes descontar registrado", r.vatInput],
                  ["IVA pagado en compras este mes", r.paidPurchaseVat],
                ].map(([s, n]) => (
                  <div className="card" key={String(s)}>
                    <p className="muted text-sm">{s}</p>
                    <strong className="text-3xl block mt-4">
                      {money(Number(n))}
                    </strong>
                  </div>
                ))}
              </div>
              <p className="text-sm rounded-xl bg-amber-50 p-4 my-5">
                {r.missing} movimientos necesitan revisar su boleta o factura.
                Tu régimen está por confirmar: no todo IVA pagado se puede
                descontar. Este resumen no es una declaración al SII.
              </p>
              <FinancialReports {...props} mode="documents" />
            </>
          )}
          {tab === "Libro diario (detalle)" && (
            <section className="card">
              <p className="muted text-sm mb-5">
                Se completa automáticamente al guardar. Aquí también quedan las
                correcciones.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th>Fecha / operación</th>
                      <th>Cuenta</th>
                      <th className="text-right">Debe</th>
                      <th className="text-right">Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.period.flatMap((e) =>
                      e.lines.map((l, i) => (
                        <tr key={e.id + ":" + i} className="border-t">
                          <td className="py-3 pr-3">
                            {i === 0 && (
                              <>
                                <p>
                                  {formatInTimeZone(
                                    e.date,
                                    props.timezone,
                                    "dd/MM/yyyy",
                                  )}
                                </p>
                                <p className="muted text-xs mt-1">
                                  {e.description}
                                </p>
                              </>
                            )}
                          </td>
                          <td className="py-3">
                            {accountNames[
                              l.account as keyof typeof accountNames
                            ] ?? l.account}
                          </td>
                          <td className="text-right">
                            {l.debit ? money(l.debit) : "—"}
                          </td>
                          <td className="text-right">
                            {l.credit ? money(l.credit) : "—"}
                          </td>
                        </tr>
                      )),
                    )}
                    {!r.period.length && (
                      <tr>
                        <td colSpan={4} className="py-6 muted">
                          Todavía no hay movimientos en este mes.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {props.finance.ready && month && (
            <a
              className="primary inline-flex mt-6"
              href={`/api/admin/report?month=${encodeURIComponent(month)}`}
            >
              Descargar Excel para mi contador
            </a>
          )}
        </>
      )}
    </div>
  );
}
