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
  Home,
  Lightbulb,
  Package,
  ArrowDownLeft,
  ScanLine,
  BookOpen,
} from "lucide-react";
import {
  accountNames,
  financialTotals,
  kindNames,
  type JournalView,
  type Operation,
} from "@/lib/accounting";
import { isVoided } from "@/lib/reports";
import InvoiceBreakdown from "./invoice-breakdown";
import { invoiceFromTotal } from "@/lib/invoice";
import ReceiptScanner from "./receipt-scanner";
type Props = {
  finance: { ready: boolean; entries: JournalView[] };
  timezone: string;
  currency: string;
  busy: boolean;
  onViewLedger?: () => void;
  send: (body: Record<string, unknown>) => Promise<boolean | undefined>;
};
const groups = [
  { id: "SALE", title: "Venta", detail: "", icon: Scissors },
  { id: "SUPPLIES", title: "Compra de insumos", detail: "", icon: ShoppingBag },
  { id: "EXPENSE", title: "Gasto del negocio", detail: "", icon: Receipt },
  {
    id: "ASSET",
    title: "Compra de equipo o mueble",
    detail: "",
    icon: Armchair,
  },
  { id: "OWNER", title: "Dinero del dueño", detail: "", icon: Wallet },
  { id: "DEBT", title: "Deudas y cobros", detail: "", icon: Landmark },
];
const cards = [
  {
    id: "service",
    group: "SALE",
    variant: "SALE_SERVICE",
    category: undefined,
    section: "Ventas",
    title: "Cobré un corte o servicio",
    icon: Scissors,
  },
  {
    id: "product",
    group: "SALE",
    variant: "SALE_PRODUCT",
    category: undefined,
    section: "Ventas",
    title: "Vendí un producto",
    icon: ShoppingBag,
  },
  {
    id: "supplies",
    group: "SUPPLIES",
    variant: undefined,
    category: undefined,
    section: "Compras y gastos",
    title: "Compré insumos",
    icon: Package,
  },
  {
    id: "rent",
    group: "EXPENSE",
    variant: undefined,
    category: "RENT",
    section: "Compras y gastos",
    title: "Pagué arriendo",
    icon: Home,
  },
  {
    id: "utilities",
    group: "EXPENSE",
    variant: undefined,
    category: "UTILITIES",
    section: "Compras y gastos",
    title: "Pagué agua, luz o internet",
    icon: Lightbulb,
  },
  {
    id: "expense",
    group: "EXPENSE",
    variant: undefined,
    category: "OTHER",
    section: "Compras y gastos",
    title: "Pagué otro gasto",
    icon: Receipt,
  },
  {
    id: "asset",
    group: "ASSET",
    variant: undefined,
    category: undefined,
    section: "Compras y gastos",
    title: "Compré una máquina o un mueble",
    icon: Armchair,
  },
  {
    id: "contribute",
    group: "OWNER",
    variant: "OWNER_CONTRIBUTION",
    category: undefined,
    section: "Dinero del dueño",
    title: "Aporté dinero al negocio",
    icon: Wallet,
  },
  {
    id: "withdraw",
    group: "OWNER",
    variant: "OWNER_WITHDRAWAL",
    category: undefined,
    section: "Dinero del dueño",
    title: "Retiré dinero para mí",
    icon: ArrowDownLeft,
  },
  {
    id: "loan",
    group: "DEBT",
    variant: "LOAN",
    category: undefined,
    section: "Deudas y cobros",
    title: "Recibí un préstamo",
    icon: Landmark,
  },
  {
    id: "repay",
    group: "DEBT",
    variant: "DEBT_PAYMENT",
    category: undefined,
    section: "Deudas y cobros",
    title: "Pagué un préstamo",
    icon: Landmark,
  },
  {
    id: "pay",
    group: "DEBT",
    variant: "PENDING_DEBT",
    category: undefined,
    section: "Deudas y cobros",
    title: "Pagué una compra que debía",
    icon: Receipt,
  },
  {
    id: "collect",
    group: "DEBT",
    variant: "PENDING_SALE",
    category: undefined,
    section: "Deudas y cobros",
    title: "Me pagaron una venta pendiente",
    icon: Wallet,
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
  onViewLedger,
}: Props) {
  const [automaticVat, setAutomaticVat] = useState(false);
  const [docEnabled, setDocEnabled] = useState(false),
    [docType, setDocType] = useState("RECEIPT"),
    [folio, setFolio] = useState(""),
    [rut, setRut] = useState(""),
    [vat, setVat] = useState(""),
    [recoverable, setRecoverable] = useState(false);
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
    group === "SALE" ||
    kind === "OWNER_CONTRIBUTION" ||
    kind === "LOAN" ||
    variant === "PENDING_SALE";
  function choose(id: string) {
    setGroup(id);
    setDocEnabled(false);
    setRecoverable(false);
    setAutomaticVat(false);
    setDate(today);
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
      if (
        group === "DEBT" &&
        ["PENDING_DEBT", "PENDING_SALE"].includes(variant)
      )
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
        const document = docEnabled
          ? {
              type: docType,
              folio,
              rut,
              vat: Math.round(Number(vat) * 100),
              recoverable,
            }
          : undefined;
        const payload = JSON.stringify({ operation, document });
        if (request.current?.payload !== payload)
          request.current = { payload, id: crypto.randomUUID() };
        body = {
          action: docEnabled ? "receipt_operation" : "operation",
          ...(document ? { document } : {}),
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
      <section className="operations-picker">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <p className="eyebrow">CONTABILIDAD SIMPLE</p>
            <h2 className="text-3xl font-semibold mt-3">
              ¿Qué pasó en tu negocio?
            </h2>
            <p className="muted text-sm mt-3">
              Cuéntalo con palabras simples. El libro diario se completa al
              guardar.
            </p>
          </div>
          <button
            type="button"
            className="primary flex gap-2 items-center"
            disabled={busy || scanning || !finance.ready}
            onClick={() => {
              choose("SUPPLIES");
              requestAnimationFrame(() =>
                document
                  .getElementById("receipt-photo")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" }),
              );
            }}
          >
            <ScanLine size={18} />
            Escanear factura o boleta
          </button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-7">
          {cards.map((card) => {
            const Icon = card.icon;
            const active =
              group === card.group &&
              (!card.variant || variant === card.variant) &&
              (!card.category || category === card.category);
            return (
              <button
                type="button"
                key={card.id}
                disabled={busy || scanning || !finance.ready}
                aria-pressed={active}
                onClick={() => {
                  choose(card.group);
                  if (card.variant) setVariant(card.variant);
                  setCategory(card.category ?? "OTHER");
                  requestAnimationFrame(() =>
                    document
                      .getElementById("operation-form")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  );
                }}
                className={`operation-tile ${active ? "operation-tile-active" : ""}`}
              >
                <span className="operation-icon">
                  <Icon size={21} />
                </span>
                <span>
                  <span className="block text-xs muted mb-2">
                    {card.section}
                  </span>
                  <span className="block text-sm font-semibold">
                    {card.title}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
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
          <form
            id="operation-form"
            onSubmit={submit}
            className="card mt-7 scroll-mt-6"
          >
            <h3 className="font-semibold mb-5">
              {cards.find(
                (c) =>
                  c.group === group &&
                  (!c.variant || c.variant === variant) &&
                  (!c.category || c.category === category),
              )?.title ?? groups.find((g) => g.id === group)?.title}
            </h3>
            {["SUPPLIES", "EXPENSE", "ASSET"].includes(group) && (
              <ReceiptScanner
                currency={currency}
                disabled={busy}
                onBusyChange={setScanning}
                onExtract={(fields) => {
                  setAmount(
                    fields.amount === undefined ? "" : String(fields.amount),
                  );
                  setDate(fields.date ?? today);
                  setDocEnabled(true);
                  setAutomaticVat(false);
                  setDocType(fields.documentType ?? "RECEIPT");
                  setFolio(fields.folio ?? "");
                  setRut(fields.rut ?? "");
                  setVat(fields.vat === undefined ? "" : String(fields.vat));
                  setRecoverable(false);
                  if (fields.description) setDescription(fields.description);
                  if (fields.kind) {
                    setGroup(fields.kind);
                    setVariant(fields.kind);
                  }
                  if (fields.category) setCategory(fields.category);
                  else if (fields.kind === "EXPENSE") setCategory("OTHER");
                }}
              />
            )}

            <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
              <div>
                {group === "SALE" && (
                  <p className="muted bg-[#f4f6ef] rounded-xl p-3 text-xs leading-5 mb-5">
                    Si el cobro corresponde a una cita agendada, márcala como
                    “Completada” desde la agenda. Así el ingreso se registra una
                    sola vez.
                  </p>
                )}
                {["PENDING_DEBT", "PENDING_SALE"].includes(variant) ? (
                  <div className="mb-5">
                    <label htmlFor="pending-debt">
                      {variant === "PENDING_SALE"
                        ? "Venta pendiente de cobro"
                        : "Compra pendiente de pago"}
                    </label>
                    <select
                      id="pending-debt"
                      required
                      value={debtId}
                      onChange={(e) => setDebtId(e.target.value)}
                    >
                      <option value="">
                        {variant === "PENDING_SALE"
                          ? "Elige la venta que te pagaron"
                          : "Elige la compra que vas a pagar"}
                      </option>
                      {pending
                        .filter(
                          (p) =>
                            p.pendingAccount ===
                            (variant === "PENDING_SALE"
                              ? "RECEIVABLE"
                              : "PAYABLE"),
                        )
                        .map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.description} · {money(p.amount, currency)}
                          </option>
                        ))}
                    </select>
                    <p className="muted text-xs mt-2">
                      Se registrará el saldo completo. La venta o compra ya
                      estaba anotada; no vuelve a contarse en tus ganancias o
                      gastos.
                    </p>
                  </div>
                ) : (
                  <>
                    {!docEnabled && (
                      <>
                        <label htmlFor="operation-amount">
                          {kind === "DEBT_PAYMENT"
                            ? "Total pagado (capital + intereses)"
                            : docEnabled
                              ? "Total de la boleta o factura (IVA incluido)"
                              : "¿Cuánto?"}{" "}
                          · {currency}
                        </label>
                        <input
                          id="operation-amount"
                          disabled={scanning || busy}
                          type="number"
                          value={amount}
                          onChange={(e) => {
                            setAmount(e.target.value);
                            if (
                              automaticVat &&
                              docEnabled &&
                              Number.isSafeInteger(Number(e.target.value)) &&
                              Number(e.target.value) >= 0 &&
                              Number(e.target.value) <= 20000000
                            )
                              setVat(
                                String(
                                  docType === "EXEMPT"
                                    ? 0
                                    : invoiceFromTotal(Number(e.target.value))
                                        .vat,
                                ),
                              );
                          }}
                          required
                          min={currency === "CLP" ? 1 : 0.01}
                          max={20000000}
                          step={currency === "CLP" ? 1 : 0.01}
                        />
                      </>
                    )}
                    {["SUPPLIES", "EXPENSE", "ASSET"].includes(group) && (
                      <div className="mt-4 space-y-3">
                        <label className="flex gap-2 items-center">
                          <input
                            type="checkbox"
                            checked={docEnabled}
                            onChange={(e) => setDocEnabled(e.target.checked)}
                          />{" "}
                          Tengo una boleta o factura para este gasto
                        </label>
                        {docEnabled && (
                          <div className="space-y-3 rounded-xl border p-4">
                            <h3 className="font-semibold">
                              Revisa el documento antes de guardar
                            </h3>
                            <label>
                              Tipo de documento
                              <select
                                aria-label="Tipo de documento"
                                value={docType}
                                onChange={(e) => {
                                  setDocType(e.target.value);
                                  setAutomaticVat(false);
                                  setRecoverable(false);
                                  if (e.target.value === "EXEMPT") setVat("0");
                                }}
                              >
                                <option value="RECEIPT">
                                  Boleta de compra
                                </option>
                                <option value="INVOICE">Factura afecta</option>
                                <option value="EXEMPT">Documento exento</option>
                              </select>
                            </label>
                            <label>
                              Folio / número de documento (opcional)
                              <input
                                required={recoverable}
                                value={folio}
                                maxLength={80}
                                onChange={(e) => setFolio(e.target.value)}
                              />
                            </label>
                            <label>
                              RUT del emisor (opcional)
                              <input
                                value={rut}
                                required={recoverable}
                                placeholder="76.123.456-7"
                                onChange={(e) => setRut(e.target.value)}
                              />
                            </label>
                            <InvoiceBreakdown
                              amount={amount}
                              vat={vat}
                              onAmount={setAmount}
                              onVat={setVat}
                              automatic={automaticVat}
                              onAutomatic={setAutomaticVat}
                              exempt={docType === "EXEMPT"}
                              required={recoverable}
                            />
                            {docType === "INVOICE" && (
                              <label className="flex gap-2 items-start">
                                <input
                                  type="checkbox"
                                  checked={recoverable}
                                  onChange={(e) =>
                                    setRecoverable(e.target.checked)
                                  }
                                />{" "}
                                Confirmé que esta factura corresponde al negocio
                                y tiene derecho a crédito fiscal.
                              </label>
                            )}
                            <p className="muted text-xs">
                              Para llevar el conteo de gastos basta el total y
                              la fecha. No necesitas folio ni RUT. Si no se
                              detectó la fecha, aparece hoy y puedes cambiarla.
                              Solo al descontar IVA se requiere una factura
                              identificada.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
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
                  <label htmlFor="operation-date">
                    {docEnabled ? "Fecha del gasto / emisión" : "¿Cuándo?"} ·{" "}
                    {timezone}
                  </label>
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
                {!["PENDING_DEBT", "PENDING_SALE"].includes(variant) && (
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
                    (["PENDING_DEBT", "PENDING_SALE"].includes(variant) &&
                      !debtId)
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
      <section className="card mt-8">
        <div className="flex flex-wrap justify-between gap-3 items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold">
              Tus operaciones registradas
            </h2>
            <p className="muted text-sm mt-2">
              También están guardadas en el libro diario.
            </p>
          </div>
          {onViewLedger && (
            <button
              type="button"
              onClick={onViewLedger}
              className="muted text-sm flex gap-2"
            >
              <BookOpen size={16} />
              Ver libro diario
            </button>
          )}
        </div>
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
