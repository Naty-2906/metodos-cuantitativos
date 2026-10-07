import type { Prisma } from "@prisma/client";
import {
  buildEntry,
  buildSettlement,
  kindNames,
  operationSchema,
  type Operation,
} from "./accounting";
export async function journalReady(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<
    { ready: boolean }[]
  >`SELECT to_regclass('public."JournalEntry"') IS NOT NULL AND to_regclass('public."JournalLine"') IS NOT NULL AS ready`;
  return rows[0].ready;
}
export async function writeOperation(
  tx: Prisma.TransactionClient,
  input: Operation,
  currency: string,
  sourceKey: string,
) {
  const value = operationSchema.parse(input);
  const { lines, pendingAccount } = buildEntry(value);
  const existing = await tx.journalEntry.findUnique({
    where: { sourceKey },
    include: { lines: true },
  });
  const category =
    value.kind === "EXPENSE"
      ? (value.category ?? "OTHER")
      : value.kind === "SUPPLIES"
        ? "SUPPLIES"
        : null;
  if (existing) {
    if (
      existing.kind !== value.kind ||
      existing.amount !== value.amount ||
      existing.currency !== currency ||
      existing.date.getTime() !== new Date(value.date).getTime() ||
      existing.method !== value.method ||
      existing.description !== (value.description || kindNames[value.kind]) ||
      existing.pendingAccount !== pendingAccount ||
      existing.category !== category ||
      JSON.stringify(
        existing.lines
          .map(({ account, debit, credit }) => ({ account, debit, credit }))
          .sort((a, b) => a.account.localeCompare(b.account)),
      ) !==
        JSON.stringify(
          [...lines].sort((a, b) => a.account.localeCompare(b.account)),
        )
    )
      throw Error("Esta operación ya fue registrada con otros datos");
    return existing;
  }
  if (value.kind === "DEBT_PAYMENT") {
    const balance = await tx.journalLine.aggregate({
      where: { account: "LOAN", entry: { currency } },
      _sum: { credit: true, debit: true },
    });
    if (
      value.amount - value.interest >
      (balance._sum.credit ?? 0) - (balance._sum.debit ?? 0)
    )
      throw Error("El capital a pagar supera los préstamos registrados");
  }
  return tx.journalEntry.create({
    data: {
      sourceKey,
      kind: value.kind,
      description: value.description || kindNames[value.kind],
      amount: value.amount,
      currency,
      method: value.method,
      date: new Date(value.date),
      category,
      pendingAccount,
      lines: { create: lines },
    },
  });
}
export async function importLegacy(
  tx: Prisma.TransactionClient,
  currency: string,
) {
  // Retain IDs as stable source keys. Run under the same lock as all finance writes.
  const imported = await tx.journalEntry.findMany({
    where: { sourceKey: { startsWith: "legacy:" } },
    select: { sourceKey: true },
  });
  const keys = new Set(imported.map((e) => e.sourceKey));
  const [payments, expenses] = await Promise.all([
    tx.payment.findMany(),
    tx.expense.findMany(),
  ]);
  for (const p of payments) {
    const key = "legacy:payment:" + p.id;
    if (keys.has(key)) continue;
    await writeOperation(
      tx,
      {
        requestId: p.id,
        kind: "SALE_SERVICE",
        amount: p.amount,
        date: p.date.toISOString(),
        description: p.description,
        state: "PAID",
        method: p.method,
        interest: 0,
      },
      currency,
      key,
    );
  }
  for (const e of expenses) {
    const key = "legacy:expense:" + e.id;
    if (keys.has(key)) continue;
    const account =
      e.category === "SUPPLIES" ? "EXPENSE_SUPPLIES" : "EXPENSE_OPERATING";
    await tx.journalEntry.create({
      data: {
        sourceKey: key,
        kind: e.category === "SUPPLIES" ? "SUPPLIES" : "EXPENSE",
        amount: e.amount,
        date: e.date,
        description: e.description,
        currency,
        method: "UNSPECIFIED",
        category: e.category,
        lines: {
          create: [
            { account, debit: e.amount, credit: 0 },
            { account: "LEGACY_FUNDS", debit: 0, credit: e.amount },
          ],
        },
      },
    });
  }
}
export async function settlePending(
  tx: Prisma.TransactionClient,
  input: { id: string; date: string; method: "CASH" | "TRANSFER" },
) {
  const original = await tx.journalEntry.findUniqueOrThrow({
    where: { id: input.id },
  });
  if (
    await tx.journalEntry.findUnique({
      where: { sourceKey: "reversal:" + original.id },
    })
  )
    throw Error("La operación no admite cambios");
  if (!original.pendingAccount)
    throw Error("La operación no tiene un saldo pendiente");
  if (new Date(input.date) < original.date)
    throw Error("El pago no puede ser anterior a la operación");
  // A retried settlement is successful without another posting.
  if (original.settledAt) return original;
  const entry = await tx.journalEntry.create({
    data: {
      sourceKey: "settlement:" + original.id,
      parentId: original.id,
      kind: "SETTLEMENT",
      description:
        (original.pendingAccount === "RECEIVABLE" ? "Cobro: " : "Pago: ") +
        original.description,
      amount: original.amount,
      currency: original.currency,
      method: input.method,
      date: new Date(input.date),
      lines: {
        create: buildSettlement(
          original.pendingAccount,
          original.amount,
          input.method,
        ),
      },
    },
  });
  await tx.journalEntry.update({
    where: { id: original.id },
    data: { settledAt: new Date(input.date) },
  });
  return entry;
}
