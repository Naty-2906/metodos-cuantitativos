import { XMLParser, XMLValidator } from "fast-xml-parser";
import { receiptDate } from "./receipt";
import type { ReceiptExpense } from "./receipt-expense";
export function readDTE(xml: string): ReceiptExpense {
  if (xml.length > 2000000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error("XML no permitido");
  if (XMLValidator.validate(xml) !== true) throw Error("XML inválido");
  const parsed = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    parseTagValue: false,
    processEntities: false,
  }).parse(xml);
  function find(node: unknown): any[] {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(find);
    const n = node as Record<string, unknown>;
    if (n.Encabezado && n.Detalle) return [n];
    return Object.values(n).flatMap(find);
  }
  const docs = find(parsed);
  if (docs.length !== 1) throw Error("Elige un XML con un solo documento");
  const d = docs[0],
    h = d.Encabezado,
    id = h.IdDoc,
    t = h.Totales;
  const amount = Number(t.MntTotal),
    vat = t.IVA === undefined ? 0 : Number(t.IVA),
    net = t.MntNeto === undefined ? undefined : Number(t.MntNeto),
    exempt = Number(t.MntExe ?? 0);
  if (
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > 20000000 ||
    !Number.isInteger(vat) ||
    vat < 0 ||
    vat >= amount
  )
    throw Error("Montos inválidos en XML");
  if (net !== undefined && net + vat + exempt !== amount)
    throw Error("El total del XML no coincide con neto, exento e IVA");
  const type = String(id.TipoDTE);
  if (!["33", "34", "39", "41"].includes(type))
    throw Error("Este XML no es una factura o boleta de compra compatible");
  const date = receiptDate(String(id.FchEmis));
  if (!date) throw Error("Fecha de emisión inválida en XML");
  const details = Array.isArray(d.Detalle) ? d.Detalle : [d.Detalle];
  const items = details
    .slice(0, 20)
    .map((l: any) => ({
      name: String(l.NmbItem ?? "Artículo").slice(0, 100),
      quantity: Number(l.QtyItem) > 0 ? Number(l.QtyItem) : null,
      amount: Number(l.MontoItem) >= 0 ? Number(l.MontoItem) : null,
    }));
  return {
    amount,
    date,
    vat,
    net,
    documentType: ["34", "41"].includes(type)
      ? "EXEMPT"
      : type === "33"
        ? "INVOICE"
        : "RECEIPT",
    folio: String(id.Folio ?? ""),
    rut: String(h.Emisor?.RUTEmisor ?? ""),
    items,
    description: items
      .map((i: { name: string }) => i.name)
      .join(" · ")
      .slice(0, 200),
    warnings: [
      "Los datos vienen del XML. Confirma que la compra corresponde a tu negocio.",
    ],
  };
}
