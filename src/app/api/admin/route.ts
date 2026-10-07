import { ensureFinanceSchema } from "@/lib/ensure-finance-schema";
import {
  documentSchema,
  documentsReady,
  documents,
  annotate,
  reverse,
} from "@/lib/finance-documents";
import {
  journalReady,
  importLegacy,
  writeOperation,
  settlePending,
} from "@/lib/journal";
import { operationSchema } from "@/lib/accounting";
import { readSchedule, dateSchema, rangesSchema } from "@/lib/schedule";
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
  z.object({ action: z.literal("document"), document: documentSchema }),
  z.object({
    action: z.literal("reverse"),
    id: z.string().uuid(),
    reason: z.string().trim().min(5).max(180),
  }),
  z.object({ action: z.literal("operation"), operation: operationSchema }),
  z.object({
    action: z.literal("settle"),
    id: z.string().uuid(),
    date: z.string().datetime(),
    method: z.enum(["CASH", "TRANSFER"]),
  }),
  z.object({
    action: z.literal("preferences"),
    timezone: z.string().max(80),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  z.object({
    action: z.literal("schedule"),
    date: dateSchema,
    ranges: rangesSchema,
  }),
  z.object({
    action: z.literal("duration"),
    id: z.string().uuid(),
    duration: z.number().int().min(5).max(240),
  }),
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
    await ensureFinanceSchema();
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
    const finance = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
        if (!(await journalReady(tx))) return { ready: false, entries: [] };
        await importLegacy(tx, config.currency);
        const docs = await documents(tx);
        const entries = await tx.journalEntry.findMany({
          include: { lines: true },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        });
        return {
          ready: true,
          documentsReady: await documentsReady(tx),
          entries: entries.map((e) => ({
            ...e,
            document: docs.find((d) => d.entryId === e.id),
          })),
        };
      },
      { timeout: 20000 },
    );
    const paymentById = new Map(payments.map((p) => [p.id, p]));
    const financePayments = finance.entries.flatMap((e) => {
      const amount = e.lines
        .filter((l) => l.account.startsWith("REVENUE_"))
        .reduce((n, l) => n + l.credit - l.debit, 0);
      if (!amount) return [];
      const source = e.sourceKey.startsWith("reversal:")
        ? (finance.entries.find(
            (x) => x.id === e.sourceKey.slice("reversal:".length),
          )?.sourceKey ?? e.sourceKey)
        : e.sourceKey;
      const old = source.startsWith("legacy:payment:")
        ? paymentById.get(source.slice("legacy:payment:".length))
        : undefined;
      return [
        {
          id: e.id,
          amount,
          date: e.date,
          description: e.description,
          kind: e.kind,
          appointment: old?.appointment ?? null,
        },
      ];
    });
    const financeExpenses = finance.entries.flatMap((e) => {
      const amount = e.lines
        .filter((l) => l.account.startsWith("EXPENSE_"))
        .reduce((n, l) => n + l.debit - l.credit, 0);
      return amount
        ? [
            {
              id: e.id,
              amount,
              date: e.date,
              description: e.description,
              category: e.category ?? "OTHER",
            },
          ]
        : [];
    });
    const schedule = await readSchedule(db);
    const services = await db.service.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({
      scheduleReady: schedule.ready,
      schedule: schedule.dates ?? {},
      services,
      appointments,
      expenses: finance.ready ? financeExpenses : expenses,
      payments: finance.ready ? financePayments : payments,
      finance,
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
    if (v.action === "document" || v.action === "reverse")
      await db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
          if (v.action === "document") await annotate(tx, v.document);
          else await reverse(tx, v.id, v.reason);
        },
        { timeout: 20000 },
      );
    if (v.action === "operation" || v.action === "settle")
      await db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
          if (!(await journalReady(tx)))
            throw Error(
              "Primero aplica la actualización SQL de operaciones en Supabase",
            );
          const config = await tx.businessConfig.findUniqueOrThrow({
            where: { id: 1 },
          });
          await importLegacy(tx, config.currency);
          if (v.action === "operation")
            await writeOperation(
              tx,
              v.operation,
              config.currency,
              "manual:" + v.operation.requestId,
            );
          else await settlePending(tx, v);
        },
        { timeout: 20000 },
      );
    if (v.action === "schedule")
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
        const schedule = await readSchedule(tx);
        if (!schedule.ready)
          throw Error(
            "Primero aplica la actualización SQL de horarios en Supabase",
          );
        const dates = { ...schedule.dates };
        if (v.ranges.length) dates[v.date] = v.ranges;
        else delete dates[v.date];
        await tx.businessSchedule.upsert({
          where: { id: 1 },
          create: { id: 1, dates },
          update: { dates },
        });
      });
    if (v.action === "duration")
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
        await tx.service.update({
          where: { id: v.id },
          data: { duration: v.duration },
        });
      });
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
        if (v.status === "COMPLETED") {
          await tx.payment.create({
            data: {
              appointmentId: a.id,
              amount: a.price,
              method: v.method,
              description: a.name + " · servicio",
            },
          });
          if (await journalReady(tx)) {
            const config = await tx.businessConfig.findUniqueOrThrow({
              where: { id: 1 },
            });
            await importLegacy(tx, config.currency);
          }
        }
      });
    if (v.action === "expense") {
      const { action: _, ...data } = v;
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
        await tx.expense.create({
          data: { ...data, date: new Date(data.date) },
        });
        if (await journalReady(tx))
          await importLegacy(
            tx,
            (await tx.businessConfig.findUniqueOrThrow({ where: { id: 1 } }))
              .currency,
          );
      });
    }
    if (v.action === "payment") {
      const { action: _, ...data } = v;
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
        await tx.payment.create({
          data: { ...data, date: new Date(data.date) },
        });
        if (await journalReady(tx))
          await importLegacy(
            tx,
            (await tx.businessConfig.findUniqueOrThrow({ where: { id: 1 } }))
              .currency,
          );
      });
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
    if (v.action === "preferences" || v.action === "config") {
      if (v.action === "config" && v.open >= v.close)
        throw Error("El cierre debe ser posterior a la apertura");
      new Intl.DateTimeFormat("es", { timeZone: v.timezone });
      new Intl.NumberFormat("es", { style: "currency", currency: v.currency });
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(29062026)`;
        const current = await tx.businessConfig.findUniqueOrThrow({
          where: { id: 1 },
        });
        if (
          current.currency !== v.currency &&
          ((await tx.payment.count()) > 0 ||
            (await tx.expense.count()) > 0 ||
            ((await journalReady(tx)) && (await tx.journalEntry.count()) > 0))
        )
          throw Error(
            "No se puede cambiar la moneda con operaciones registradas",
          );
        await tx.businessConfig.update({
          where: { id: 1 },
          data: {
            timezone: v.timezone,
            currency: v.currency,
            ...(v.action === "config"
              ? { open: v.open, close: v.close, workingDays: v.workingDays }
              : {}),
          },
        });
      });
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
                  "Primero aplica el SQL de reportes",
                  "La operación no admite cambios",
                  "Esta factura ya está asociada a otra operación vigente",
                  "El documento ya está registrado; anula y registra la corrección",
                  "Revisa el IVA y la moneda de la operación",
                  "Anula la operación original, incluyendo su pago",
                  "No se puede cambiar la moneda con operaciones registradas",
                  "Primero aplica la actualización SQL de operaciones en Supabase",
                  "El capital a pagar supera los préstamos registrados",
                  "La operación no tiene un saldo pendiente",
                  "El pago no puede ser anterior a la operación",
                  "Esta operación ya fue registrada con otros datos",
                  "Primero aplica la actualización SQL de horarios en Supabase",
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
