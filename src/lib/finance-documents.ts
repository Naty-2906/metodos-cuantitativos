import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { validRut } from "./reports";
import { checkBalanced, type Account } from "./accounting";
export const documentSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["INVOICE", "RECEIPT", "EXEMPT", "HONORARIUM", "SUPPORT"]),
    folio: z.string().trim().max(80).default(""),
    rut: z.string().trim().max(20).default(""),
    vat: z.number().int().min(0).max(2000000000),
    recoverable: z.boolean(),
  })
  .superRefine((v, c) => {
    if (v.recoverable && (v.type !== "INVOICE" || !validRut(v.rut) || !v.folio))
      c.addIssue({
        code: "custom",
        message: "El crédito requiere factura, folio y RUT válido",
      });
    if (["EXEMPT", "HONORARIUM", "SUPPORT"].includes(v.type) && v.vat !== 0)
      c.addIssue({ code: "custom", message: "Este documento no registra IVA" });
  });
export async function documentsReady(tx: Prisma.TransactionClient) {
  const r = await tx.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass('public."JournalDocument"') IS NOT NULL AS ready`;
  return r[0].ready;
}
export async function documents(tx: Prisma.TransactionClient) {
  if (!(await documentsReady(tx))) return [];
  return tx.$queryRaw<
    {
      entryId: string;
      type: string;
      folio: string;
      rut: string;
      vat: number;
      recoverable: boolean;
    }[]
  >`SELECT * FROM "JournalDocument"`;
}
export async function annotate(
  tx: Prisma.TransactionClient,
  input: z.infer<typeof documentSchema>,
) {
  const v = documentSchema.parse(input);
  if (!(await documentsReady(tx)))
    throw Error("Primero aplica el SQL de reportes");
  const e = await tx.journalEntry.findUniqueOrThrow({
    where: { id: v.id },
    include: { lines: true },
  });
  if (
    e.sourceKey.startsWith("reversal:") ||
    e.kind === "SETTLEMENT" ||
    (await tx.journalEntry.findUnique({
      where: { sourceKey: "reversal:" + e.id },
    }))
  )
    throw Error("La operación no admite cambios");
  if (
    !["SALE_SERVICE", "SALE_PRODUCT", "SUPPLIES", "EXPENSE", "ASSET"].includes(
      e.kind,
    )
  )
    throw Error("La operación no admite cambios");
  if (
    (
      await tx.$queryRaw<
        { entryId: string }[]
      >`SELECT "entryId" FROM "JournalDocument" WHERE "entryId"=${e.id}::uuid`
    ).length
  )
    throw Error(
      "El documento ya está registrado; anula y registra la corrección",
    );
  if (e.currency !== "CLP" || v.vat >= e.amount)
    throw Error("Revisa el IVA y la moneda de la operación");
  const sale = e.kind.startsWith("SALE_");
  if (sale && v.recoverable)
    throw Error("Revisa el IVA y la moneda de la operación");
  if (v.type !== "SUPPORT" && v.folio && validRut(v.rut)) {
    const normalizedRut = v.rut.replace(/[.\s]/g, "").toUpperCase();
    const duplicate = await tx.$queryRaw<
      { entryId: string }[]
    >`SELECT d."entryId" FROM "JournalDocument" d JOIN "JournalEntry" j ON j."id"=d."entryId" WHERE d."type"=${v.type} AND d."folio"=${v.folio} AND regexp_replace(upper(d."rut"), '[.[:space:]]', '', 'g')=${normalizedRut} AND (j."kind" LIKE 'SALE_%')=${sale} AND NOT EXISTS (SELECT 1 FROM "JournalEntry" reversed WHERE reversed."sourceKey"='reversal:'||j."id"::text)`;
    if (duplicate.length)
      throw Error("Este documento ya está asociado a otra operación vigente");
  }
  const lines = e.lines.map((l) => ({
    account: l.account as Account,
    debit: l.debit,
    credit: l.credit,
  }));
  // An automatically taxed sale already has a VAT line; replace its split rather than subtracting twice.
  const existingVat = lines.filter(
    (l) => l.account === "VAT_OUTPUT" || l.account === "VAT_INPUT",
  );
  const targetVat = sale ? v.vat : v.recoverable ? v.vat : 0;
  if (targetVat || existingVat.length) {
    const line = lines.find((l) =>
      sale
        ? l.account.startsWith("REVENUE_")
        : l.account.startsWith("EXPENSE_") || l.account === "EQUIPMENT",
    );
    if (!line) throw Error("La operación no admite cambios");
    if (sale)
      line.credit +=
        existingVat.reduce((n, l) => n + l.credit - l.debit, 0) - targetVat;
    else
      line.debit +=
        existingVat.reduce((n, l) => n + l.debit - l.credit, 0) - targetVat;
    const changed = lines.filter(
      (l) => l.account !== "VAT_OUTPUT" && l.account !== "VAT_INPUT",
    );
    if (targetVat)
      changed.push({
        account: sale ? "VAT_OUTPUT" : "VAT_INPUT",
        debit: sale ? 0 : targetVat,
        credit: sale ? targetVat : 0,
      });
    checkBalanced(changed);
    await tx.journalLine.deleteMany({ where: { entryId: e.id } });
    await tx.journalLine.createMany({
      data: changed.map((l) => ({ ...l, entryId: e.id })),
    });
  }
  await tx.$executeRaw`INSERT INTO "JournalDocument" ("entryId","type","folio","rut","vat","recoverable") VALUES (${e.id}::uuid,${v.type},${v.folio},${v.rut},${v.vat},${v.recoverable})`;
}
export async function reverse(
  tx: Prisma.TransactionClient,
  id: string,
  reason: string,
) {
  const e = await tx.journalEntry.findUniqueOrThrow({
    where: { id },
    include: { lines: true, settlement: { include: { lines: true } } },
  });
  if (e.kind === "SETTLEMENT" || e.sourceKey.startsWith("reversal:"))
    throw Error("Anula la operación original, incluyendo su pago");
  if (
    await tx.journalEntry.findUnique({ where: { sourceKey: "reversal:" + id } })
  )
    return;
  for (const original of [e.settlement, e].filter((x) => x !== null)) {
    await tx.journalEntry.create({
      data: {
        sourceKey: "reversal:" + original.id,
        kind: "REVERSAL",
        description: "Anulación: " + reason,
        amount: original.amount,
        currency: original.currency,
        method: original.method,
        date: original.date,
        category: original.category,
        lines: {
          create: original.lines.map((l) => ({
            account: l.account,
            debit: l.credit,
            credit: l.debit,
          })),
        },
      },
    });
  }
}
