"use client";
import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { CalendarDays, Plus, Trash2, Clock } from "lucide-react";
import type { ScheduleDates } from "@/lib/schedule";
type Service = { id: string; name: string; duration: number; active: boolean };
type Props = {
  schedule: ScheduleDates;
  ready: boolean;
  services: Service[];
  timezone: string;
  currency: string;
  busy: boolean;
  send: (body: Record<string, unknown>) => Promise<boolean | undefined>;
};
export default function ScheduleSettings({
  schedule,
  ready,
  services,
  timezone,
  currency,
  busy,
  send,
}: Props) {
  const today = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
  const [date, setDate] = useState(today),
    [ranges, setRanges] = useState(schedule[today] ?? []),
    [message, setMessage] = useState("");
  function chooseDate(value: string) {
    setDate(value);
    setRanges(schedule[value] ?? []);
    setMessage("");
  }
  async function save() {
    if (await send({ action: "schedule", date, ranges })) {
      setMessage(
        ranges.length
          ? "Horario guardado para esta fecha."
          : "Fecha cerrada para nuevas reservas.",
      );
    }
  }
  return (
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6 items-start">
      <section className="card">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CalendarDays size={22} />
          Horarios por fecha
        </h2>
        <p className="muted text-sm mt-3 leading-6">
          Abre solo los días que trabajarás. Cada fecha tiene sus propios
          bloques; no se repiten semanalmente. Las fechas sin bloques quedan
          cerradas.
        </p>
        {!ready && (
          <p
            role="alert"
            className="text-amber-800 bg-amber-50 rounded-xl p-4 mt-4 text-sm"
          >
            Falta aplicar la actualización SQL en Supabase. Hasta entonces se
            mantiene el horario anterior.
          </p>
        )}
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="schedule-date">Fecha de atención · {timezone}</label>
          <input
            id="schedule-date"
            type="date"
            required
            value={date}
            onChange={(e) => chooseDate(e.target.value)}
          />
          <div className="space-y-4 mt-5">
            {ranges.map((range, i) => (
              <div key={i} className="flex gap-3 items-end">
                <div className="flex-1">
                  <label htmlFor={`open-${i}`}>Desde</label>
                  <input
                    id={`open-${i}`}
                    type="time"
                    required
                    value={range.open}
                    onChange={(e) =>
                      setRanges(
                        ranges.map((r, index) =>
                          index === i ? { ...r, open: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor={`close-${i}`}>Hasta</label>
                  <input
                    id={`close-${i}`}
                    type="time"
                    required
                    value={range.close}
                    onChange={(e) =>
                      setRanges(
                        ranges.map((r, index) =>
                          index === i ? { ...r, close: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Eliminar bloque ${i + 1}`}
                  className="border rounded-xl p-3 mb-1"
                  onClick={() =>
                    setRanges(ranges.filter((_, index) => index !== i))
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          {!ranges.length && (
            <p className="muted bg-[#f4f5f1] p-4 rounded-xl mt-4 text-sm">
              Sin bloques: este día estará cerrado.
            </p>
          )}
          <button
            type="button"
            disabled={ranges.length >= 6 || busy || !ready}
            onClick={() =>
              setRanges([
                ...ranges,
                { open: ranges.at(-1)?.close ?? "10:00", close: "20:00" },
              ])
            }
            className="flex items-center gap-2 text-sm border rounded-xl p-3 mt-4"
          >
            <Plus size={16} />
            Agregar bloque
          </button>
          <p className="muted text-xs mt-4 leading-5">
            Ejemplo: 10:00–13:00 y 15:00–19:00. Los bloques no pueden solaparse.
            Cambiar el horario no cancela las citas existentes.
          </p>
          <button className="primary mt-5 w-full" disabled={busy || !ready}>
            {ranges.length
              ? "Guardar horario de esta fecha"
              : "Guardar día cerrado"}
          </button>
          <p role="status" className="text-sm text-green-800 mt-3">
            {message}
          </p>
        </form>
        <h3 className="font-semibold mt-7 mb-3">Fechas programadas</h3>
        <div className="space-y-2 max-h-72 overflow-auto">
          {Object.entries(schedule)
            .filter(([d]) => d >= today)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([d, blocks]) => (
              <button
                type="button"
                key={d}
                onClick={() => chooseDate(d)}
                className={`w-full border rounded-xl p-3 text-left flex flex-wrap justify-between gap-2 text-sm ${date === d ? "bg-[#eef3e8]" : ""}`}
              >
                <strong>{d.split("-").reverse().join("/")}</strong>
                <span>
                  {blocks.map((b) => `${b.open}–${b.close}`).join(" · ")}
                </span>
              </button>
            ))}
          {!Object.keys(schedule).some((d) => d >= today) && (
            <p className="muted text-sm">
              Todavía no hay fechas futuras programadas.
            </p>
          )}
        </div>
      </section>
      <div className="space-y-6">
        <section className="card">
          <h2 className="text-xl font-semibold flex gap-2 items-center">
            <Clock size={22} />
            Duración de servicios
          </h2>
          <p className="muted text-sm leading-6 mt-3 mb-5">
            Define cuánto tiempo necesitas para cada servicio. Se aplicará a
            nuevas reservas; las citas existentes conservan su duración.
          </p>
          <div className="space-y-5">
            {services
              .filter((s) => s.active)
              .map((s) => (
                <form
                  key={`${s.id}-${s.duration}`}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    if (
                      await send({
                        action: "duration",
                        id: s.id,
                        duration: Number(form.get("duration")),
                      })
                    )
                      setMessage("Duración del servicio actualizada.");
                  }}
                >
                  <label htmlFor={`duration-${s.id}`}>{s.name} · minutos</label>
                  <div className="flex gap-3">
                    <input
                      id={`duration-${s.id}`}
                      type="number"
                      name="duration"
                      required
                      min={5}
                      max={240}
                      step={1}
                      defaultValue={s.duration}
                    />
                    <button disabled={busy} className="primary text-sm">
                      Guardar
                    </button>
                  </div>
                </form>
              ))}
          </div>
        </section>
        <section className="card">
          <h2 className="font-semibold mb-5">Preferencias del negocio</h2>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await send({
                action: "preferences",
                timezone: f.get("timezone"),
                currency: f.get("currency"),
              });
            }}
          >
            <div>
              <label htmlFor="business-timezone">Zona horaria</label>
              <input
                id="business-timezone"
                name="timezone"
                defaultValue={timezone}
                required
              />
            </div>
            <div>
              <label htmlFor="business-currency">
                Moneda (no convierte precios existentes)
              </label>
              <input
                id="business-currency"
                name="currency"
                defaultValue={currency}
                required
                pattern="[A-Z]{3}"
              />
            </div>
            <button className="primary" disabled={busy}>
              Guardar preferencias
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
