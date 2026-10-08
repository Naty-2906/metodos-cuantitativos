import { test } from "node:test";
import assert from "node:assert/strict";
import { extractReceiptFields, receiptSummary } from "../src/lib/receipt";
import { readDTE } from "../src/lib/receipt-xml";
import { vatIncluded } from "../src/lib/tax-profile";
test("final total on following line excludes net VAT cash and change", () => {
  assert.deepEqual(
    extractReceiptFields(
      "NETO 10.000\nIVA 19% 1.900\nMONTO TOTAL\n\n$ 11.900\nEFECTIVO 20.000\nVUELTO 8.100\nFECHA EMISION\n07.10.2026\nFECHA VENCIMIENTO 30/10/2026",
      "CLP",
    ),
    { amount: 11900, date: "2026-10-07" },
  );
  assert.equal(
    receiptSummary("NETO 10.000\nIVA 19% 1.900\nTOTAL 11.900", "CLP").vat,
    1900,
  );
});
test("emission wins over payment and unrelated dates", () => {
  assert.equal(
    extractReceiptFields(
      "Fecha pago 09/10/2026\nResolución 01/01/2020\nFecha de emisión: 7 de octubre de 2026\nTOTAL A PAGAR 15,000",
      "CLP",
    ).date,
    "2026-10-07",
  );
  assert.equal(
    extractReceiptFields(
      "EMISIÓN 2026-10-07\nFecha vencimiento 2026-11-07",
      "CLP",
    ).date,
    "2026-10-07",
  );
});
test("date below a due-date label is not mistaken for issuance", () => {
  assert.equal(
    extractReceiptFields("Fecha vencimiento\n30/10/2026\nTOTAL 10000", "CLP")
      .date,
    undefined,
  );
});
test("contradictory totals and impossible dates are left for review", () => {
  const r = receiptSummary(
    "TOTAL 10.000\nTOTAL 20.000\nFecha emisión 31/02/2026",
    "CLP",
  );
  assert.equal(r.amount, undefined);
  assert.equal(r.amountConflict, true);
  assert.equal(r.date, undefined);
});
const xml = `<DTE><Documento><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>123</Folio><FchEmis>2026-10-07</FchEmis></IdDoc><Emisor><RUTEmisor>76.123.456-0</RUTEmisor></Emisor><Totales><MntNeto>10000</MntNeto><IVA>1900</IVA><MntTotal>11900</MntTotal></Totales></Encabezado><Detalle><NmbItem>Cuchillas</NmbItem><QtyItem>2</QtyItem><MontoItem>10000</MontoItem></Detalle></Documento></DTE>`;
test("XML reads exact total, issuance, VAT and document reference", () => {
  const r = readDTE(xml);
  assert.equal(r.amount, 11900);
  assert.equal(r.date, "2026-10-07");
  assert.equal(r.vat, 1900);
  assert.equal(r.folio, "123");
  assert.equal(r.documentType, "INVOICE");
  assert.equal(r.items[0].name, "Cuchillas");
});
test("XML rejects entities, multiple documents and inconsistent totals", () => {
  assert.throws(() => readDTE("<!DOCTYPE x>" + xml));
  assert.throws(() => readDTE("<docs>" + xml + xml + "</docs>"));
  assert.throws(() =>
    readDTE(xml.replace("<MntTotal>11900", "<MntTotal>12000")),
  );
});
test("VAT included splits whole CLP and remains balanced", () => {
  assert.deepEqual(vatIncluded(1190000), { net: 1000000, vat: 190000 });
  const v = vatIncluded(1500000);
  assert.equal(v.net + v.vat, 1500000);
  assert.equal(v.net % 100, 0);
  assert.throws(() => vatIncluded(1190001));
});
