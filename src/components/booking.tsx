"use client";
import { useEffect, useState } from "react";
import {
  Scissors,
  ArrowUpRight,
  ArrowRight,
  Check,
  Clock,
  MapPin,
  CalendarDays,
  ShieldCheck,
  Menu,
} from "lucide-react";
type Service = { id: string; name: string; duration: number; price: number };
export default function Booking() {
  const [services, setServices] = useState<Service[]>([]),
    [service, setService] = useState<Service>(),
    [step, setStep] = useState(1),
    [date, setDate] = useState(""),
    [available, setAvailable] = useState<string[]>([]),
    [slot, setSlot] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState<{ id: string }>(),
    [timezone, setTimezone] = useState("America/Santiago"),
    [currency, setCurrency] = useState("USD");
  useEffect(() => {
    fetch("/api/public")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setServices(d.services);
        setTimezone(d.config.timezone);
        setCurrency(d.config.currency);
        setDate(
          new Intl.DateTimeFormat("en-CA", {
            timeZone: d.config.timezone,
          }).format(new Date()),
        );
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!date || !service) return;
    const controller = new AbortController();
    setAvailable([]);
    setSlot("");
    setBusy(true);
    setError("");
    fetch(`/api/public?date=${date}&service=${service.id}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setAvailable(d.slots);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [date, service]);
  const money = (n: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n / 100);
  const time = (s: string) =>
    new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(s));
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service?.id,
          start: slot,
          name: form.get("name"),
          phone: form.get("phone"),
          email: form.get("email"),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setDone(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="border-b border-[#e0e5db] bg-[#f7f8f5]">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
          <a
            href="/"
            className="flex items-center gap-3 font-bold tracking-tight text-lg"
          >
            <span className="bg-[#294e3b] text-white rounded-xl p-2">
              <Scissors size={20} />
            </span>
            STUDIO<span className="font-normal text-[#7c8577]">BARBER</span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#reservar">Reservar una cita</a>
            <a href="#experiencia" className="muted">
              La experiencia
            </a>
            <a
              href="/admin"
              className="border border-[#ccd5c7] rounded-full px-5 py-2 flex gap-2 items-center"
            >
              Mi negocio <ArrowUpRight size={15} />
            </a>
          </nav>
          <a href="/admin" className="md:hidden" aria-label="Panel del barbero">
            <Menu />
          </a>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 pt-10 md:pt-16">
        <div className="grid lg:grid-cols-[1fr_1.13fr] gap-12 lg:gap-20 items-start">
          <section id="experiencia">
            <div className="eyebrow flex gap-2 items-center">
              <span className="w-2 h-2 bg-[#91a774] rounded-full" /> TU TIEMPO.
              TU ESTILO.
            </div>
            <h1 className="text-5xl md:text-6xl leading-[1.08] font-medium mt-6">
              Un buen corte.
              <br />
              Un momento
              <br />
              <span className="text-[#678264]">para ti.</span>
            </h1>
            <p className="muted text-base leading-7 mt-6 max-w-sm">
              El cuidado de siempre, con la comodidad de hoy. Elige tu servicio
              y encuentra tu próximo espacio en nuestra silla.
            </p>
            <div className="mt-8 rounded-[24px] h-64 md:h-72 overflow-hidden relative bg-[#27382e] p-8 text-white flex flex-col justify-between">
              <div className="absolute right-[-25px] top-[-20px] w-72 h-72 rounded-full border-[35px] border-[#63806b]/20" />
              <Scissors
                size={76}
                strokeWidth={0.8}
                className="relative rotate-[-25deg] text-[#c5d2bc]"
              />
              <div className="relative">
                <p className="text-[10px] tracking-[3px] text-[#b4c3ac] mb-3">
                  EL ARTE DE CUIDAR LOS DETALLES
                </p>
                <p className="text-2xl tracking-tight">
                  Más que un corte.
                  <br />
                  Tu mejor versión.
                </p>
              </div>
              <span className="absolute right-7 bottom-7 text-xs text-[#b4c3ac]">
                EST. 2026
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-6 pb-8 text-xs muted">
              <span className="flex items-center gap-2">
                <ShieldCheck size={17} /> Sin registro
              </span>
              <span className="flex items-center gap-2">
                <Clock size={17} /> A tu hora
              </span>
              <span className="flex items-center gap-2">
                <MapPin size={17} /> Atención personal
              </span>
            </div>
          </section>
          <section
            id="reservar"
            className="card shadow-[0_12px_60px_-30px_#42513d33] md:p-8"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">HAZ ESPACIO PARA TI</p>
                <h2 className="text-2xl font-semibold mt-2">
                  Reserva tu próxima cita
                </h2>
              </div>
              <CalendarDays className="text-[#7c9272]" size={24} />
            </div>
            <p className="muted text-sm mt-2">
              Tres pasos sencillos. Un estilo que se siente bien.
            </p>
            <div className="flex justify-between gap-2 mt-8 mb-8 border-b border-[#e8ece3] pb-6">
              {["Servicio", "Horario", "Tus datos"].map((label, i) => (
                <button
                  key={label}
                  disabled={i + 1 > step || !!done}
                  onClick={() => setStep(i + 1)}
                  className={`flex items-center gap-2 text-xs ${step === i + 1 ? "font-semibold" : "muted"}`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center ${step >= i + 1 ? "bg-[#294e3b] text-white" : "bg-[#eef1e9]"}`}
                  >
                    {step > i + 1 ? <Check size={14} /> : i + 1}
                  </span>
                  {label}
                </button>
              ))}
            </div>
            {done ? (
              <div className="text-center py-12">
                <span className="inline-flex rounded-full p-5 bg-[#edf3e5] text-[#294e3b]">
                  <Check size={32} />
                </span>
                <h3 className="text-3xl mt-5">¡Nos vemos pronto!</h3>
                <p className="muted mt-3">
                  {service?.name} · {date} · {time(slot)}
                </p>
                <p className="text-xs break-all mt-6">Reserva: {done.id}</p>
                <p className="muted text-sm mt-3">
                  Guarda este número como comprobante.
                </p>
              </div>
            ) : (
              <>
                {step === 1 && (
                  <>
                    <h3 className="font-semibold mb-1">¿Qué hacemos hoy?</h3>
                    <p className="muted text-sm mb-5">
                      Encuentra el servicio que va contigo.
                    </p>
                    <div className="space-y-3">
                      {services.map((s, i) => (
                        <button
                          key={s.id}
                          onClick={() => setService(s)}
                          className={`w-full text-left rounded-2xl border p-4 flex items-center gap-4 ${service?.id === s.id ? "border-[#52754c] bg-[#f2f6ed] ring-1 ring-[#52754c]" : "border-[#e1e6db] hover:bg-[#f7f8f5]"}`}
                        >
                          <span className="bg-[#edf1e6] text-[#62785a] rounded-xl p-3">
                            <Scissors size={22} />
                          </span>
                          <div className="flex-1">
                            <p className="font-semibold text-sm">
                              {s.name}
                              {i === 2 && (
                                <span className="text-[9px] bg-[#e5ecd8] rounded ml-2 px-2 py-1 text-[#61714d]">
                                  EL FAVORITO
                                </span>
                              )}
                            </p>
                            <p className="muted text-xs flex items-center gap-1 mt-2">
                              <Clock size={12} />
                              {s.duration} minutos
                            </p>
                          </div>
                          <span className="font-semibold">
                            {money(s.price)}
                          </span>
                          <span
                            className={`w-4 h-4 rounded-full border ${service?.id === s.id ? "border-4 border-[#52754c]" : "border-[#d2dacb]"}`}
                          />
                        </button>
                      ))}
                    </div>
                    <button
                      className="primary w-full mt-6 flex justify-center items-center gap-3"
                      disabled={!service}
                      onClick={() => setStep(2)}
                    >
                      Elegir horario <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {step === 2 && (
                  <>
                    <h3 className="font-semibold mb-4">Elige tu momento</h3>
                    <label htmlFor="date">Fecha · {timezone}</label>
                    <input
                      id="date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-5 max-h-64 overflow-auto">
                      {available.map((s) => (
                        <button
                          key={s}
                          onClick={() => setSlot(s)}
                          className={`border rounded-xl py-3 text-sm ${slot === s ? "bg-[#294e3b] text-white" : "border-[#e1e6db]"}`}
                        >
                          {time(s)}
                        </button>
                      ))}
                    </div>
                    {!available.length && (
                      <p className="muted py-6 text-sm">
                        {busy
                          ? "Consultando la agenda…"
                          : "No hay horarios disponibles en esta fecha."}
                      </p>
                    )}
                    <button
                      className="primary w-full mt-6"
                      disabled={!slot || busy}
                      onClick={() => setStep(3)}
                    >
                      Continuar <ArrowRight className="inline ml-2" size={16} />
                    </button>
                  </>
                )}
                {step === 3 && (
                  <form onSubmit={submit}>
                    <div className="bg-[#f2f5ed] rounded-xl p-4 mb-5 text-sm">
                      <strong>{service?.name}</strong>
                      <p className="muted mt-1">
                        {date} · {time(slot)} · {money(service?.price ?? 0)}
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="name">Tu nombre</label>
                        <input
                          id="name"
                          name="name"
                          autoComplete="name"
                          required
                          minLength={2}
                          maxLength={100}
                          placeholder="Nombre y apellido"
                        />
                      </div>
                      <div>
                        <label htmlFor="phone">Teléfono / WhatsApp</label>
                        <input
                          id="phone"
                          name="phone"
                          type="tel"
                          autoComplete="tel"
                          required
                          pattern="[+0-9 ()-]{7,25}"
                          placeholder="+56 9 1234 5678"
                        />
                      </div>
                      <div>
                        <label htmlFor="email">Correo electrónico</label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          placeholder="tu@correo.com"
                        />
                      </div>
                    </div>
                    <p className="muted text-xs mt-4">
                      Usaremos tus datos únicamente para gestionar esta reserva.
                    </p>
                    <button disabled={busy} className="primary w-full mt-5">
                      {busy ? "Confirmando…" : "Confirmar mi reserva"}
                    </button>
                  </form>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="text-red-700 text-sm mt-4">
                {error}
              </p>
            )}
            <div className="text-center muted text-xs pt-6 mt-6 border-t border-[#eef0e9] flex justify-center gap-2">
              <ShieldCheck size={14} /> Tu reserva, sin cuentas ni
              complicaciones.
            </div>
          </section>
        </div>
        <footer className="border-t border-[#e0e5db] mt-14 py-6 flex justify-between text-xs muted">
          <span>© 2026 Studio Barber</span>
          <span>Hecho con dedicación. Como tu próximo corte.</span>
        </footer>
      </main>
    </>
  );
}
