import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceFromTotal, invoiceFromNet } from "../src/lib/invoice";
import { report } from "../src/lib/reports";
import type { JournalView } from "../src/lib/accounting";
test("IVA included differs from 19 percent of the gross total", () => {
  assert.deepEqual(invoiceFromTotal(11900), {
    net: 10000,
    vat: 1900,
    total: 11900,
  });
  assert.deepEqual(invoiceFromNet(10000), {
    net: 10000,
    vat: 1900,
    total: 11900,
  });
  assert.deepEqual(invoiceFromTotal(15000), {
    net: 12605,
    vat: 2395,
    total: 15000,
  });
  assert.notEqual(invoiceFromTotal(15000).vat, Math.round(15000 * 0.19));
  assert.throws(() => invoiceFromTotal(11.9));
});
test("ordered income statement separates recoverable IVA, assets and loan capital", () => {
  const make = (id: string, lines: JournalView["lines"]): JournalView => ({
    id,
    sourceKey: "manual:" + id,
    kind: "SALE_SERVICE",
    amount: 1190000,
    currency: "CLP",
    method: "CASH",
    date: "2026-10-07T15:00:00Z",
    category: null,
    pendingAccount: null,
    settledAt: null,
    parentId: null,
    description: id,
    lines,
  });
  const entries = [
    make("sale", [
      { account: "CASH", debit: 1190000, credit: 0 },
      { account: "REVENUE_SERVICE", debit: 0, credit: 1000000 },
      { account: "VAT_OUTPUT", debit: 0, credit: 190000 },
    ]),
    make("purchase", [
      { account: "EXPENSE_SUPPLIES", debit: 500000, credit: 0 },
      { account: "VAT_INPUT", debit: 95000, credit: 0 },
      { account: "CASH", debit: 0, credit: 595000 },
    ]),
    make("rent", [
      { account: "EXPENSE_OPERATING", debit: 100000, credit: 0 },
      { account: "CASH", debit: 0, credit: 100000 },
    ]),
    make("equipment", [
      { account: "EQUIPMENT", debit: 200000, credit: 0 },
      { account: "BANK", debit: 0, credit: 200000 },
    ]),
    make("loan", [
      { account: "BANK", debit: 1000000, credit: 0 },
      { account: "LOAN", debit: 0, credit: 1000000 },
    ]),
  ];
  const r = report(entries, "2026-10", "America/Santiago", "CLP");
  assert.equal(r.totals.income, 1000000);
  assert.equal(r.totals.expenses, 600000);
  assert.equal(r.totals.profit, 400000);
  assert.equal(r.vatDifference, 95000);
  assert.equal(r.incomeStatement.at(-1)?.amount, r.totals.profit);
  assert.equal(r.incomeStatement[4].label, "Resultado bruto");
  assert.equal(r.incomeStatement[4].amount, 500000);
  assert.equal(r.incomeStatement[6].amount, 400000);
  assert.equal(r.balanceDifference, 0);
});
