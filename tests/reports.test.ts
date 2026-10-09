import { test } from "node:test";
import assert from "node:assert/strict";
import { report, validRut } from "../src/lib/reports";
import { type JournalView } from "../src/lib/accounting";
const sale: JournalView = {
  id: "sale",
  sourceKey: "manual:sale",
  kind: "SALE_SERVICE",
  description: "Corte",
  amount: 1190000,
  currency: "CLP",
  method: "CASH",
  date: "2026-10-01T02:00:00Z",
  category: null,
  pendingAccount: null,
  settledAt: null,
  parentId: null,
  document: {
    type: "RECEIPT",
    folio: "1",
    rut: "",
    vat: 190000,
    recoverable: false,
  },
  lines: [
    { account: "CASH", debit: 1190000, credit: 0 },
    { account: "REVENUE_SERVICE", debit: 0, credit: 1000000 },
    { account: "VAT_OUTPUT", debit: 0, credit: 190000 },
  ],
};
test("report uses Santiago month and separates gross from VAT", () => {
  const r = report([sale], "2026-09", "America/Santiago", "CLP");
  assert.equal(r.totals.income, 1000000);
  assert.equal(r.vatOutput, 190000);
  assert.equal(r.cashIn, 1190000);
  assert.equal(r.cashOut, 0);
  assert.equal(r.missing, 0);
  assert.equal(
    report([sale], "2026-10", "America/Santiago", "CLP").totals.income,
    0,
  );
});
test("reversal cancels income and VAT without erasing the original", () => {
  const reversal = {
    ...sale,
    id: "reverse",
    sourceKey: "reversal:sale",
    kind: "REVERSAL",
    document: undefined,
    lines: sale.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  };
  const r = report([sale, reversal], "2026-09", "America/Santiago", "CLP");
  assert.equal(r.totals.profit, 0);
  assert.equal(r.cashIn, 0);
  assert.equal(r.cashOut, 0);
  assert.equal(r.vatOutput, 0);
  assert.equal(r.period.length, 2);
});
test("purchase VAT paid is counted when debt actually settles", () => {
  const expense = {
    ...sale,
    id: "purchase",
    kind: "EXPENSE",
    sourceKey: "manual:purchase",
    date: "2026-09-10T15:00:00Z",
    pendingAccount: "PAYABLE",
    settledAt: "2026-10-05T15:00:00Z",
    lines: [
      { account: "EXPENSE_OPERATING", debit: 1190000, credit: 0 },
      { account: "PAYABLE", debit: 0, credit: 1190000 },
    ],
  };
  const r = report([expense], "2026-10", "America/Santiago", "CLP");
  assert.equal(r.paidPurchaseVat, 190000);
  assert.equal(r.purchaseVat, 0);
  assert.equal(r.vatInput, 0);
});
test("RUT validation checks verifier", () => {
  assert.equal(validRut("12.345.678-5"), true);
  assert.equal(validRut("12345678-0"), false);
  assert.equal(validRut(""), false);
});
test("balance accumulates journal accounts, equity and reversals through the selected month", () => {
  const entry = (
    id: string,
    date: string,
    lines: JournalView["lines"],
  ): JournalView => ({
    ...sale,
    id,
    sourceKey: `manual:${id}`,
    date,
    document: undefined,
    lines,
  });
  const capital = entry("capital", "2026-09-01T15:00:00Z", [
    { account: "BANK", debit: 5000000, credit: 0 },
    { account: "OWNER_CAPITAL", debit: 0, credit: 5000000 },
  ]);
  const purchase = entry("equipment", "2026-10-02T15:00:00Z", [
    { account: "EQUIPMENT", debit: 2000000, credit: 0 },
    { account: "PAYABLE", debit: 0, credit: 2000000 },
  ]);
  const withdrawal = entry("withdrawal", "2026-10-03T15:00:00Z", [
    { account: "OWNER_DRAWINGS", debit: 100000, credit: 0 },
    { account: "BANK", debit: 0, credit: 100000 },
  ]);
  const entries = [capital, sale, purchase, withdrawal];
  const r = report(entries, "2026-10", "America/Santiago", "CLP");
  assert.equal(r.assets, 8090000);
  assert.equal(r.liabilities, 2190000);
  assert.equal(r.equity, 5900000);
  assert.equal(r.balanceDifference, 0);
  assert.equal(
    r.balanceSheet.find(
      (row) => row.label === "Ganancias o pérdidas acumuladas",
    )?.amount,
    1000000,
  );
  assert.equal(
    r.balanceSheet.find((row) => row.label === "Retiros del dueño")?.amount,
    -100000,
  );
  assert.equal(
    report(entries, "2026-09", "America/Santiago", "CLP").assets,
    6190000,
  );
  const reversal = {
    ...purchase,
    id: "reverse-equipment",
    sourceKey: "reversal:equipment",
    lines: purchase.lines.map((l) => ({
      ...l,
      debit: l.credit,
      credit: l.debit,
    })),
  };
  const corrected = report(
    [...entries, reversal],
    "2026-10",
    "America/Santiago",
    "CLP",
  );
  assert.equal(corrected.assets, r.assets - 2000000);
  assert.equal(corrected.liabilities, r.liabilities - 2000000);
  assert.equal(corrected.balanceDifference, 0);
});
