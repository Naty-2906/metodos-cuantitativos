import { z } from "zod";
import {
  extractReceiptFields,
  receiptSummary,
  type ReceiptFields,
} from "./receipt";
export type ReceiptExpense = ReceiptFields & {
  vat?: number;
  net?: number;
  folio?: string;
  rut?: string;
  documentType?: "INVOICE" | "RECEIPT" | "EXEMPT" | "SUPPORT";
  description?: string;
  kind?: "SUPPLIES" | "EXPENSE" | "ASSET";
  category?: "RENT" | "UTILITIES" | "TOOLS" | "MARKETING" | "OTHER";
  items: { name: string; quantity: number | null; amount: number | null }[];
  warnings: string[];
};
const clean = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function localReceiptExpense(
  text: string,
  currency: string,
): ReceiptExpense {
  const fields = extractReceiptFields(text, currency);
  const summary = receiptSummary(text, currency);
  const folio = text.match(
    /(?:folio|boleta\s*(?:n[°ºo.]*)?|factura\s*(?:n[°ºo.]*)?)\s*[:#]?\s*(\d{1,15})/i,
  )?.[1];
  const rut = text.match(/\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b/)?.[1];
  const normalized = clean(text);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const itemLines = lines.filter(
    (l) =>
      /[a-záéíóúñ]{3}/i.test(l) &&
      /\d/.test(l) &&
      !/\b(total|subtotal|neto|iva|rut|fecha|folio|boleta|factura|telefono|direccion|efectivo|cambio|vuelto|tarjeta|autorizacion|transbank)\b/i.test(
        clean(l),
      ),
  );
  const items = itemLines.slice(0, 20).map((line) => ({
    name: line.slice(0, 100),
    quantity: null,
    amount: null,
  }));
  let kind: ReceiptExpense["kind"], category: ReceiptExpense["category"];
  const equipment = /\b(maquina|clipper|trimmer|sillon|mueble|secador)\b/.test(
    normalized,
  );
  const supplies =
    /\b(cuchilla|cuchillas|shampoo|champu|cera|gel|talco|guantes|navajas|desinfectante|alcohol|toallas)\b/.test(
      normalized,
    );
  if (equipment && !supplies) {
    kind = "ASSET";
    category = "TOOLS";
  } else if (supplies && !equipment) kind = "SUPPLIES";
  else if (/\b(arriendo|alquiler)\b/.test(normalized)) {
    kind = "EXPENSE";
    category = "RENT";
  } else if (
    /\b(electricidad|internet|agua potable|telefonia|gas|energia)\b/.test(
      normalized,
    )
  ) {
    kind = "EXPENSE";
    category = "UTILITIES";
  } else if (/\b(publicidad|marketing|anuncios)\b/.test(normalized)) {
    kind = "EXPENSE";
    category = "MARKETING";
  }
  const warnings: string[] = [];
  if (!fields.amount)
    warnings.push(
      "No encontramos un total seguro. Escríbelo antes de guardar.",
    );
  if (!fields.date)
    warnings.push(
      "No encontramos la fecha. Confirma cuándo hiciste la compra.",
    );
  if (equipment && supplies)
    warnings.push(
      "Hay equipos e insumos mezclados. Revisa si necesitas separarlos en dos movimientos.",
    );
  if (summary.amountConflict)
    warnings.push(
      "Hay más de un total distinto. Revisa el total final del documento.",
    );
  if (summary.dateConflict)
    warnings.push("Hay fechas de emisión distintas. Confirma la correcta.");
  if (!kind)
    warnings.push("Elige si fue una compra de insumos, un gasto o un equipo.");
  return {
    ...fields,
    vat: summary.vat,
    net: summary.net,
    folio,
    rut,
    documentType: /factura/i.test(text)
      ? "INVOICE"
      : /boleta/i.test(text)
        ? "RECEIPT"
        : undefined,
    kind,
    category,
    items,
    description: items.length
      ? items
          .map((i) => i.name)
          .join(" · ")
          .slice(0, 200)
      : undefined,
    warnings,
  };
}
export const aiReceiptSchema = z.object({
  amount: z.number().positive().max(20000000).nullable(),
  date: z.string().nullable(),
  description: z.string().max(200).nullable(),
  kind: z.enum(["SUPPLIES", "EXPENSE", "ASSET"]).nullable(),
  category: z
    .enum(["RENT", "UTILITIES", "TOOLS", "MARKETING", "OTHER"])
    .nullable(),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        quantity: z.number().positive().max(100000).nullable(),
        amount: z.number().nonnegative().max(20000000).nullable(),
      }),
    )
    .max(20),
  warnings: z.array(z.string().max(160)).max(5),
});
export function validateAIReceipt(
  value: unknown,
  currency: string,
): ReceiptExpense {
  const v = aiReceiptSchema.parse(value);
  if (
    v.date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) ||
      !Number.isFinite(new Date(v.date + "T12:00:00Z").getTime()) ||
      new Date(v.date + "T12:00:00Z").toISOString().slice(0, 10) !== v.date)
  )
    throw Error("Fecha inválida");
  if (currency === "CLP" && v.amount !== null && !Number.isInteger(v.amount))
    throw Error("Monto CLP inválido");
  return {
    amount: v.amount ?? undefined,
    date: v.date ?? undefined,
    description: v.description ?? undefined,
    kind: v.kind ?? undefined,
    category: v.category ?? undefined,
    items: v.items,
    warnings: [
      ...v.warnings,
      ...(v.amount === null
        ? ["Confirma el monto total antes de guardar."]
        : []),
      ...(v.date === null ? ["Confirma la fecha de la compra."] : []),
    ],
  };
}

