import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authorized, login, passwordMatches } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { allowRequest } from "@/lib/rate-limit";
const money = z.number().int().positive().max(100000000);
const interval = z
  .object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    reason: z.string().trim().min(1).max(200),
  })
  .refine((v) => new Date(v.start) < new Date(v.end), "Rango inválido");
const action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    id: z.string().uuid(),
    status: z.enum(["COMPLETED", "CANCELLED", "NO_SHOW"]),
    method: z.enum(["CASH", "TRANSFER"]),
  }),
  z.object({
    action: z.literal("expense"),
    amount: money,
    date: z.string().datetime(),
    description: z.string().trim().min(1).max(200),
    category: z.enum([
      "SUPPLIES",
      "RENT",
      "UTILITIES",
      "TOOLS",
      "MARKETING",
      "OTHER",
    ]),
  }),
  z.object({
    action: z.literal("payment"),
    amount: money,
    date: z.string().datetime(),
    description: z.string().trim().min(1).max(200),
    method: z.enum(["CASH", "TRANSFER"]),
  }),
  z.object({
    action: z.literal("block"),
    start: z.string().datetime(),
    end: z.string().datetime(),
    reason: z.string().trim().min(1).max(200),
  }),
  z.object({ action: z.literal("unblock"), id: z.string().uuid() }),
  z.object({
    action: z.literal("config"),
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    timezone: z.string().max(80),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
]);
export async function GET() {
  if (!(await authorized()))
    return NextResponse.json({ error: "Acceso restringido" }, { status: 401 });
  try {
    const [appointments, expenses, payments, blocks, config] =
      await Promise.all([
        db.appointment.findMany({
          include: { service: true },
          orderBy: { start: "asc" },
        }),
        db.expense.findMany({ orderBy: { date: "desc" } }),
        db.payment.findMany({
          include: { appointment: { include: { service: true } } },
          orderBy: { date: "desc" },
        }),
        db.block.findMany({ orderBy: { start: "asc" } }),
        db.businessConfig.findUniqueOrThrow({ where: { id: 1 } }),
      ]);
    return NextResponse.json({
      appointments,
      expenses,
      payments,
      blocks,
      config,
    });
  } catch {
    return NextResponse.json(
      { error: "Base de datos no disponible" },
      { status: 503 },
    );
  }
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== process.env.APP_ORIGIN)
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  try {
    const body = await req.json();
    if (body.action === "login") {
      if (!(await allowRequest("admin-login", 10, 300)))
        return NextResponse.json(
          { error: "Demasiados intentos. Espera cinco minutos." },
          { status: 429 },
        );
      const password = z.string().max(512).parse(body.password);
      if (!passwordMatches(password))
        return NextResponse.json(
          { error: "Clave incorrecta" },
          { status: 401 },
        );
      await login();
      return NextResponse.json({ ok: true });
    }
    if (!(await authorized()))
      return NextResponse.json(
        { error: "Acceso restringido" },
        { status: 401 },
      );
    if (body.action === "logout") {
      (await cookies()).delete("session");
      return NextResponse.json({ ok: true });
    }
    const v = action.parse(body);
    if (v.action === "status")
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
        const a = await tx.appointment.findUniqueOrThrow({
          where: { id: v.id },
        });
        if (a.status !== "BOOKED")
          throw Error("La cita ya tiene un estado final");
        if (v.status === "COMPLETED" && a.end > new Date())
          throw Error("La cita todavía no ha terminado");
        await tx.appointment.update({
          where: { id: a.id },
          data: { status: v.status },
        });
        if (v.status === "COMPLETED")
          await tx.payment.create({
            data: {
              appointmentId: a.id,
              amount: a.price,
              method: v.method,
              description: a.name + " · servicio",
            },
          });
      });
    if (v.action === "expense") {
      const { action: _, ...data } = v;
      await db.expense.create({ data: { ...data, date: new Date(data.date) } });
    }
    if (v.action === "payment") {
      const { action: _, ...data } = v;
      await db.payment.create({ data: { ...data, date: new Date(data.date) } });
    }
    if (v.action === "block") {
      const valid = interval.parse(v);
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
        if (
          await tx.appointment.count({
            where: {
              status: { in: ["BOOKED", "COMPLETED"] },
              start: { lt: new Date(valid.end) },
              end: { gt: new Date(valid.start) },
            },
          })
        )
          throw Error("El descanso coincide con una cita");
        await tx.block.create({
          data: {
            ...valid,
            start: new Date(valid.start),
            end: new Date(valid.end),
          },
        });
      });
    }
    if (v.action === "unblock") await db.block.delete({ where: { id: v.id } });
    if (v.action === "config") {
      if (v.open >= v.close)
        throw Error("El cierre debe ser posterior a la apertura");
      new Intl.DateTimeFormat("es", { timeZone: v.timezone });
      new Intl.NumberFormat("es", { style: "currency", currency: v.currency });
      const { action: _, ...data } = v;
      await db.businessConfig.update({ where: { id: 1 }, data });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Revisa los datos del formulario"
            : e instanceof Error &&
                [
                  "La cita ya tiene un estado final",
                  "La cita todavía no ha terminado",
                  "El descanso coincide con una cita",
                  "El cierre debe ser posterior a la apertura",
                ].includes(e.message)
              ? e.message
              : "No se pudo guardar el cambio",
      },
      { status: 400 },
    );
  }
}
