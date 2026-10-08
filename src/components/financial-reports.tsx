"use client";
import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { report, isVoided } from "@/lib/reports";
import { type JournalView, accountNames } from "@/lib/accounting";
type Props = {
  finance: { ready: boolean; documentsReady?: boolean; entries: JournalView[] };
  timezone: string;
  currency: string;
  mode?: "results" | "documents";
  busy: boolean;
  send: (body: Record<string, unknown>) => Promise<boolean | undefined>;
};
export default function FinancialReports({
  finance,
  timezone,
  currency,
  busy,
  send,
  mode = "results",
}: Props) {
  const [month, setMonth] = useState(() =>
      formatInTimeZone(new Date(), timezone, "yyyy-MM"),
    ),
    [selected, setSelected] = useState(""),
    [type, setType] = useState("SUPPORT"),
    [folio, setFolio] = useState(""),
    [rut, setRut] = useState(""),
    [vat, setVat] = useState(""),
    [recoverable, setRecoverable] = useState(false),
    [reason, setReason] = useState("");
  const r = report(finance.entries, month, timezone, currency);
  const money = (n: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency }).format(
      n / 100,
    );
  const choices = finance.entries.filter(
    (e) =>
      !e.sourceKey.startsWith("reversal:") &&
      e.kind !== "SETTLEMENT" &&
      !isVoided(e, finance.entries),
  );
  const entry = choices.find((e) => e.id === selected);
  async function document(event: React.FormEvent) {
    event.preventDefault();
    if (
      await send({
        action: "document",
        document: {
          id: selected,
          type,
          folio,
          rut,
          vat: Math.round(Number(vat || 0) * 100),
          recoverable,
        },
      })
    ) {
      setSelected("");
      setFolio("");
      setVat("");
      setRecoverable(false);
    }
  }
  return (
    <section className="card mb-6 space-y-5">
      {mode === "results" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">TU NEGOCIO, EN SIMPLE</p>
              <h2 className="text-2xl font-semibold">¿Cómo va este mes?</h2>
            </div>
            <label>
              Elige el mes
              <input
                aria-label="Mes del resumen"
                type="month"
                className="input"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
          </div>
          <a href="#anotar-movimiento" className="btn inline-flex">
            Anotar una venta o un gasto
          </a>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              [
                "Lo que vendiste",
                r.totals.income,
                "Tus cortes y productos vendidos.",
              ],
              [
                "Gastos del negocio",
                r.totals.expenses,
                "Insumos, arriendo y otros gastos.",
              ],
              [
                r.totals.profit < 0 ? "Pérdida estimada" : "Ganancia estimada",
                r.totals.profit,
                "Lo vendido menos los gastos, antes de impuestos.",
              ],
            ].map(([label, n, help]) => (
              <div className="rounded-xl bg-[#f4f1eb] p-4" key={String(label)}>
                <p className="text-sm">{label}</p>
                <strong className="text-2xl block mt-2">
                  {money(Number(n))}
                </strong>
                <p className="muted text-xs mt-2">{help}</p>
              </div>
            ))}
          </div>
          <p className="text-sm muted">
            También se cuenta lo que quedó pendiente de cobrar o pagar. Por eso
            tu ganancia puede ser distinta del dinero que tienes disponible.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border p-4">
              <p className="text-sm">Dinero que entró este mes</p>
              <strong className="text-xl">{money(r.cashIn)}</strong>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-sm">Dinero que salió este mes</p>
              <strong className="text-xl">{money(r.cashOut)}</strong>
            </div>
          </div>
          <p className="text-xs muted">
            Estas entradas y salidas también incluyen préstamos, dinero personal
            y compras de equipos. Son movimientos registrados, no el saldo de tu
            cuenta bancaria.
          </p>
          <div className="rounded-xl bg-[#f5f7f2] p-4 text-sm space-y-2">
            <p>
              Al cierre del mes,{" "}
              <strong>te deben {money(r.cumulative.receivable)}</strong> y{" "}
              <strong>debes pagar {money(r.cumulative.payable)}</strong> en
              compras pendientes.
            </p>
            <p>
              Para marcar un cobro o pago, baja a{" "}
              <strong>Por cobrar / pagar</strong>.
            </p>
          </div>
          {finance.ready && month && (
            <a
              className="btn inline-flex"
              href={`/api/admin/report?month=${encodeURIComponent(month)}`}
            >
              Descargar resumen para mi contador
            </a>
          )}
          <p className="text-xs muted">
            El Excel incluye los informes detallados para revisión. No envía una
            declaración al SII.
          </p>
          <details className="border rounded-xl p-4">
            <summary className="cursor-pointer font-semibold">
              Impuestos e informes detallados (opcional)
            </summary>
            <div className="space-y-5 mt-4">
              <details>
                <summary className="font-semibold cursor-pointer">
                  Desglose de ingresos y gastos
                </summary>
                <div className="space-y-2 mt-3">
                  {r.resultAccounts.map((v) => (
                    <p className="flex justify-between text-sm" key={v.account}>
                      <span>
                        {accountNames[v.account as keyof typeof accountNames]}
                      </span>
                      <strong>{money(v.amount)}</strong>
                    </p>
                  ))}
                </div>
              </details>
              <details>
                <summary className="font-semibold cursor-pointer">
                  Balance general de los registros
                </summary>
                <div className="grid sm:grid-cols-3 gap-3 mt-3">
                  {[
                    ["Activos", r.assets],
                    ["Pasivos", r.liabilities],
                    ["Patrimonio y resultado", r.equity],
                  ].map(([label, n]) => (
                    <p key={String(label)} className="text-sm">
                      {label}: <strong>{money(Number(n))}</strong>
                    </p>
                  ))}
                </div>
                <p className="text-xs muted mt-2">
                  Balance desde el primer movimiento, sujeto a revisión y saldos
                  de apertura. Diferencia de cuadre:{" "}
                  {money(r.balanceDifference)}.
                </p>
              </details>
              {!finance.ready && (
                <p className="text-amber-800 text-sm">
                  Primero activa la contabilidad con el SQL de actualización;
                  todavía no hay un libro contable disponible.
                </p>
              )}
              <h3 className="font-semibold">IVA según tus documentos</h3>
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                {[
                  ["IVA débito (ventas)", r.vatOutput],
                  ["IVA crédito confirmado", r.vatInput],
                  ["IVA en compras del mes", r.purchaseVat],
                  ["IVA en compras pagadas este mes", r.paidPurchaseVat],
                  ["Diferencia débito / crédito", r.vatDifference],
                ].map(([s, n]) => (
                  <p key={String(s)}>
                    {s}: <strong>{money(Number(n))}</strong>
                  </p>
                ))}
              </div>
              <p className="rounded-xl bg-amber-50 p-3 text-sm">
                El tratamiento tributario se elige en Configuración. {r.missing}{" "}
                operaciones del mes necesitan revisión documental. Estos montos
                son un respaldo: deben cotejarse con el Registro de Compras y
                Ventas y revisarse antes de declarar al SII.
              </p>
              {finance.ready && month && (
                <a
                  className="btn inline-flex"
                  href={`/api/admin/report?month=${encodeURIComponent(month)}`}
                >
                  Descargar Excel (.xlsx)
                </a>
              )}
              <details>
                <summary className="cursor-pointer font-semibold">
                  Balance de comprobación acumulado
                </summary>
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left">Cuenta</th>
                        <th>Debe</th>
                        <th>Haber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.balances.map((b) => (
                        <tr key={b.account}>
                          <td>
                            {accountNames[
                              b.account as keyof typeof accountNames
                            ] ?? b.account}
                          </td>
                          <td className="text-right">{money(b.debit)}</td>
                          <td className="text-right">{money(b.credit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted text-xs mt-2">
                  Desde el primer registro hasta el mes elegido. Los saldos de
                  apertura, depreciaciones e impuestos no registrados requieren
                  revisión del contador.
                </p>
              </details>
            </div>
          </details>
        </>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">
          Me equivoqué en un registro / agregar una boleta
        </summary>
        <div className="space-y-3 mt-3">
          <label className="block">
            Operación
            <select
              className="input"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setReason("");
                setVat("");
                setRecoverable(false);
              }}
            >
              <option value="">Selecciona una operación</option>
              {choices.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatInTimeZone(e.date, timezone, "dd/MM/yyyy")} ·{" "}
                  {e.description} · {money(e.amount)}
                </option>
              ))}
            </select>
          </label>
          {entry && (
            <>
              <details className="border rounded-xl p-4">
                <summary className="cursor-pointer font-semibold">
                  Agregar boleta o factura (opcional)
                </summary>
                <form onSubmit={document} className="space-y-3 mt-4">
                  {entry.document ? (
                    <p className="muted text-sm">
                      Documento {entry.document.folio} registrado. Para
                      corregirlo, anula y registra nuevamente la operación.
                    </p>
                  ) : (
                    <>
                      <p className="muted text-sm">
                        Usa el IVA que aparece en el documento; no supongas que
                        toda operación está afecta al 19%. Las boletas de
                        honorarios requieren revisar su retención aparte con el
                        contador.
                      </p>
                      <label className="block">
                        Documento
                        <select
                          className="input"
                          value={type}
                          onChange={(e) => {
                            setType(e.target.value);
                            setVat("");
                            setRecoverable(false);
                          }}
                        >
                          <option value="SUPPORT">
                            Respaldo sin IVA confirmado
                          </option>
                          <option value="INVOICE">Factura</option>
                          <option value="RECEIPT">Boleta afecta</option>
                          <option value="EXEMPT">Documento exento</option>
                          <option value="HONORARIUM">
                            Boleta de honorarios
                          </option>
                        </select>
                      </label>
                      <label className="block">
                        Folio o referencia
                        <input
                          className="input"
                          required
                          maxLength={80}
                          value={folio}
                          onChange={(e) => setFolio(e.target.value)}
                        />
                      </label>
                      <label className="block">
                        RUT emisor (compras) / receptor (ventas)
                        <input
                          className="input"
                          placeholder="12345678-5"
                          maxLength={20}
                          value={rut}
                          onChange={(e) => setRut(e.target.value)}
                        />
                      </label>
                      {["INVOICE", "RECEIPT"].includes(type) && (
                        <label className="block">
                          IVA del documento en pesos
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            max={entry.amount / 100 - 1}
                            required
                            value={vat}
                            onChange={(e) => setVat(e.target.value)}
                          />
                        </label>
                      )}
                      {type === "INVOICE" &&
                        ["SUPPLIES", "EXPENSE", "ASSET"].includes(
                          entry.kind,
                        ) && (
                          <label className="flex gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={recoverable}
                              onChange={(e) => setRecoverable(e.target.checked)}
                            />
                            Confirmé que esta factura permite crédito fiscal
                            para mi negocio
                          </label>
                        )}
                      <button
                        className="btn"
                        disabled={
                          busy || !finance.documentsReady || currency !== "CLP"
                        }
                      >
                        Guardar documento e IVA
                      </button>
                      {!finance.documentsReady && (
                        <p className="text-sm text-amber-800">
                          Primero aplica la actualización SQL de reportes en
                          Supabase.
                        </p>
                      )}
                    </>
                  )}
                </form>
              </details>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await send({ action: "reverse", id: selected, reason })) {
                    setSelected("");
                    setReason("");
                  }
                }}
                className="border-t pt-4 space-y-3"
              >
                <h4 className="font-semibold">
                  Eliminar un registro equivocado
                </h4>
                <p className="text-sm muted">
                  El monto dejará de contar en tus resultados. También se
                  quitará su pago, si tenía uno. Conservaremos una nota de la
                  corrección. Si emitiste una boleta o factura, su corrección
                  ante el SII se hace por separado.
                </p>
                <input
                  aria-label="Motivo de anulación"
                  className="input"
                  required
                  minLength={5}
                  maxLength={180}
                  placeholder="Motivo de la corrección"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  className="btn bg-red-800"
                  disabled={busy || reason.trim().length < 5}
                >
                  Quitar este registro de los totales
                </button>
              </form>
            </>
          )}
        </div>
      </details>
    </section>
  );
}
