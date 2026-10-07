"use client";
import { useRef, useState } from "react";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  Scissors,
  ShoppingBag,
  Receipt,
  Armchair,
  Wallet,
  Landmark,
  ArrowRight,
  Check,
} from "lucide-react";
import {
  accountNames,
  financialTotals,
  kindNames,
  type JournalView,
  type Operation,
} from "@/lib/accounting";
import { isVoided } from "@/lib/reports";
import ReceiptScanner from "./receipt-scanner";
type Props = {
  finance: { ready: boolean; entries: JournalView[] };
  timezone: string;
  currency: string;
  busy: boolean;
  send: (body: Record<string, unknown>) => Promise<boolean | undefined>;
};
const groups = [
  {
    id: "SALE",
    title: "Vendí un corte o un producto",
    detail: "Registra una venta pagada o por cobrar.",
    icon: Scissors,
  },
  {
    id: "SUPPLIES",
    title: "Compré insumos",
    detail: "Cuchillas, productos y materiales de uso.",
    icon: ShoppingBag,
  },
  {
    id: "EXPENSE",
    title: "Tuve otro gasto",
    detail: "Arriendo, servicios, marketing y otros.",
    icon: Receipt,
  },
  {
    id: "ASSET",
    title: "Compré una máquina o un mueble",
    detail: "Una compra que usarás en el negocio.",
    icon: Armchair,
  },
  {
    id: "OWNER",
    title: "Aporté o retiré dinero del negocio",
    detail: "Tu dinero personal y el negocio, separados.",
    icon: Wallet,
  },
  {
    id: "DEBT",
    title: "Recibí un préstamo o pagué una deuda",
    detail: "Préstamos y pagos pendientes.",
    icon: Landmark,
  },
];
const money = (n: number, currency: string) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency }).format(
    n / 100,
  );
