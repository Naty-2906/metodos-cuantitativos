import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { financialTotals, type JournalView } from "../src/lib/accounting";
const base = process.env.APP_ORIGIN!;
if (
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname) ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw Error(
    "Las pruebas financieras solo se ejecutan en una aplicación y base locales",
  );
const keys: string[] = [],
  legacyIds: string[] = [];
let cookie = "";
const date = new Date().toISOString();
async function post(body: unknown, auth = true) {
  return fetch(base + "/api/admin", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: base,
      ...(auth && cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function read() {
  const r = await fetch(base + "/api/admin", { headers: { cookie } });
  assert.equal(r.status, 200);
  return (await r.json()).finance as { ready: boolean; entries: JournalView[] };
}
async function operation(
  kind: string,
  amount: number,
  extra: Record<string, unknown> = {},
) {
  const requestId = randomUUID();
  keys.push("manual:" + requestId);
  const input = {
    requestId,
    kind,
    amount,
    date,
    description: "Finance smoke " + kind,
    state: "PAID",
    method: "CASH",
    interest: 0,
    ...extra,
  };
  const r = await post({ action: "operation", operation: input });
  assert.equal(r.status, 200, JSON.stringify(await r.json()));
  return input;
}
async function main() {
  assert.equal(
    (await post({ action: "operation", operation: {} }, false)).status,
    401,
  );
  const login = await post(
    { action: "login", password: process.env.ADMIN_PASSWORD },
    false,
  );
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  const start = await read();
  assert.ok(start.ready);
  const baseline = financialTotals(start.entries);
  const sale = await operation("SALE_SERVICE", 1500000, { state: "PENDING" });
  const repeated = await Promise.all([
    post({ action: "operation", operation: sale }),
    post({ action: "operation", operation: sale }),
  ]);
  assert.deepEqual(
    repeated.map((r) => r.status),
    [200, 200],
  );
  assert.equal(
    await db.journalEntry.count({
      where: { sourceKey: "manual:" + sale.requestId },
    }),
    1,
  );
  assert.equal(
    (await post({ action: "operation", operation: { ...sale, amount: 200 } }))
      .status,
    400,
  );
  assert.equal(
    (await post({ action: "operation", operation: { ...sale, state: "PAID" } }))
      .status,
    400,
  );
  const pending = await db.journalEntry.findUniqueOrThrow({
    where: { sourceKey: "manual:" + sale.requestId },
  });
  assert.deepEqual(
    (
      await Promise.all([
        post({ action: "settle", id: pending.id, date, method: "TRANSFER" }),
        post({ action: "settle", id: pending.id, date, method: "TRANSFER" }),
      ])
    ).map((r) => r.status),
    [200, 200],
  );
  assert.equal(
    await db.journalEntry.count({ where: { parentId: pending.id } }),
    1,
  );
  await operation("OWNER_CONTRIBUTION", 5000000);
  await operation("OWNER_WITHDRAWAL", 100000);
  await operation("ASSET", 2000000);
  await operation("LOAN", 5000000, { method: "TRANSFER" });
  await operation("DEBT_PAYMENT", 1010000, {
    interest: 10000,
    method: "TRANSFER",
  });
  const loanBefore = await read();
  const badId = randomUUID();
  keys.push("manual:" + badId);
  assert.equal(
    (
      await post({
        action: "operation",
        operation: {
          requestId: badId,
          kind: "DEBT_PAYMENT",
          amount: financialTotals(loanBefore.entries).loans + 1000,
          date,
          description: "Excess debt",
          state: "PAID",
          method: "CASH",
          interest: 0,
        },
      })
    ).status,
    400,
  );
  const expense = await operation("EXPENSE", 100000, {
    state: "PENDING",
    category: "RENT",
  });
  const expenseRow = await db.journalEntry.findUniqueOrThrow({
    where: { sourceKey: "manual:" + expense.requestId },
  });
  assert.equal(
    (await post({ action: "settle", id: expenseRow.id, date, method: "CASH" }))
      .status,
    200,
  );
  const beforeDate = new Date(Date.now() - 86400000).toISOString();
  const unpaid = await operation("SALE_PRODUCT", 1000, { state: "PENDING" });
  const unpaidRow = await db.journalEntry.findUniqueOrThrow({
    where: { sourceKey: "manual:" + unpaid.requestId },
  });
  assert.equal(
    (
      await post({
        action: "settle",
        id: unpaidRow.id,
        date: beforeDate,
        method: "CASH",
      })
    ).status,
    400,
  );
  const original = await db.expense.create({
    data: {
      category: "SUPPLIES",
      amount: 12000,
      description: "Finance smoke historical expense",
      date: new Date(),
    },
  });
  legacyIds.push(original.id);
  keys.push("legacy:expense:" + original.id);
  await read();
  await read();
  assert.equal(
    await db.journalEntry.count({
      where: { sourceKey: "legacy:expense:" + original.id },
    }),
    1,
  );
  const imported = await db.journalEntry.findUniqueOrThrow({
    where: { sourceKey: "legacy:expense:" + original.id },
  });
  assert.equal(imported.method, "UNSPECIFIED");
  const config = await db.businessConfig.findUniqueOrThrow({
    where: { id: 1 },
  });
  assert.equal(
    (
      await post({
        action: "preferences",
        timezone: config.timezone,
        currency: config.currency === "CLP" ? "USD" : "CLP",
      })
    ).status,
    400,
  );
  const end = financialTotals((await read()).entries);
  assert.equal(end.income - baseline.income, 1501000);
  assert.equal(end.expenses - baseline.expenses, 122000);
  assert.equal(end.loans - baseline.loans, 4000000);
  assert.equal(end.equipment - baseline.equipment, 2000000);
  assert.equal(end.receivable - baseline.receivable, 1000);
  assert.equal(end.payable - baseline.payable, 0);
  const invalidKey = "smoke-invalid:" + randomUUID();
  keys.push(invalidKey);
  await assert.rejects(
    db.$transaction((tx) =>
      tx.journalEntry.create({
        data: {
          sourceKey: invalidKey,
          kind: "SALE_SERVICE",
          description: "Invalid balance smoke",
          amount: 1000,
          currency: "CLP",
          method: "CASH",
          date: new Date(),
          lines: {
            create: [
              { account: "CASH", debit: 1000, credit: 0 },
              { account: "REVENUE_SERVICE", debit: 0, credit: 900 },
            ],
          },
        },
      }),
    ),
  );
  assert.equal(
    await db.journalEntry.count({ where: { sourceKey: invalidKey } }),
    0,
  );
  console.log(
    "PASS: simple operations, duplicate requests, pending settlement exactly once, historical import, principal/interest, overpayment rejection, accrual metrics and database balance constraints.",
  );
}
main().finally(async () => {
  const rows = await db.journalEntry.findMany({
    where: { sourceKey: { in: keys } },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  await db.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { parentId: { in: ids } } });
    await tx.journalEntry.deleteMany({ where: { id: { in: ids } } });
    await tx.expense.deleteMany({ where: { id: { in: legacyIds } } });
  });
  await db.$disconnect();
});
