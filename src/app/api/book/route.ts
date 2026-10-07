import { readSchedule } from "@/lib/schedule";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/lib/db";
import { slots } from "@/lib/availability";
import { allowRequest } from "@/lib/rate-limit";
const schema = z.object({
  serviceId: z.string().uuid(),
  start: z.string().datetime(),
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d ()-]{7,25}$/),
  email: z.string().email().max(200),
});
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== process.env.APP_ORIGIN)
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  try {
    const input = schema.parse(await req.json());
    if (!(await allowRequest("public-booking", 60, 60)))
      return NextResponse.json(
        { error: "Demasiadas reservas. Intenta en un minuto." },
        { status: 429 },
      );
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
      const config = await tx.businessConfig.findUniqueOrThrow({
        where: { id: 1 },
      });
      const service = await tx.service.findFirstOrThrow({
        where: { id: input.serviceId, active: true },
      });
      const start = new Date(input.start);
      const date = formatInTimeZone(start, config.timezone, "yyyy-MM-dd");
      const horizon = Date.now() + 90 * 86400000;
      if (start.getTime() > horizon)
        throw new Error("Reserva con máximo 90 días de anticipación");
      const busy = await tx.appointment.findMany({
        where: { status: { in: ["BOOKED", "COMPLETED"] } },
        select: { start: true, end: true },
      });
      const blocks = await tx.block.findMany();
      const schedule = await readSchedule(tx);
      if (
        !slots(
          date,
          service.duration,
          { ...config, dailySchedule: schedule.dates },
          [...busy, ...blocks],
        ).some((s) => s.getTime() === start.getTime())
      )
        throw new Error("Este horario ya no está disponible");
      const { id } = await tx.appointment.create({
        data: {
          ...input,
          start,
          end: new Date(start.getTime() + service.duration * 60000),
          price: service.price,
        },
      });
      return { id, start, service: service.name };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Revisa los datos de contacto"
            : e instanceof Error &&
                [
                  "Este horario ya no está disponible",
                  "Reserva con máximo 90 días de anticipación",
                ].includes(e.message)
              ? e.message
              : "No pudimos confirmar la reserva",
      },
      { status: 409 },
    );
  }
}
