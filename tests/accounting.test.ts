import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEntry,
  buildSettlement,
  financialTotals,
  operationSchema,
  type Operation,
} from "../src/lib/accounting";
import { extractReceiptFields } from "../src/lib/receipt";
const base: Operation = {
  requestId: "04ea4095-4c4d-4c60-9b7a-1598423f8cac",
  kind: "SALE_SERVICE",
  amount: 1500000,
  date: "2026-10-07T15:00:00.000Z",
  description: "Corte",
  state: "PAID",
  method: "CASH",
  interest: 0,
};
function totals(operations: Operation[]) {
  return financialTotals(operations.map((op) => buildEntry(op)));
}
test("every operation balances with correct loan interest split", () => {
  for (const kind of [
    "SALE_SERVICE",
    "SALE_PRODUCT",
    "SUPPLIES",
    "EXPENSE",
    "ASSET",
    "OWNER_CONTRIBUTION",
    "OWNER_WITHDRAWAL",
    "LOAN",
    "DEBT_PAYMENT",
  ] as Operation["kind"][]) {
    const entry = buildEntry({
      ...base,
      kind,
      interest: kind === "DEBT_PAYMENT" ? 10000 : 0,
    });
    assert.equal(
      entry.lines.reduce((n, l) => n + l.debit, 0),
      base.amount,
    );
    assert.equal(
      entry.lines.reduce((n, l) => n + l.credit, 0),
      base.amount,
    );
  }
});
test("owner money, assets and loan capital do not inflate profit", () => {
  const result = totals([
    { ...base, kind: "SALE_SERVICE" },
    { ...base, kind: "OWNER_CONTRIBUTION" },
    { ...base, kind: "LOAN" },
    { ...base, kind: "ASSET", amount: 200000 },
    { ...base, kind: "OWNER_WITHDRAWAL", amount: 100000 },
    { ...base, kind: "DEBT_PAYMENT", amount: 110000, interest: 10000 },
  ]);
  assert.equal(result.income, 1500000);
  assert.equal(result.expenses, 10000);
  assert.equal(result.profit, 1490000);
  assert.equal(result.equipment, 200000);
  assert.equal(result.loans, 1400000);
});
test("pending sale earns revenue once and settlement only collects cash", () => {
  const original = buildEntry({ ...base, state: "PENDING" });
  assert.equal(original.pendingAccount, "RECEIVABLE");
  assert.equal(financialTotals([original]).cash, 0);
  const result = financialTotals([
    original,
    { lines: buildSettlement("RECEIVABLE", base.amount, "TRANSFER") },
  ]);
  assert.equal(result.income, base.amount);
  assert.equal(result.bank, base.amount);
  assert.equal(result.receivable, 0);
});
test("pending expense is recognized once and settlement only reduces liability", () => {
  const original = buildEntry({ ...base, kind: "EXPENSE", state: "PENDING" });
  const result = financialTotals([
    original,
    { lines: buildSettlement("PAYABLE", base.amount, "CASH") },
  ]);
  assert.equal(result.expenses, base.amount);
  assert.equal(result.payable, 0);
  assert.equal(result.cash, -base.amount);
});
test("asset bought on credit affects payable and equipment, not operating expenses", () => {
  const result = totals([{ ...base, kind: "ASSET", state: "PENDING" }]);
  assert.equal(result.payable, base.amount);
  assert.equal(result.equipment, base.amount);
  assert.equal(result.expenses, 0);
});
test("invalid amounts, pending owner moves and excess interest are rejected", () => {
  assert.equal(
    operationSchema.safeParse({ ...base, amount: 1.5 }).success,
    false,
  );
  assert.equal(
    operationSchema.safeParse({
      ...base,
      kind: "OWNER_CONTRIBUTION",
      state: "PENDING",
    }).success,
    false,
  );
  assert.equal(
    operationSchema.safeParse({
      ...base,
      kind: "DEBT_PAYMENT",
      interest: base.amount,
    }).success,
    false,
  );
  assert.throws(() => buildSettlement("LOAN", base.amount, "CASH"));
});
test("receipt parsing prioritizes total over subtotal and keeps Chilean thousands", () => {
  assert.deepEqual(
    extractReceiptFields(
      "FECHA: 07/10/2026\nSUBTOTAL $10.000\nIVA 1.900\nTOTAL A PAGAR $11.900",
      "CLP",
    ),
    { amount: 11900, date: "2026-10-07" },
  );
});
test("unreliable receipt numbers and invalid dates remain manual", () => {
  assert.deepEqual(
    extractReceiptFields("FECHA 31/02/2026\nTOTAL 12,34", "CLP"),
    {},
  );
  assert.deepEqual(extractReceiptFields("FOTO BORROSA", "CLP"), {});
});
