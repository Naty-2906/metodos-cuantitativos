import { readSchedule } from "@/lib/schedule";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { slots } from "@/lib/availability";
import { z } from "zod";
export async function GET(req: NextRequest) {
  try {
    const config = await db.businessConfig.findUniqueOrThrow({
      where: { id: 1 },
    });
    const services = await db.service.findMany({
      where: { active: true },
      orderBy: { price: "asc" },
    });
    const date = req.nextUrl.searchParams.get("date"),
      serviceId = req.nextUrl.searchParams.get("service");
    if (!date || !serviceId) return NextResponse.json({ config, services });
    const parsed = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .safeParse(date);
    const service = services.find((s) => s.id === serviceId);
    if (!parsed.success || !service)
      return NextResponse.json(
        { error: "Fecha o servicio inválido" },
        { status: 400 },
      );
    const busy = await db.appointment.findMany({
      where: { status: { in: ["BOOKED", "COMPLETED"] } },
      select: { start: true, end: true },
    });
    const blocks = await db.block.findMany();
    const schedule = await readSchedule(db);
    return NextResponse.json({
      slots: slots(
        date,
        service.duration,
        { ...config, dailySchedule: schedule.dates },
        [...busy, ...blocks],
      ),
    });
  } catch (error: unknown) {
    // Log only diagnostic codes; never log connection strings or contact data.
    const diagnostic = error as {
      name?: string;
      code?: string;
      meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
    } | null;
    const safeCode = (value: unknown) =>
      typeof value === "string" && /^[A-Z0-9]{2,12}$/.test(value)
        ? value
        : "UNKNOWN";
    console.error("Public agenda database failure", {
      prismaCode: safeCode(diagnostic?.code),
      databaseCode: safeCode(
        diagnostic?.meta?.driverAdapterError?.cause?.originalCode,
      ),
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    });
    return NextResponse.json(
      { error: "La agenda no está disponible. Intenta más tarde." },
      { status: 503 },
    );
  }
}
