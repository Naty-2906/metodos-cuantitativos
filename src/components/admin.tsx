"use client";
import BusinessOverview from "./business-overview";
import AccountingWorkspace from "./accounting-workspace";
import type { JournalView } from "@/lib/accounting";
import ScheduleSettings from "./schedule-settings";
import type { ScheduleDates } from "@/lib/schedule";
import { useState, useEffect, useCallback } from "react";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  Scissors,
  ArrowUpRight,
  TrendingUp,
  Wallet,
  Receipt,
  Activity,
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
  kind?: string;
  appointment?: { service: { name: string } };
};
type Data = {
  taxProfile?: { ready: boolean; treatment: "UNKNOWN" | "AFFECTED" | "EXEMPT" };
  finance: { documentsReady?: boolean; ready: boolean; entries: JournalView[] };
  schedule: ScheduleDates;
  scheduleReady: boolean;
  services: { id: string; name: string; duration: number; active: boolean }[];
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
    [reportMonth, setReportMonth] = useState(""),
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
      setReportMonth(
        (v) => v || formatInTimeZone(new Date(), d.config.timezone, "yyyy-MM"),
      );
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
          <Scissors /> AURA BARBERÍA
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
          <div className="mt-8" />
          {error && (
            <p role="alert" className="text-red-700 text-sm mt-4">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  return (
    <div className="admin-shell min-h-screen">
      <aside className="admin-sidebar">
        <a href="/" className="font-bold text-xl flex items-center gap-3">
          <span className="rounded-xl bg-[#214e3f] text-white p-2">
            <Scissors size={22} />
          </span>
          BARBERO<span className="text-[#ba9562]">.</span>
        </a>
        <p className="eyebrow mt-12 mb-5">MI BARBERÍA</p>
        <nav aria-label="Panel del barbero" className="admin-side-nav">
          {["Resumen", "Agenda", "Contabilidad", "Configuración"].map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={tab === t ? "admin-nav-active" : ""}
            >
              {t === "Resumen" ? (
                <TrendingUp size={17} />
              ) : t === "Agenda" ? (
                <Activity size={17} />
              ) : t === "Contabilidad" ? (
                <Wallet size={17} />
              ) : (
                <Receipt size={17} />
              )}{" "}
              {t}
            </button>
          ))}
        </nav>
      </aside>
      <header className="admin-topbar border-b border-[#dfe4d9] px-6 py-5 flex items-center justify-between">
        <span className="eyebrow font-normal">PANEL DEL BARBERO</span>
        <a href="/" className="text-sm text-[#527461] ml-auto mr-6">
          Reservas de clientes
        </a>
        <button
          onClick={() => send({ action: "logout" })}
          className="muted flex gap-2 text-sm"
          disabled={busy}
        >
          <LogOut size={16} /> Salir
        </button>
      </header>
      <div className="admin-main max-w-7xl px-6 py-9">
        <div
          className={`flex flex-wrap justify-between items-end gap-4 ${tab === "Contabilidad" || tab === "Resumen" ? "hidden" : ""}`}
        >
          <div>
            <p className="eyebrow">CADA DETALLE CUENTA</p>
            <h1 className="text-3xl md:text-4xl font-medium mt-2">
              {tab === "Contabilidad"
                ? "Tu negocio, sin complicaciones."
                : tab === "Resumen"
                  ? "Así va tu negocio."
                  : tab === "Agenda"
                    ? "Tu agenda."
                    : "Tu barbería, a tu manera."}
            </h1>
            <p className="muted text-sm mt-3">
              Registra lo que pasó con palabras simples. Nosotros ordenamos los
              números.
            </p>
          </div>
          <a
            href="/"
            className="flex items-center gap-2 border rounded-full px-4 py-2 text-sm"
          >
            Ver portal de reservas <ArrowUpRight size={15} />
          </a>
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
              <BusinessOverview
                {...data}
                selectedMonth={reportMonth}
                onMonthChange={setReportMonth}
              />
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
            {tab === "Contabilidad" && (
              <AccountingWorkspace
                finance={data.finance}
                selectedMonth={reportMonth}
                onMonthChange={setReportMonth}
                taxProfile={data.taxProfile}
                timezone={zone}
                currency={data.config.currency}
                busy={busy}
                send={send}
                onSettings={() => setTab("Configuración")}
              />
            )}
            {tab === "Configuración" && (
              <ScheduleSettings
                schedule={data.schedule}
                ready={data.scheduleReady}
                services={data.services}
                timezone={zone}
                currency={data.config.currency}
                busy={busy}
                send={send}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