export function combineReceiptReads(
  reads: { fields: ReceiptExpense; confidence: number }[],
): ReceiptExpense {
  if (!reads.length) throw Error("No hay lecturas del documento");
  const sorted = [...reads].sort((a, b) => b.confidence - a.confidence);
  const best = [...sorted].sort(
    (a, b) => b.fields.items.length - a.fields.items.length,
  )[0].fields;
  const warnings = [...new Set(reads.flatMap((r) => r.fields.warnings))];
  function choose<T>(
    values: { value: T | undefined; confidence: number }[],
    label: string,
  ): T | undefined {
    const options = new Map<T, { count: number; confidence: number }>();
    for (const v of values)
      if (v.value !== undefined) {
        const current = options.get(v.value);
        options.set(v.value, {
          count: (current?.count ?? 0) + 1,
          confidence: Math.max(current?.confidence ?? 0, v.confidence),
        });
      }
    const ranked = [...options].sort(
      (a, b) => b[1].count - a[1].count || b[1].confidence - a[1].confidence,
    );
    if (ranked.length > 1)
      warnings.push(
        `Las lecturas muestran ${label} distintos. Dejamos el valor mejor respaldado; puedes corregirlo.`,
      );
    return ranked[0]?.[0];
  }
  const amount = choose(
    reads.map((r) => ({ value: r.fields.amount, confidence: r.confidence })),
    "totales",
  );
  const date = choose(
    reads.map((r) => ({ value: r.fields.date, confidence: r.confidence })),
    "fechas",
  );
  return {
    ...best,
    amount,
    date,
    vat: sorted.find((r) => r.fields.vat !== undefined)?.fields.vat,
    net: sorted.find((r) => r.fields.net !== undefined)?.fields.net,
    folio: sorted.find((r) => r.fields.folio)?.fields.folio,
    rut: sorted.find((r) => r.fields.rut)?.fields.rut,
    documentType: sorted.find((r) => r.fields.documentType)?.fields
      .documentType,
    kind: warnings.some((w) => w.includes("mezclados"))
      ? undefined
      : sorted.find((r) => r.fields.kind)?.fields.kind,
    category: sorted.find((r) => r.fields.category)?.fields.category,
    warnings: [...new Set(warnings)].filter(
      (w) =>
        !(amount !== undefined && /No encontramos un total seguro/.test(w)) &&
        !(date && /No encontramos la fecha/.test(w)),
    ),
  };
}
