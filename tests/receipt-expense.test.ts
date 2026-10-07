import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localReceiptExpense,
  validateAIReceipt,
} from "../src/lib/receipt-expense";
test("receipt proposes consumables, total and description without assuming item prices", () => {
  const r = localReceiptExpense(
    "BOLETA\nFecha 07/10/2026\nCuchillas 2 5000\nDesinfectante 1 1000\nSUBTOTAL 6000\nIVA 1140\nTOTAL 7.140\nEFECTIVO 10000\nVUELTO 2860",
    "CLP",
  );
  assert.equal(r.amount, 7140);
  assert.equal(r.kind, "SUPPLIES");
  assert.equal(r.date, "2026-10-07");
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].amount, null);
  assert.match(r.description!, /Cuchillas/);
});
test("durable equipment is separated from consumable costs", () => {
  assert.equal(
    localReceiptExpense("Maquina clipper 1 50000\nTOTAL 50.000", "CLP").kind,
    "ASSET",
  );
  const mixed = localReceiptExpense(
    "Maquina 1 50000\nCuchillas 2 5000\nTOTAL 55.000",
    "CLP",
  );
  assert.equal(mixed.kind, undefined);
  assert.ok(mixed.warnings.some((w) => w.includes("mezclados")));
});
test("uncertain receipts keep missing totals and dates visible", () => {
  const r = localReceiptExpense(
    "Cera para cabello\nSUBTOTAL 5000\nFECHA 31/02/2026",
    "CLP",
  );
  assert.equal(r.amount, undefined);
  assert.equal(r.date, undefined);
  assert.ok(r.warnings.length >= 2);
});
test("rent and utility receipts suggest correct operating category", () => {
  assert.equal(
    localReceiptExpense("Arriendo local 150000\nTOTAL 150000", "CLP").category,
    "RENT",
  );
  assert.equal(
    localReceiptExpense("Internet hogar\nTOTAL 19990", "CLP").category,
    "UTILITIES",
  );
});
const ai = {
  amount: 11900,
  date: "2026-10-07",
  description: "Compra de cuchillas",
  kind: "SUPPLIES",
  category: null,
  items: [{ name: "Cuchillas", quantity: 2, amount: 11900 }],
  warnings: [],
};
test("AI output is validated before entering an expense form", () => {
  assert.equal(validateAIReceipt(ai, "CLP").amount, 11900);
  assert.throws(() => validateAIReceipt({ ...ai, date: "2026-02-31" }, "CLP"));
  assert.throws(() => validateAIReceipt({ ...ai, amount: 11.9 }, "CLP"));
  assert.throws(() =>
    validateAIReceipt({ ...ai, kind: "SALE_SERVICE" }, "CLP"),
  );
  assert.throws(() => validateAIReceipt({ ...ai, amount: -5000 }, "CLP"));
});
test("AI can express uncertainty rather than inventing a purchase", () => {
  const r = validateAIReceipt(
    { ...ai, amount: null, date: null, kind: null, items: [] },
    "CLP",
  );
  assert.equal(r.amount, undefined);
  assert.equal(r.date, undefined);
  assert.equal(r.kind, undefined);
  assert.equal(r.warnings.length, 2);
});
