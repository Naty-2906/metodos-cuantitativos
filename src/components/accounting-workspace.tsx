"use client";
import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { BookOpen, Scale, FileText, Settings } from "lucide-react";
import TaxSettings from "./tax-settings";
import Operations from "./operations";
import FinancialReports from "./financial-reports";
import {
  accountNames,
  accountClassification,
  type JournalView,
} from "@/lib/accounting";
import { report, isVoided } from "@/lib/reports";
type Props = {
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
  taxProfile?: { ready: boolean; treatment: "UNKNOWN" | "AFFECTED" | "EXEMPT" };
  finance: { ready: boolean; documentsReady?: boolean; entries: JournalView[] };
  timezone: string;
  currency: string;
  busy: boolean;
  send: (body: Record<string, unknown>) => Promise<boolean | undefined>;
  onSettings: () => void;
};
const tabs = [
  { name: "Registrar una operación", icon: BookOpen },
  { name: "Balance general", icon: Scale },
  { name: "Ganancias y pérdidas", icon: FileText },
  { name: "Libro diario (detalle)", icon: BookOpen },
  { name: "IVA", icon: FileText },
];
export default function AccountingWorkspace(props: Props) {
  const [correction, setCorrection] = useState(""),
    [reason, setReason] = useState("");
  const [tab, setTab] = useState(tabs[0].name),
    [localMonth, setLocalMonth] = useState(() =>
      formatInTimeZone(new Date(), props.timezone, "yyyy-MM"),
    );
  const month = props.selectedMonth ?? localMonth,
    setMonth = props.onMonthChange ?? setLocalMonth;
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
    }).format(n === 0 ? 0 : n / 100);
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
          onClick={() => setTab("Configuración")}
          className={`accounting-tab ${tab === "Configuración" ? "accounting-tab-active" : ""}`}
        >
          <Settings size={16} />
          Configuración
        </button>
      </nav>
      {tab === "Configuración" && (
        <TaxSettings
          profile={props.taxProfile}
          busy={props.busy}
          send={props.send}
        />
      )}
      {tab === "Registrar una operación" && (
        <>
          <Operations
            {...props}
            onViewLedger={() => setTab("Libro diario (detalle)")}
          />
          <FinancialReports {...props} mode="documents" />
          <details className="card mb-6">
            <summary className="cursor-pointer font-semibold">
              Tu rutina para llevar los números sin complicarte
            </summary>
            <ol className="list-decimal pl-5 space-y-3 mt-4 text-sm">
              <li>
                Registra cada venta o marca el servicio cobrado en la agenda.
                Evita anotarlo dos veces.
              </li>
              <li>
                Para compras, escanea el documento y comprueba el total y la
                fecha de emisión.
              </li>
              <li>
                Indica si ya pagaste o si quedó pendiente. Registra el pago
                después, desde “Por cobrar / pagar”.
              </li>
              <li>
                Si te equivocas, revierte la operación en la revisión de
                documentos y registra la correcta.
              </li>
              <li>
                Al cerrar el mes, revisa ganancias, pendientes e IVA; descarga
                el Excel y contrasta tus documentos con el SII.
              </li>
            </ol>
            <p className="muted text-xs mt-4">
              La gestión diaria se completa aquí. Declaraciones tributarias y
              ajustes especiales requieren validar los antecedentes reales del
              negocio.
            </p>
          </details>
        </>
      )}
      {tab === "Ganancias y pérdidas" && (
        <FinancialReports
          {...props}
          selectedMonth={month}
          onMonthChange={setMonth}
        />
      )}
      {(tab === "Balance general" ||
        tab === "IVA" ||
        tab === "Libro diario (detalle)") && (
        <>
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <div>
              <p className="eyebrow">CONTABILIDAD SIMPLE</p>
              <h2 className="text-3xl font-semibold mt-3">
                {tab === "IVA"
                  ? "Resumen de IVA"
                  : tab === "Libro diario (detalle)"
                    ? `Asientos de ${month}`
                    : tab}
              </h2>
            </div>
            <label>
              Mes
              <input
                aria-label="Mes contable"
                type="month"
                value={month}
                onChange={(e) => {
                  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                    setMonth(e.target.value);
                }}
              />
            </label>
          </div>
          {tab === "Balance general" && (
            <>
              <p className="muted text-sm mb-5">
                Situación del negocio al cierre del mes elegido. Se completa
                automáticamente con el libro diario, incluidos los pagos y las
                reversiones.
              </p>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  ["Total activos", r.assets],
                  ["Total pasivos", r.liabilities],
                  ["Total patrimonio", r.equity],
                ].map(([label, n]) => (
                  <div className="card" key={String(label)}>
                    <p className="muted text-sm">{label}</p>
                    <strong className="text-3xl block mt-4">
                      {money(Number(n))}
                    </strong>
                  </div>
                ))}
              </div>
              <div className="card mt-5">
                <div className="flex flex-wrap justify-between gap-3 mb-5">
                  <h3 className="font-semibold">Balance general · {month}</h3>
                  <a
                    className="text-sm font-semibold"
                    href={`/api/admin/report?month=${month}`}
                  >
                    Descargar Excel
                  </a>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3">Cuenta / concepto</th>
                      <th className="text-right py-3">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.balanceSheet.map((row) => (
                      <tr
                        key={row.label}
                        className={
                          row.section === "total"
                            ? "profit-highlight font-semibold"
                            : row.section === "heading" ||
                                row.section === "subtotal"
                              ? "bg-emerald-50 font-semibold"
                              : "border-b"
                        }
                      >
                        <td className="py-3 px-2">{row.label}</td>
                        <td className="text-right py-3 px-2 whitespace-nowrap">
                          {row.section === "heading" ? "" : money(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p
                  className={`mt-5 text-sm ${r.balanceDifference ? "text-red-700" : "text-emerald-800"}`}
                >
                  {r.balanceDifference === 0
                    ? "Balance cuadrado: activos = pasivos + patrimonio."
                    : `Revisa el libro diario: diferencia de cuadre ${money(r.balanceDifference)}.`}
                </p>
              </div>
              <p className="muted text-xs mt-4">
                Saldos acumulados desde el primer registro, no solo movimientos
                del mes. Los retiros restan patrimonio y las ganancias o
                pérdidas se incorporan automáticamente. Los préstamos se
                muestran sin separar plazos porque no se ha registrado su
                vencimiento. No incluye saldos iniciales ni depreciaciones que
                no hayas registrado.
              </p>
            </>
          )}
          {tab === "IVA" && (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  ["Débito fiscal registrado", r.vatOutput],
                  ["Crédito fiscal registrado", r.vatInput],
                  ["Diferencia del mes", r.vatDifference],
                ].map(([s, n], i) => (
                  <div
                    className={`card ${i === 2 ? "profit-highlight" : ""}`}
                    key={String(s)}
                  >
                    <p className="muted text-sm">{s}</p>
                    <strong className="text-3xl block mt-4">
                      {money(Number(n))}
                    </strong>
                  </div>
                ))}
              </div>
              <p className="text-sm rounded-xl bg-amber-50 p-4 my-5">
                {r.missing} movimientos necesitan revisar su boleta o factura.
                {props.taxProfile?.treatment === "AFFECTED"
                  ? "Negocio configurado como afecto a IVA."
                  : props.taxProfile?.treatment === "EXEMPT"
                    ? "Negocio configurado como exento o no afecto."
                    : "Tu tratamiento de IVA está por confirmar."}{" "}
                No todo IVA pagado se puede descontar. Este resumen no es una
                declaración al SII.
              </p>
              <div className="card my-5">
                <h3 className="font-semibold mb-4">
                  Cómo se trata cada documento
                </h3>
                {[
                  ["Ventas afectas", "IVA de ventas separado del ingreso"],
                  [
                    "Facturas de compra con derecho a crédito confirmado",
                    "IVA descontable registrado",
                  ],
                  [
                    "Boletas de compra / sin derecho a crédito",
                    "Total al costo o al bien comprado",
                  ],
                ].map(([a, b]) => (
                  <p
                    key={a}
                    className="flex flex-wrap justify-between gap-3 border-b py-4 text-sm"
                  >
                    <span>{a}</span>
                    <strong>{b}</strong>
                  </p>
                ))}
                <p className="muted text-sm mt-4">
                  IVA informado en compras pagadas este mes:{" "}
                  {money(r.paidPurchaseVat)}. Si la diferencia es negativa,
                  representa crédito registrado; su uso debe revisarse en el
                  SII.
                </p>
              </div>
              <FinancialReports {...props} mode="documents" />
            </>
          )}
          {tab === "Libro diario (detalle)" && (
            <section className="card">
              <div className="flex justify-between gap-4 mb-5">
                <h3 className="font-semibold">Asientos de {month}</h3>
                <a
                  className="muted text-sm"
                  href={`/api/admin/report?month=${encodeURIComponent(month)}&format=csv`}
                >
                  Exportar CSV
                </a>
              </div>
              <p className="muted text-sm mb-5">
                Se completa automáticamente al guardar. Aquí también quedan las
                correcciones.
              </p>
              <div className="space-y-6">
                {r.period.map((e) => (
                  <article key={e.id} className="border-b pb-6">
                    <div className="flex justify-between gap-4">
                      <div>
                        <p className="muted text-sm">
                          {formatInTimeZone(
                            e.date,
                            props.timezone,
                            "dd/MM/yyyy",
                          )}
                        </p>
                        <h3 className="font-semibold mt-2">{e.description}</h3>
                        <p className="muted text-xs mt-2">
                          {isVoided(e, props.finance.entries)
                            ? "Operación anulada"
                            : e.kind === "REVERSAL"
                              ? "Corrección registrada"
                              : "Asiento registrado"}
                        </p>
                      </div>
                      {!isVoided(e, props.finance.entries) &&
                        e.kind !== "REVERSAL" &&
                        e.kind !== "SETTLEMENT" && (
                          <button
                            type="button"
                            className="text-sm muted self-start"
                            disabled={props.busy}
                            onClick={() => {
                              setCorrection(e.id);
                              setReason("");
                            }}
                          >
                            Revertir
                          </button>
                        )}
                    </div>
                    {correction === e.id && (
                      <form
                        className="rounded-xl border p-4 mt-4"
                        onSubmit={async (event) => {
                          event.preventDefault();
                          if (
                            await props.send({
                              action: "reverse",
                              id: e.id,
                              reason,
                            })
                          )
                            setCorrection("");
                        }}
                      >
                        <p className="text-sm mb-3">
                          Se anularán esta operación y su pago, si lo tiene. El
                          historial se conserva y los informes se actualizan.
                          Después puedes registrar el dato correcto.
                        </p>
                        <label>
                          ¿Qué había que corregir?
                          <input
                            required
                            minLength={5}
                            maxLength={180}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                          />
                        </label>
                        <div className="flex gap-3 mt-3">
                          <button className="primary" disabled={props.busy}>
                            Anular este registro
                          </button>
                          <button
                            type="button"
                            onClick={() => setCorrection("")}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    )}
                    <div className="overflow-x-auto mt-4">
                      <table className="w-full text-sm">
                        <thead className="text-left muted">
                          <tr>
                            <th>Cuenta</th>
                            <th>Clasificación</th>
                            <th className="text-right">Debe</th>
                            <th className="text-right">Haber</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.lines.map((l, i) => (
                            <tr key={i} className="border-t">
                              <td className="py-3">
                                {accountNames[
                                  l.account as keyof typeof accountNames
                                ] ?? l.account}
                              </td>
                              <td className="muted">
                                {accountClassification(l.account)}
                              </td>
                              <td className="text-right">
                                {l.debit ? money(l.debit) : "—"}
                              </td>
                              <td className="text-right">
                                {l.credit ? money(l.credit) : "—"}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t font-semibold bg-[#edf4ef]">
                            <td className="py-3" colSpan={2}>
                              Total
                            </td>
                            <td className="text-right">
                              {money(e.lines.reduce((n, l) => n + l.debit, 0))}
                            </td>
                            <td className="text-right">
                              {money(e.lines.reduce((n, l) => n + l.credit, 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
                {!r.period.length && (
                  <p className="muted">
                    Todavía no hay movimientos en este mes.
                  </p>
                )}
              </div>
            </section>
          )}
          {props.finance.ready && month && (
            <a
              className="primary inline-flex mt-6"
              href={`/api/admin/report?month=${encodeURIComponent(month)}`}
            >
              Descargar Excel del mes
            </a>
          )}
        </>
      )}
    </div>
  );
}
