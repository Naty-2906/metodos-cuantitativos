"use client";
import { useEffect, useState } from "react";
import InstagramGallery from "./instagram-gallery";
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
    <div className="aura-site">
      <header className="border-b border-[#d9d3c8] bg-[#f4f1eb]">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
          <a
            href="/"
            className="flex items-center gap-3 font-bold tracking-tight text-lg"
          >
            <span className="bg-[#202020] text-white rounded-xl p-2">
              <Scissors size={20} />
            </span>
            AURA<span className="font-normal text-[#756f65]">BARBERÍA</span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#reservar">Reservar una cita</a>
            <a href="#instagram" className="muted">
              Instagram
            </a>
            <a href="#experiencia" className="muted">
              Nuestro estilo
            </a>
            <a
              href="/admin"
              className="border border-[#cfc7ba] rounded-full px-5 py-2 flex gap-2 items-center"
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
              <span className="w-2 h-2 bg-[#b28a57] rounded-full" /> NEW YORK
              ATTITUDE. CHILEAN SOUL.
            </div>
            <h1 className="aura-headline mt-6">
              ESTILO DE CALLE.
              <br />
              <span>PRECISIÓN</span>
              <br />
              DE CABALLERO.
            </h1>
            <p className="muted text-base leading-7 mt-6 max-w-md">
              La energía de New York y New Jersey, con el sello de Aura. Cortes
              limpios, detalles cuidados y una atención a tu medida.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <a
                href="#reservar"
                className="primary inline-flex items-center gap-3"
              >
                Reserva tu estilo <ArrowRight size={16} />
              </a>
              <a
                href="#instagram"
                className="aura-outline inline-flex items-center gap-2"
              >
                Ver nuestros cortes <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="aura-city mt-8">
              <div className="aura-city-grid" aria-hidden="true" />
              <div className="flex justify-between relative z-10 text-[10px] tracking-[3px] uppercase">
                <span>Aura / Barber culture</span>
                <span>NY × NJ</span>
              </div>
              <svg
                viewBox="0 0 600 180"
                className="aura-skyline"
                aria-hidden="true"
              >
                <path
                  d="M0 180V125H35V96H63V145H84V67H115V180M127 180V102H157V47H173V28H179V10H183V28H190V47H207V180M222 180V117H251V83H275V180M290 180V68H319V37H329V0H333V37H344V68H365V180M382 180V98H408V135H427V78H457V180M474 180V108H507V54H533V117H552V90H578V138H600V180"
                  fill="currentColor"
                />
                <path
                  d="M0 170Q120 55 245 170M0 143H245M10 137V180M40 113V180M70 96V180M100 88V180M130 90V180M160 103V180M190 125V180M220 153V180"
                  fill="none"
                  stroke="#ba9562"
                  strokeWidth="2"
                />
              </svg>
              <div className="relative z-10 mt-24">
                <p className="text-[10px] tracking-[3px] mb-2">
                  INSPIRACIÓN EAST COAST
                </p>
                <p className="text-3xl font-semibold uppercase leading-none">
                  The city moves.
                  <br />
                  <span className="text-[#c6a477]">Your style stays.</span>
                </p>
              </div>
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
            className="card shadow-[0_12px_60px_-30px_#201c1633] md:p-8"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">HAZ ESPACIO PARA TI</p>
                <h2 className="text-2xl font-semibold mt-2">
                  Reserva tu próxima cita
                </h2>
              </div>
              <CalendarDays className="text-[#9b784b]" size={24} />
            </div>
            <p className="muted text-sm mt-2">
              Tres pasos sencillos. Un estilo que se siente bien.
            </p>
            <div className="flex justify-between gap-2 mt-8 mb-8 border-b border-[#e4ddd2] pb-6">
              {["Servicio", "Horario", "Tus datos"].map((label, i) => (
                <button
                  key={label}
                  disabled={i + 1 > step || !!done}
                  onClick={() => setStep(i + 1)}
                  className={`flex items-center gap-2 text-xs ${step === i + 1 ? "font-semibold" : "muted"}`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center ${step >= i + 1 ? "bg-[#202020] text-white" : "bg-[#e9e3d9]"}`}
                  >
                    {step > i + 1 ? <Check size={14} /> : i + 1}
                  </span>
                  {label}
                </button>
              ))}
            </div>
            {done ? (
              <div className="text-center py-12">
                <span className="inline-flex rounded-full p-5 bg-[#eee5d8] text-[#202020]">
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
                          className={`w-full text-left rounded-2xl border p-4 flex items-center gap-4 ${service?.id === s.id ? "border-[#997343] bg-[#f3eadb] ring-1 ring-[#997343]" : "border-[#dcd4c7] hover:bg-[#f4f1eb]"}`}
                        >
                          <span className="bg-[#ece4d7] text-[#8b683e] rounded-xl p-3">
                            <Scissors size={22} />
                          </span>
                          <div className="flex-1">
                            <p className="font-semibold text-sm">
                              {s.name}
                              {i === 2 && (
                                <span className="text-[9px] bg-[#e6d6ba] rounded ml-2 px-2 py-1 text-[#795b34]">
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
                            className={`w-4 h-4 rounded-full border ${service?.id === s.id ? "border-4 border-[#997343]" : "border-[#cfc4b3]"}`}
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
                          className={`border rounded-xl py-3 text-sm ${slot === s ? "bg-[#202020] text-white" : "border-[#dcd4c7]"}`}
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
                    <div className="bg-[#f2eadd] rounded-xl p-4 mb-5 text-sm">
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
            <div className="text-center muted text-xs pt-6 mt-6 border-t border-[#e3ddd3] flex justify-center gap-2">
              <ShieldCheck size={14} /> Tu reserva, sin cuentas ni
              complicaciones.
            </div>
          </section>
        </div>
        <InstagramGallery />
        <footer className="border-t border-[#d9d3c8] mt-14 py-6 flex justify-between text-xs muted">
          <span>© 2026 Aura Barbería</span>
          <span>Cultura urbana. Oficio de barbería.</span>
        </footer>
      </main>
    </div>
  );
}
