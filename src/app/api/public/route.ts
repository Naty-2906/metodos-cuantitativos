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
    return NextResponse.json({
      slots: slots(date, service.duration, config, [...busy, ...blocks]),
    });
  } catch {
    return NextResponse.json(
      { error: "La agenda no está disponible. Intenta más tarde." },
      { status: 503 },
    );
  }
}