export default function Operations({
  finance,
  timezone,
  currency,
  busy,
  send,
}: Props) {
  const [scanning, setScanning] = useState(false);
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const [group, setGroup] = useState(""),
    [variant, setVariant] = useState("SALE_SERVICE"),
    [state, setState] = useState<"PAID" | "PENDING">("PAID"),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(today),
    [description, setDescription] = useState(""),
    [method, setMethod] = useState<"CASH" | "TRANSFER">("CASH"),
    [category, setCategory] = useState("OTHER"),
    [interest, setInterest] = useState("0"),
    [debtId, setDebtId] = useState(""),
    [view, setView] = useState("Movimientos"),
    [success, setSuccess] = useState("");
  const request = useRef<{ payload: string; id: string } | null>(null),
    saving = useRef(false);
  const pending = finance.entries.filter(
    (e) => e.pendingAccount && !e.settledAt && !isVoided(e, finance.entries),
  );
  const totals = financialTotals(finance.entries);
  const kind = (
    ["SALE", "OWNER", "DEBT"].includes(group) ? variant : group
  ) as Operation["kind"];
  const paysLater = ["SALE", "SUPPLIES", "EXPENSE", "ASSET"].includes(group);
  const paysIn =
    group === "SALE" || kind === "OWNER_CONTRIBUTION" || kind === "LOAN";
  function choose(id: string) {
    setGroup(id);
    setVariant(
      id === "SALE"
        ? "SALE_SERVICE"
        : id === "OWNER"
          ? "OWNER_CONTRIBUTION"
          : id === "DEBT"
            ? "LOAN"
            : id,
    );
    setState("PAID");
    setSuccess("");
    setAmount("");
    setDescription("");
    setInterest("0");
    setDebtId("");
    request.current = null;
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving.current || scanning) return;
    saving.current = true;
    setSuccess("");
    try {
      let body: Record<string, unknown>;
      if (group === "DEBT" && variant === "PENDING_DEBT")
        body = {
          action: "settle",
          id: debtId,
          date: fromZonedTime(`${date}T12:00:00`, timezone).toISOString(),
          method,
        };
      else {
        const operation = {
          kind,
          amount: Math.round(Number(amount) * 100),
          date: fromZonedTime(`${date}T12:00:00`, timezone).toISOString(),
          description,
          state,
          method,
          category: kind === "EXPENSE" ? category : undefined,
          interest:
            kind === "DEBT_PAYMENT" ? Math.round(Number(interest) * 100) : 0,
        };
        const payload = JSON.stringify(operation);
        if (request.current?.payload !== payload)
          request.current = { payload, id: crypto.randomUUID() };
        body = {
          action: "operation",
          operation: { ...operation, requestId: request.current.id },
        };
      }
      if (await send(body)) {
        setSuccess(
          "Listo. Guardamos el movimiento y actualizamos tus números.",
        );
        setGroup("");
        request.current = null;
      }
    } finally {
      saving.current = false;
    }
  }
  return (
    <div id="anotar-movimiento" className="scroll-mt-6">
      {!finance.ready && (
        <p
          role="alert"
          className="bg-amber-50 text-amber-800 rounded-xl p-4 text-sm mb-5"
        >
          Falta aplicar la actualización SQL de operaciones en Supabase. Los
          movimientos anteriores se conservan y las citas siguen funcionando.
        </p>
      )}
      <section className="card">
        <p className="eyebrow">ANOTAR UN MOVIMIENTO</p>
        <h2 className="text-2xl font-semibold mt-2">
          ¿Qué pasó en tu negocio?
        </h2>
        <p className="muted text-sm mt-3">
          Elige lo que hiciste y anota cuánto y cuándo. Las citas que marcas
          como completadas en la agenda ya se suman solas; no las registres otra
          vez.
        </p>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-6">
          {groups
            .filter((g) => ["SALE", "SUPPLIES", "EXPENSE"].includes(g.id))
            .map(({ id, title, detail, icon: Icon }) => (
              <button
                key={id}
                disabled={busy || scanning || !finance.ready}
                onClick={() => choose(id)}
                className={`rounded-xl border p-4 text-left flex gap-3 ${group === id ? "border-[#52754c] bg-[#f2f6ed]" : "border-[#e1e6db] hover:bg-[#f7f8f5]"}`}
              >
                <Icon size={22} className="text-[#62785a] shrink-0 mt-1" />
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="muted text-xs leading-5 mt-2">{detail}</p>
                </div>
              </button>
            ))}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Otros: equipos, dinero personal o préstamos
          </summary>
          <div className="grid md:grid-cols-3 gap-3 mt-3">
            {groups
              .filter((g) => !["SALE", "SUPPLIES", "EXPENSE"].includes(g.id))
              .map(({ id, title, detail, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  disabled={busy || scanning || !finance.ready}
                  onClick={() => choose(id)}
                  className={`rounded-xl border p-4 text-left ${group === id ? "bg-[#f2f6ed] border-[#52754c]" : ""}`}
                >
                  <Icon size={20} />
                  <p className="text-sm font-semibold mt-2">{title}</p>
                  <p className="text-xs muted mt-2">{detail}</p>
                </button>
              ))}
          </div>
        </details>
        {success && (
          <p
            role="status"
            className="bg-green-50 text-green-800 p-4 rounded-xl flex gap-2 mt-5 text-sm"
          >
            <Check size={18} />
            {success}
          </p>
        )}
        {group && (
          <form onSubmit={submit} className="mt-7 pt-6 border-t">
            <h3 className="font-semibold mb-5">
              {groups.find((g) => g.id === group)?.title}
            </h3>
            <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
              <div>
                {["SALE", "OWNER", "DEBT"].includes(group) && (
                  <div className="mb-5">
                    <label htmlFor="operation-kind">¿Qué hiciste?</label>
                    <select
                      id="operation-kind"
                      disabled={scanning || busy}
                      value={variant}
                      onChange={(e) => {
                        setVariant(e.target.value);
                        setState("PAID");
                        request.current = null;
                      }}
                    >
                      {group === "SALE" ? (
                        <>
                          <option value="SALE_SERVICE">
                            Cobré un servicio
                          </option>
                          <option value="SALE_PRODUCT">
                            Vendí un producto
                          </option>
                        </>
                      ) : group === "OWNER" ? (
                        <>
                          <option value="OWNER_CONTRIBUTION">
                            Aporté dinero al negocio
                          </option>
                          <option value="OWNER_WITHDRAWAL">
                            Retiré dinero para mí
                          </option>
                        </>
                      ) : (
                        <>
                          <option value="LOAN">Recibí un préstamo</option>
                          <option value="DEBT_PAYMENT">
                            Pagué un préstamo
                          </option>
                          <option value="PENDING_DEBT">
                            Pagué una compra pendiente
                          </option>
                        </>
                      )}
                    </select>
                  </div>
                )}
                {group === "SALE" && (
                  <p className="muted bg-[#f4f6ef] rounded-xl p-3 text-xs leading-5 mb-5">
                    Si el cobro corresponde a una cita agendada, márcala como
                    “Completada” desde la agenda. Así el ingreso se registra una
                    sola vez.
                  </p>
                )}
                {variant === "PENDING_DEBT" ? (
                  <div className="mb-5">
                    <label htmlFor="pending-debt">Compra pendiente</label>
                    <select
                      id="pending-debt"
                      required
                      value={debtId}
                      onChange={(e) => setDebtId(e.target.value)}
                    >
                      <option value="">Elige la compra que vas a pagar</option>
                      {pending
                        .filter((p) => p.pendingAccount === "PAYABLE")
                        .map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.description} · {money(p.amount, currency)}
                          </option>
                        ))}
                    </select>
                    <p className="muted text-xs mt-2">
                      Se pagará el saldo completo. No vuelve a contarse como
                      gasto.
                    </p>
                  </div>
                ) : (
                  <>
                    {["SUPPLIES", "EXPENSE", "ASSET"].includes(group) && (
                      <ReceiptScanner
                        currency={currency}
                        disabled={busy}
                        onBusyChange={setScanning}
                        onExtract={(fields) => {
                          if (fields.amount !== undefined)
                            setAmount(String(fields.amount));
                          if (fields.date) setDate(fields.date);
                          if (fields.description)
                            setDescription(fields.description);
                          if (fields.kind) {
                            setGroup(fields.kind);
                            setVariant(fields.kind);
                          }
                          if (fields.category) setCategory(fields.category);
                          else if (fields.kind === "EXPENSE")
                            setCategory("OTHER");
                        }}
                      />
                    )}
                    <label htmlFor="operation-amount">
                      {kind === "DEBT_PAYMENT"
                        ? "Total pagado (capital + intereses)"
                        : "¿Cuánto?"}{" "}
                      · {currency}
                    </label>
                    <input
                      id="operation-amount"
                      disabled={scanning || busy}
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      min={currency === "CLP" ? 1 : 0.01}
                      max={20000000}
                      step={currency === "CLP" ? 1 : 0.01}
                    />
                    {kind === "DEBT_PAYMENT" && (
                      <div className="mt-4">
                        <label htmlFor="operation-interest">
                          De ese total, ¿cuánto fue interés? (0 si no hubo)
                        </label>
                        <input
                          id="operation-interest"
                          type="number"
                          value={interest}
                          onChange={(e) => setInterest(e.target.value)}
                          required
                          min={0}
                          max={20000000}
                          step={currency === "CLP" ? 1 : 0.01}
                        />
                        <p className="muted text-xs mt-2">
                          Préstamos registrados por pagar:{" "}
                          {money(totals.loans, currency)}. Solo los intereses
                          cuentan como gasto.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <div>
                  <label htmlFor="operation-date">¿Cuándo? · {timezone}</label>
                  <input
                    id="operation-date"
                    disabled={scanning || busy}
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                {paysLater && (
                  <div className="mt-4">
                    <label htmlFor="operation-state">
                      {paysIn ? "¿Ya te pagaron?" : "¿Ya lo pagaste?"}
                    </label>
                    <select
                      id="operation-state"
                      value={state}
                      onChange={(e) =>
                        setState(e.target.value as "PAID" | "PENDING")
                      }
                    >
                      <option value="PAID">
                        {paysIn ? "Sí, ya cobré" : "Sí, ya pagué"}
                      </option>
                      <option value="PENDING">
                        {paysIn
                          ? "No, quedó por cobrar"
                          : "No, quedó por pagar"}
                      </option>
                    </select>
                  </div>
                )}
                {(state === "PAID" || !paysLater) && (
                  <div className="mt-4">
                    <label htmlFor="operation-method">
                      {paysIn
                        ? "¿Cómo recibiste el dinero?"
                        : "¿Cómo pagaste o retiraste el dinero?"}
                    </label>
                    <select
                      id="operation-method"
                      value={method}
                      onChange={(e) =>
                        setMethod(e.target.value as "CASH" | "TRANSFER")
                      }
                    >
                      <option value="CASH">Efectivo</option>
                      <option value="TRANSFER">Transferencia</option>
                    </select>
                  </div>
                )}
                {group === "EXPENSE" && (
                  <div className="mt-4">
                    <label htmlFor="operation-category">¿Qué gasto fue?</label>
                    <select
                      id="operation-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {[
                        ["RENT", "Arriendo"],
                        ["UTILITIES", "Luz, agua u otros servicios"],
                        ["TOOLS", "Herramientas de consumo o reparación"],
                        ["MARKETING", "Marketing"],
                        ["OTHER", "Otro gasto"],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {variant !== "PENDING_DEBT" && (
                  <div className="mt-4">
                    <label htmlFor="operation-description">
                      {state === "PENDING"
                        ? "¿Quién te debe o a quién debes? / detalle"
                        : "Un detalle para recordarlo (opcional)"}
                    </label>
                    <input
                      id="operation-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={200}
                      placeholder="Ej. arriendo de octubre"
                      required={state === "PENDING"}
                    />
                  </div>
                )}
                <p className="muted text-xs leading-5 mt-5">
                  {group === "ASSET"
                    ? "Se registrará como una máquina o mueble del negocio; no como gasto de funcionamiento."
                    : group === "OWNER"
                      ? "No afecta las ventas ni la ganancia del negocio."
                      : group === "DEBT"
                        ? "Recibir un préstamo no es una venta. Pagar capital reduce la deuda."
                        : state === "PENDING"
                          ? "Lo verás en Por cobrar / pagar. Márcalo cuando recibas o pagues el dinero."
                          : "Solo guarda el movimiento. Tus números se actualizarán solos."}
                </p>
                <button
                  disabled={
                    busy ||
                    scanning ||
                    !finance.ready ||
                    (variant === "PENDING_DEBT" && !debtId)
                  }
                  className="primary mt-5 w-full flex justify-center items-center gap-2"
                >
                  {busy ? "Guardando…" : "Guardar movimiento"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
      <details className="mt-5">
        <summary className="cursor-pointer text-sm muted">
          Ver pendientes y préstamos de todo el negocio
        </summary>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          {[
            [
              "Movimiento neto de dinero",
              totals.cash + totals.bank + totals.legacyFunds,
            ],
            ["Por cobrar", totals.receivable],
            ["Compras por pagar", totals.payable],
            ["Préstamos por pagar", totals.loans],
          ].map(([label, n]) => (
            <div className="card" key={String(label)}>
              <p className="muted text-xs">{String(label)}</p>
              <p className="text-2xl font-semibold mt-3">
                {money(Number(n), currency)}
              </p>
            </div>
          ))}
        </div>
        <p className="muted text-xs mt-3">
          Movimiento neto desde el primer registro; no incluye un saldo inicial
          de caja o banco.
        </p>
      </details>
      <section className="card mt-5">
        <div className="flex flex-wrap gap-5 border-b pb-4 mb-5">
          {["Movimientos", "Pendientes"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-sm ${view === v ? "font-semibold text-[#294e3b]" : "muted"}`}
            >
              {v === "Pendientes" ? "Por cobrar / pagar" : "Lo que anotaste"}
              {v === "Pendientes" && pending.length
                ? ` (${pending.length})`
                : ""}
            </button>
          ))}
        </div>
        {view === "Movimientos" && (
          <>
            <p className="muted text-xs mb-4">
              Tus operaciones en lenguaje simple. Los montos pendientes todavía
              no representan dinero cobrado o pagado.
            </p>
            <div className="space-y-3">
              {finance.entries
                .filter((e) => !e.sourceKey.startsWith("reversal:"))
                .slice(0, 100)
                .map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap justify-between gap-3 border-b pb-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold">
                        {e.description}
                        {isVoided(e, finance.entries) ? " · ANULADA" : ""}
                      </p>
                      <p className="muted text-xs mt-1">
                        {kindNames[e.kind as keyof typeof kindNames] ?? e.kind}{" "}
                        ·{" "}
                        {formatInTimeZone(
                          new Date(e.date),
                          timezone,
                          "dd/MM/yyyy",
                        )}{" "}
                        ·{" "}
                        {e.pendingAccount && !e.settledAt
                          ? "Pendiente"
                          : e.pendingAccount
                            ? "Saldado"
                            : e.method === "CASH"
                              ? "Efectivo"
                              : e.method === "TRANSFER"
                                ? "Transferencia"
                                : "Medio histórico no registrado"}
                      </p>
                    </div>
                    <strong>{money(e.amount, e.currency)}</strong>
                  </div>
                ))}
            </div>
            {finance.entries.length > 100 && (
              <p className="muted text-xs mt-3">
                Mostrando los 100 movimientos más recientes. El libro diario
                conserva todos.
              </p>
            )}
            {!finance.entries.length && (
              <p className="muted text-sm">
                Tu primera operación aparecerá aquí.
              </p>
            )}
          </>
        )}
        {view === "Pendientes" && (
          <div className="space-y-4">
            {pending.map((e) => (
              <Pending
                key={e.id}
                entry={e}
                timezone={timezone}
                busy={busy}
                send={send}
              />
            ))}
            {!pending.length && (
              <p className="muted text-sm">
                No hay cobros ni compras pendientes.
              </p>
            )}
          </div>
        )}
        <details className="mt-6 border-t pt-4">
          <summary className="cursor-pointer text-sm muted">
            Libro contable para revisión (opcional)
          </summary>
          {
            <>
              <p className="muted text-xs mb-5">
                Consulta los asientos que la aplicación construyó
                automáticamente. Los registros anteriores se incorporan una sola
                vez; sus gastos no tenían medio de pago registrado.
              </p>
              <div className="space-y-3">
                {finance.entries.map((e) => (
                  <details className="border rounded-xl p-4" key={e.id}>
                    <summary className="cursor-pointer text-sm font-semibold">
                      {formatInTimeZone(
                        new Date(e.date),
                        timezone,
                        "dd/MM/yyyy",
                      )}{" "}
                      · {e.description} · {money(e.amount, e.currency)}
                    </summary>
                    <div className="overflow-x-auto mt-4">
                      <table className="w-full text-sm">
                        <thead className="muted text-xs text-left">
                          <tr>
                            <th>Cuenta</th>
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
                              <td className="text-right">
                                {l.debit ? money(l.debit, e.currency) : "—"}
                              </td>
                              <td className="text-right">
                                {l.credit ? money(l.credit, e.currency) : "—"}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t font-semibold">
                            <td className="pt-3">Total</td>
                            <td className="text-right pt-3">
                              {money(
                                e.lines.reduce((n, l) => n + l.debit, 0),
                                e.currency,
                              )}
                            </td>
                            <td className="text-right pt-3">
                              {money(
                                e.lines.reduce((n, l) => n + l.credit, 0),
                                e.currency,
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
              {!finance.entries.length && (
                <p className="muted text-sm">
                  Todavía no hay asientos registrados.
                </p>
              )}
            </>
          }
        </details>
      </section>
    </div>
  );
}
function Pending({
  entry,
  timezone,
  busy,
  send,
}: {
  entry: JournalView;
  timezone: string;
  busy: boolean;
  send: Props["send"];
}) {
  const [date, setDate] = useState(
      formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"),
    ),
    [method, setMethod] = useState("CASH");
  return (
    <form
      className="border rounded-xl p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send({
          action: "settle",
          id: entry.id,
          date: fromZonedTime(`${date}T12:00:00`, timezone).toISOString(),
          method,
        });
      }}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">{entry.description}</p>
          <p className="muted text-xs mt-1">
            {entry.pendingAccount === "RECEIVABLE" ? "Por cobrar" : "Por pagar"}{" "}
            · {formatInTimeZone(new Date(entry.date), timezone, "dd/MM/yyyy")}
          </p>
        </div>
        <strong>{money(entry.amount, entry.currency)}</strong>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <div>
          <label htmlFor={`settle-date-${entry.id}`}>Fecha del pago</label>
          <input
            id={`settle-date-${entry.id}`}
            type="date"
            required
            min={formatInTimeZone(new Date(entry.date), timezone, "yyyy-MM-dd")}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`settle-method-${entry.id}`}>Medio de pago</label>
          <select
            id={`settle-method-${entry.id}`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="CASH">Efectivo</option>
            <option value="TRANSFER">Transferencia</option>
          </select>
        </div>
        <button className="primary self-end" disabled={busy}>
          {entry.pendingAccount === "RECEIVABLE"
            ? "Registrar cobro"
            : "Registrar pago"}
        </button>
      </div>
      <p className="muted text-xs mt-3">
        Registra el monto completo y salda el pendiente, sin duplicar ingresos o
        gastos.
      </p>
    </form>
  );
}
