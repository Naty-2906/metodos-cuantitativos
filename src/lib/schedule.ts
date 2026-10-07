import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T12:00:00Z");
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Fecha inválida");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const rangesSchema = z
  .array(z.object({ open: time, close: time }))
  .max(6)
  .refine((ranges) => {
    const sorted = [...ranges].sort((a, b) => a.open.localeCompare(b.open));
    return sorted.every(
      (range, i) =>
        range.open < range.close &&
        (i === 0 || sorted[i - 1].close <= range.open),
    );
  }, "Los bloques deben tener inicio anterior al fin y no solaparse");
export const datesSchema = z.record(dateSchema, rangesSchema);
export type ScheduleDates = z.infer<typeof datesSchema>;
export async function readSchedule(
  client: PrismaClient | Prisma.TransactionClient,
) {
  // Preserve the current public workflow until the additive migration is applied.
  const rows = await client.$queryRaw<
    { exists: boolean }[]
  >`SELECT to_regclass('public."BusinessSchedule"') IS NOT NULL AS "exists"`;
  if (!rows[0].exists) return { ready: false, dates: undefined };
  const schedule = await client.businessSchedule.findUnique({
    where: { id: 1 },
  });
  return { ready: true, dates: datesSchema.parse(schedule?.dates ?? {}) };
}
