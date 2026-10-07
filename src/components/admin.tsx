"use client";
import { useState, useEffect, useCallback } from "react";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  Scissors,
  ArrowUpRight,
  TrendingUp,
  Wallet,
  Receipt,
  Activity,
  Plus,
  LogOut,
} from "lucide-react";
type Appointment = {
  id: string;
  name: string;
  phone: string;
  email: string;
  start: string;
  end: string;
  status: string;
  price: number;
  service: { name: string };
};
type Transaction = {
  id: string;
  amount: number;
  date: string;
  description: string;
  category?: string;
  appointment?: { service: { name: string } };
};
type Data = {
  appointments: Appointment[];
  expenses: Transaction[];
  payments: Transaction[];
  blocks: { id: string; start: string; end: string; reason: string }[];
  config: {
    timezone: string;
    currency: string;
    open: string;
    close: string;
    workingDays: number[];
  };
};
export default function Admin({ authenticated }: { authenticated: boolean }) {
  const [auth, setAuth] = useState(authenticated),
    [data, setData] = useState<Data>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Resumen"),
    [period, setPeriod] = useState("month"),
    [day, setDay] = useState(""),
    [week, setWeek] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin");
      const d = await r.json();
      if (r.status === 401) {
        setAuth(false);
        return;
      }
      if (!r.ok) throw Error(d.error);
      setData(d);
      setDay(
        (v) =>
          v || formatInTimeZone(new Date(), d.config.timezone, "yyyy-MM-dd"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
    }
  }, []);
  useEffect(() => {
    if (auth) void load();
  }, [auth, load]);
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (body.action === "login") setAuth(true);
      else if (body.action === "logout") {
        setAuth(false);
        setData(undefined);
      } else await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const zone = data?.config.timezone ?? "America/Santiago";
  const money = (n: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: data?.config.currency ?? "USD",
    }).format(n / 100);
  const local = (s: string) =>
    formatInTimeZone(new Date(s), zone, "dd MMM · HH:mm");
  function periodContains(s: string) {
    const now = formatInTimeZone(new Date(), zone, "yyyy-MM-dd"),
      d = formatInTimeZone(new Date(s), zone, "yyyy-MM-dd");
    if (period === "day") return d === now;
    if (period === "month") return d.slice(0, 7) === now.slice(0, 7);
    const start = new Date(now + "T12:00:00Z");
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    return d >= start.toISOString().slice(0, 10) && d <= now;
  }
  const payments = data?.payments.filter((p) => periodContains(p.date)) ?? [],
    expenses = data?.expenses.filter((p) => periodContains(p.date)) ?? [],
    income = payments.reduce((n, p) => n + p.amount, 0),
    cost = expenses.reduce((n, p) => n + p.amount, 0),
    net = income - cost,
    margin = income ? (net / income) * 100 : 0;
  const completed =
    data?.appointments.filter(
      (a) => a.status === "COMPLETED" && periodContains(a.start),
    ) ?? [];
  const monthKey = formatInTimeZone(new Date(), zone, "yyyy-MM");
  const monthlyIncome =
    data?.payments
      .filter(
        (p) => formatInTimeZone(new Date(p.date), zone, "yyyy-MM") === monthKey,
      )
      .reduce((n, p) => n + p.amount, 0) ?? 0;
  const monthlyCost =
    data?.expenses
      .filter(
        (p) => formatInTimeZone(new Date(p.date), zone, "yyyy-MM") === monthKey,
      )
      .reduce((n, p) => n + p.amount, 0) ?? 0;
  const monthlyMargin = monthlyIncome
    ? ((monthlyIncome - monthlyCost) / monthlyIncome) * 100
    : 0;
  const health = !monthlyIncome
    ? "Sin datos"
    : monthlyMargin >= 30
      ? "Bueno"
      : monthlyMargin >= 10
        ? "Estable"
        : "Alerta";
  async function form(e: React.FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    const el = e.currentTarget,
      f = new FormData(el),
      body: Record<string, unknown> = { action };
    for (const [k, v] of f.entries()) body[k] = v;
    if (f.has("amount"))
      body.amount = Math.round(Number(f.get("amount")) * 100);
    for (const k of ["date", "start", "end"])
      if (f.has(k))
        body[k] = fromZonedTime(String(f.get(k)), zone).toISOString();
    if (await send(body)) el.reset();
  }
  const card = "card";
  if (!auth)
    return (
      <main className="max-w-md mx-auto px-6 py-20">
        <a href="/" className="flex gap-2 items-center font-semibold mb-10">
          <Scissors /> STUDIO BARBER
        </a>
        <div className={card}>
          <p className="eyebrow">TU ESPACIO DE TRABAJO</p>
          <h1 className="text-3xl my-4">Bienvenido de vuelta.</h1>
          <p className="muted text-sm mb-6">
            Accede con la clave privada de tu barbería.
          </p>
          <form onSubmit={(e) => form(e, "login")}>
            <label htmlFor="password">Clave del administrador</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
            <button disabled={busy} className="primary w-full mt-5">
              {busy ? "Entrando…" : "Entrar al negocio"}
            </button>
          </form>
          {error && (
            <p role="alert" className="text-red-700 text-sm mt-4">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  return (
    <div className="min-h-screen">
      <header className="border-b border-[#dfe4d9] bg-white px-6 py-5 flex items-center justify-between">
        <a href="/" className="font-bold flex items-center gap-2">
          <Scissors className="text-[#52754c]" /> STUDIO BARBER{" "}
          <span className="hidden sm:inline text-xs font-normal muted ml-4">
            ESPACIO DEL BARBERO
          </span>
        </a>
        <button
          onClick={() => send({ action: "logout" })}
          className="muted flex gap-2 text-sm"
          disabled={busy}
        >
          <LogOut size={16} /> Salir
        </button>
      </header>
      <div className="max-w-7xl mx-auto px-6 py-9">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <p className="eyebrow">CADA DETALLE CUENTA</p>
            <h1 className="text-3xl md:text-4xl font-medium mt-2">
              Tu negocio, de un vistazo.
            </h1>
            <p className="muted text-sm mt-3">
              Más claridad en los números. Más tiempo para lo que haces bien.
            </p>
          </div>
          <a
            href="/"
            className="flex items-center gap-2 border rounded-full px-4 py-2 text-sm"
          >
            Ver portal de reservas <ArrowUpRight size={15} />
          </a>
        </div>
        <div className="flex overflow-auto gap-7 border-b border-[#dfe4d9] my-8">
          {["Resumen", "Agenda", "Caja", "Configuración"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-4 text-sm whitespace-nowrap ${tab === t ? "border-b-2 border-[#294e3b] font-semibold" : "muted"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {error && (
          <p
            role="alert"
            className="bg-red-50 border border-red-200 p-4 rounded-xl text-red-700 mb-5"
          >
            {error}
          </p>
        )}
        {!data ? (
          <p className="muted">
            {error
              ? "Revisa la conexión a PostgreSQL."
              : "Cargando tu negocio…"}
          </p>
        ) : (
          <>
            {tab === "Resumen" && (
              <>
                <div className="flex justify-between items-center mb-5">
                  <h2 className="font-semibold text-lg">Salud de tu negocio</h2>
                  <div className="flex bg-[#e9eee3] rounded-lg p-1">
                    {[
                      ["day", "Hoy"],
                      ["week", "Semana"],
                      ["month", "Mes"],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        onClick={() => setPeriod(v)}
                        className={`px-3 py-2 text-xs rounded-md ${v === period ? "bg-white shadow-sm" : "muted"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    [
                      "Ingresos totales",
                      money(income),
                      Wallet,
                      "Cobros registrados",
                    ],
                    [
                      "Gastos totales",
                      money(cost),
                      Receipt,
                      "Inversión en tu negocio",
                    ],
                    [
                      "Ganancia neta",
                      money(net),
                      TrendingUp,
                      `${margin.toFixed(1)}% de margen`,
                    ],
                    [
                      "Ticket promedio",
                      money(
                        completed.length
                          ? payments
                              .filter((p) => p.appointment)
                              .reduce((n, p) => n + p.amount, 0) /
                              completed.length
                          : 0,
                      ),
                      Activity,
                      `${completed.length} servicios realizados`,
                    ],
                  ].map(([title, value, Icon, detail]) => {
                    const I = Icon as typeof Wallet;
                    return (
                      <div className={card} key={String(title)}>
                        <div className="flex justify-between">
                          <p className="muted text-xs">{String(title)}</p>
                          <I size={18} className="text-[#78916c]" />
                        </div>
                        <p className="text-3xl font-semibold mt-5">
                          {String(value)}
                        </p>
                        <p className="muted text-xs mt-3">{String(detail)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5 mt-5">
                  <section className={card}>
                    <h2 className="text-lg font-semibold">
                      Ingresos por servicio
                    </h2>
                    <p className="muted text-xs mt-1 mb-6">
                      Contribución a tus ingresos en el período
                    </p>
                    {Object.entries(
                      payments.reduce<Record<string, number>>((acc, p) => {
                        const k =
                          p.appointment?.service.name ?? "Cobros manuales";
                        acc[k] = (acc[k] ?? 0) + p.amount;
                        return acc;
                      }, {}),
                    )
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, amount]) => (
                        <div key={name} className="mb-5">
                          <div className="flex justify-between text-sm mb-2">
                            <span>{name}</span>
                            <strong>{money(amount)}</strong>
                          </div>
                          <div className="bg-[#edf1e7] rounded-full h-2">
                            <div
                              className="bg-[#739167] h-2 rounded-full"
                              style={{
                                width: `${income ? (amount / income) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    {!payments.length && (
                      <p className="muted text-sm">
                        Los servicios completados aparecerán aquí.
                      </p>
                    )}
                  </section>
                  <section className="card bg-[#edf3e6]">
                    <p className="eyebrow">SEMÁFORO MENSUAL</p>
                    <h2 className="text-3xl mt-6 flex items-center gap-3">
                      <span
                        className={`w-3 h-3 rounded-full ${health === "Bueno" ? "bg-green-600" : health === "Estable" ? "bg-amber-500" : health === "Alerta" ? "bg-red-500" : "bg-gray-400"}`}
                      />
                      {health}
                    </h2>
                    <p className="muted text-sm mt-4 leading-6">
                      {health === "Bueno"
                        ? "Tu negocio tiene un margen saludable. Sigue cuidando cada detalle."
                        : health === "Sin datos"
                          ? "Registra tus primeros cobros para conocer el estado de tu negocio."
                          : "Revisa tus gastos y precios para mejorar tu margen."}
                    </p>
                    <p className="text-xs muted mt-7">
                      Bueno ≥ 30% · Estable ≥ 10% · Alerta &lt; 10%
                      <br />
                      Margen mensual: {monthlyMargin.toFixed(1)}%
                    </p>
                  </section>
                </div>
                <section className="card mt-5 overflow-x-auto">
                  <h2 className="font-semibold mb-5">Movimientos recientes</h2>
                  <table className="w-full text-sm">
                    <thead className="muted text-xs text-left">
                      <tr>
                        <th className="pb-3">Concepto</th>
                        <th>Fecha</th>
                        <th className="text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...payments.map((p) => ({ ...p, kind: 1 })),
                        ...expenses.map((p) => ({ ...p, kind: -1 })),
                      ]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .slice(0, 10)
                        .map((p) => (
                          <tr key={p.id} className="border-t border-[#edf0e7]">
                            <td className="py-4">{p.description}</td>
                            <td className="muted">{local(p.date)}</td>
                            <td
                              className={`text-right font-semibold ${p.kind === 1 ? "text-[#52754c]" : "text-red-700"}`}
                            >
                              {p.kind === 1 ? "+" : "−"}
                              {money(p.amount)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!payments.length && !expenses.length && (
                    <p className="muted py-5 text-sm">
                      Aún no hay movimientos en este período.
                    </p>
                  )}
                </section>
              </>
            )}
            {tab === "Agenda" && (
              <>
                <div className="flex flex-wrap items-center gap-4 mb-5">
                  <input
                    aria-label="Día de agenda"
                    type="date"
                    className="max-w-48"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                  <button
                    className="border rounded-xl px-4 py-3 text-sm"
                    onClick={() => setWeek(!week)}
                  >
                    {week ? "Vista semanal" : "Vista diaria"}
                  </button>
                  <span className="muted text-xs">{zone}</span>
                </div>
                <div className="space-y-3">
                  {data.appointments
                    .filter((a) => {
                      const d = formatInTimeZone(
                        new Date(a.start),
                        zone,
                        "yyyy-MM-dd",
                      );
                      return week
                        ? d >= day &&
                            d <
                              new Date(
                                new Date(day + "T12:00:00Z").getTime() +
                                  7 * 86400000,
                              )
                                .toISOString()
                                .slice(0, 10)
                        : d === day;
                    })
                    .map((a) => (
                      <div
                        key={a.id}
                        className="card flex flex-wrap justify-between gap-4 items-center"
                      >
                        <div>
                          <p className="eyebrow">{local(a.start)}</p>
                          <h3 className="text-lg font-semibold mt-2">
                            {a.name} · {a.service.name}
                          </h3>
                          <p className="muted text-xs mt-2">
                            {a.phone} · {a.email} · {money(a.price)}
                          </p>
                        </div>
                        {a.status === "BOOKED" ? (
                          <div className="flex gap-2 flex-wrap">
                            <button
                              className="primary text-xs"
                              disabled={busy}
                              onClick={() =>
                                send({
                                  action: "status",
                                  id: a.id,
                                  status: "COMPLETED",
                                  method: "CASH",
                                })
                              }
                            >
                              Completada · efectivo
                            </button>
                            <button
                              className="border rounded-xl px-3 text-xs"
                              disabled={busy}
                              onClick={() =>
                                send({
                                  action: "status",
                                  id: a.id,
                                  status: "COMPLETED",
                                  method: "TRANSFER",
                                })
                              }
                            >
                              Transferencia
                            </button>
                            {[
                              ["CANCELLED", "Cancelar"],
                              ["NO_SHOW", "No asistió"],
                            ].map(([status, label]) => (
                              <button
                                key={status}
                                disabled={busy}
                                className="text-xs border rounded-xl p-3"
                                onClick={() =>
                                  send({
                                    action: "status",
                                    id: a.id,
                                    status,
                                    method: "CASH",
                                  })
                                }
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="bg-[#edf2e7] rounded-full px-4 py-2 text-xs">
                            {
                              (
                                {
                                  COMPLETED: "Completada",
                                  CANCELLED: "Cancelada",
                                  NO_SHOW: "No asistió",
                                } as Record<string, string>
                              )[a.status]
                            }
                          </span>
                        )}
                      </div>
                    ))}
                </div>
                <section className="card mt-6">
                  <h2 className="font-semibold mb-5">Bloquear un descanso</h2>
                  <form
                    onSubmit={(e) => form(e, "block")}
                    className="grid md:grid-cols-4 gap-3"
                  >
                    <div>
                      <label>Inicio</label>
                      <input type="datetime-local" name="start" required />
                    </div>
                    <div>
                      <label>Fin</label>
                      <input type="datetime-local" name="end" required />
                    </div>
                    <div>
                      <label>Motivo</label>
                      <input name="reason" required maxLength={200} />
                    </div>
                    <button disabled={busy} className="primary self-end">
                      Bloquear horario
                    </button>
                  </form>
                  <div className="mt-5 space-y-2">
                    {data.blocks.map((b) => (
                      <div
                        key={b.id}
                        className="text-sm flex justify-between gap-2 border-t pt-3"
                      >
                        <span>
                          {local(b.start)} — {local(b.end)} · {b.reason}
                        </span>
                        <button
                          disabled={busy}
                          onClick={() => send({ action: "unblock", id: b.id })}
                          className="text-red-700"
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
            {tab === "Caja" && (
              <div className="grid md:grid-cols-2 gap-6">
                {["expense", "payment"].map((action) => (
                  <section className={card} key={action}>
                    <h2 className="text-xl font-semibold mb-6 flex gap-2">
                      <Plus size={20} />
                      {action === "expense"
                        ? "Registrar gasto"
                        : "Cobro manual"}
                    </h2>
                    <form
                      className="space-y-4"
                      onSubmit={(e) => form(e, action)}
                    >
                      <div>
                        <label>Monto ({data.config.currency})</label>
                        <input
                          type="number"
                          name="amount"
                          min="0.01"
                          max="1000000"
                          step="0.01"
                          required
                        />
                      </div>
                      <div>
                        <label>Fecha y hora · {zone}</label>
                        <input type="datetime-local" name="date" required />
                      </div>
                      <div>
                        <label>Descripción</label>
                        <input name="description" required maxLength={200} />
                      </div>
                      {action === "expense" ? (
                        <div>
                          <label>Categoría</label>
                          <select name="category">
                            {[
                              ["SUPPLIES", "Insumos / cuchillas"],
                              ["RENT", "Alquiler"],
                              ["UTILITIES", "Servicios"],
                              ["TOOLS", "Herramientas"],
                              ["MARKETING", "Marketing"],
                              ["OTHER", "Otros"],
                            ].map(([v, l]) => (
                              <option value={v} key={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label>Medio de pago</label>
                          <select name="method">
                            <option value="CASH">Efectivo</option>
                            <option value="TRANSFER">Transferencia</option>
                          </select>
                          <p className="muted text-xs mt-2">
                            Para citas, usa “Completada” en la agenda para
                            evitar duplicar el ingreso.
                          </p>
                        </div>
                      )}
                      <button className="primary w-full" disabled={busy}>
                        Guardar movimiento
                      </button>
                    </form>
                  </section>
                ))}
              </div>
            )}
            {tab === "Configuración" && (
              <section className="card max-w-xl">
                <h2 className="text-xl font-semibold mb-6">
                  Horario de tu barbería
                </h2>
                <form
                  className="space-y-5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    await send({
                      action: "config",
                      open: f.get("open"),
                      close: f.get("close"),
                      timezone: f.get("timezone"),
                      currency: f.get("currency"),
                      workingDays: f.getAll("days").map(Number),
                    });
                  }}
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label>Apertura</label>
                      <input
                        type="time"
                        name="open"
                        defaultValue={data.config.open}
                        required
                      />
                    </div>
                    <div>
                      <label>Cierre</label>
                      <input
                        type="time"
                        name="close"
                        defaultValue={data.config.close}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label>Días de atención</label>
                    <div className="flex flex-wrap gap-3">
                      {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(
                        (d, i) => (
                          <label key={d} className="flex items-center gap-1">
                            <input
                              className="w-auto"
                              type="checkbox"
                              name="days"
                              value={i}
                              defaultChecked={data.config.workingDays.includes(
                                i,
                              )}
                            />
                            {d}
                          </label>
                        ),
                      )}
                    </div>
                  </div>
                  <div>
                    <label>Zona horaria IANA</label>
                    <input name="timezone" defaultValue={zone} required />
                  </div>
                  <div>
                    <label>
                      Moneda ISO (cambiarla no convierte precios existentes)
                    </label>
                    <input
                      name="currency"
                      defaultValue={data.config.currency}
                      required
                      pattern="[A-Z]{3}"
                    />
                  </div>
                  <button disabled={busy} className="primary">
                    Guardar configuración
                  </button>
                </form>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
