import type { Prisma } from "@prisma/client";
export type TaxTreatment = "UNKNOWN" | "AFFECTED" | "EXEMPT";
export async function readTaxProfile(tx: Prisma.TransactionClient) {
  const ready = await tx.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass('public."TaxProfile"') IS NOT NULL AS ready`;
  if (!ready[0].ready)
    return {
      ready: false,
      treatment: "UNKNOWN" as TaxTreatment,
      updatedAt: new Date(0),
    };
  const rows = await tx.$queryRaw<
    { treatment: TaxTreatment; updatedAt: Date }[]
  >`SELECT "treatment","updatedAt" FROM "TaxProfile" WHERE "id"=1`;
  return {
    ready: true,
    treatment: rows[0]?.treatment ?? "UNKNOWN",
    updatedAt: rows[0]?.updatedAt ?? new Date(0),
  };
}
export function vatIncluded(gross: number) {
  if (gross % 100 !== 0)
    throw Error("Usa montos en pesos enteros para ventas con IVA");
  const net = Math.round(gross / 100 / 1.19) * 100;
  return { net, vat: gross - net };
}
