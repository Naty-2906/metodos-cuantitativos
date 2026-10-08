import { test } from "node:test";
import assert from "node:assert/strict";
import { documentSchema } from "../src/lib/finance-documents";
const base = {
  id: "00000000-0000-4000-8000-000000000001",
  vat: 0,
  recoverable: false,
};
test("expense receipts and invoices can omit folio and RUT", () => {
  for (const type of ["RECEIPT", "INVOICE"]) {
    const r = documentSchema.parse({ ...base, type });
    assert.equal(r.folio, "");
    assert.equal(r.rut, "");
    assert.doesNotThrow(() =>
      documentSchema.parse({ ...base, type, folio: "", rut: "OCR incompleto" }),
    );
  }
});
test("claiming VAT still requires an identified invoice", () => {
  assert.throws(() =>
    documentSchema.parse({
      ...base,
      type: "INVOICE",
      recoverable: true,
      vat: 1900,
    }),
  );
  assert.throws(() =>
    documentSchema.parse({
      ...base,
      type: "INVOICE",
      recoverable: true,
      folio: "",
      rut: "12.345.678-5",
    }),
  );
  assert.doesNotThrow(() =>
    documentSchema.parse({
      ...base,
      type: "INVOICE",
      recoverable: true,
      folio: "123",
      rut: "12.345.678-5",
      vat: 1900,
    }),
  );
});
