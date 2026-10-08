"use client";
import IncomeStatement from "./income-statement";
import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { isVoided } from "@/lib/reports";
import { type JournalView } from "@/lib/accounting";
type Props = {
  finance: { ready: boolean; documentsReady?: boolean; entries: JournalView[] };
  timezone: string;
  currency: string;
  mode?: "results" | "documents";
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
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
  selectedMonth,
  onMonthChange,
}: Props) {
  const [localMonth, setLocalMonth] = useState(() =>
      formatInTimeZone(new Date(), timezone, "yyyy-MM"),
    ),
    [selected, setSelected] = useState(""),
    [type, setType] = useState("SUPPORT"),
    [folio, setFolio] = useState(""),
    [rut, setRut] = useState(""),
    [vat, setVat] = useState(""),
    [recoverable, setRecoverable] = useState(false),
    [reason, setReason] = useState("");
  const month = selectedMonth ?? localMonth,
    setMonth = onMonthChange ?? setLocalMonth;
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
    <section
      className={mode === "results" ? "mb-6 space-y-6" : "card mb-6 space-y-5"}
    >
      {mode === "results" && (
        <IncomeStatement
          entries={finance.entries}
          month={month}
          setMonth={setMonth}
          timezone={timezone}
          currency={currency}
          ready={finance.ready}
        />
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
                const chosen = choices.find(
                  (entry) => entry.id === e.target.value,
                );
                const recorded =
                  chosen?.lines
                    .filter((l) => l.account === "VAT_OUTPUT")
                    .reduce((n, l) => n + l.credit - l.debit, 0) ?? 0;
                setVat(recorded ? String(recorded / 100) : "");
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
                        Folio o referencia (opcional)
                        <input
                          className="input"
                          required={recoverable}
                          maxLength={80}
                          value={folio}
                          onChange={(e) => setFolio(e.target.value)}
                        />
                      </label>
                      <label className="block">
                        RUT emisor (compras) / receptor (ventas), opcional
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
                            required={recoverable}
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
