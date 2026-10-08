export type ReceiptFields = { amount?: number; date?: string };
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/T0TAL/g, "TOTAL");
export function receiptMoney(value: string, currency: string) {
  let raw = value.replace(/[$\s]/g, "").trim();
  if (currency === "CLP") {
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) raw = raw.replace(/[.,]/g, "");
    else if (/^\d+(?:[.,]0{1,2})?$/.test(raw))
      raw = raw.replace(/[.,]0{1,2}$/, "");
    else if (/^\d{1,3}(?:\.\d{3})+,00$/.test(raw))
      raw = raw.replace(/,00$/, "").replace(/\./g, "");
    else return undefined;
  } else if (raw.includes(",")) raw = raw.replaceAll(".", "").replace(",", ".");
  const n = Number(raw);
  return n > 0 && n <= 20000000 ? n : undefined;
}
export function receiptDate(value: string) {
  const s = normalize(value);
  let year: number, month: number, day: number;
  const iso = s.match(/\b(20\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})\b/);
  const latin = s.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b/);
  const words = s.match(
    /\b(\d{1,2})\s*(?:DE\s+|[-/])?(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE|ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s*(?:DE\s+|[-/])?(20\d{2})\b/,
  );
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (latin) {
    day = Number(latin[1]);
    month = Number(latin[2]);
    year = Number(latin[3]);
    if (year < 100) year += 2000;
  } else if (words) {
    day = Number(words[1]);
    year = Number(words[3]);
    month =
      [
        "ENE",
        "FEB",
        "MAR",
        "ABR",
        "MAY",
        "JUN",
        "JUL",
        "AGO",
        "SEP",
        "OCT",
        "NOV",
        "DIC",
      ].indexOf(words[2].slice(0, 3)) + 1;
  } else return undefined;
  if (year < 2000 || year > 2100) return undefined;
  const result = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(result + "T12:00:00Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === result
    ? result
    : undefined;
}
function numericCandidates(s: string, currency: string) {
  return [...s.matchAll(/\$?\s*\d+(?:[.,]\d+)*(?:\s\d{3})*/g)]
    .map((m) => receiptMoney(m[0], currency))
    .filter((v): v is number => v !== undefined);
}
export function receiptSummary(text: string, currency: string) {
  const lines = text
    .split(/\r?\n/)
    .map(normalize)
    .filter((line) => line.trim());
  const totals: { n: number; score: number }[] = [];
  let vat: number | undefined, net: number | undefined;
  const emission: { date: string; score: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const joined = line + " " + (lines[i + 1] ?? "");
    const unrelated = /VENCIMIENTO|VENCE|RESOLUCION|FECHA\s+(?:DE\s+)?PAGO/;
    if (
      !unrelated.test(line) &&
      !(
        !/FECHA|EMISION|EMITIDA/.test(line) &&
        unrelated.test(lines[i - 1] ?? "")
      )
    ) {
      const date =
        receiptDate(line) ||
        (/FECHA|EMISION|EMITIDA/.test(line) ? receiptDate(joined) : undefined);
      if (date)
        emission.push({
          date,
          score: /EMISION|EMITIDA/.test(line) ? 10 : /FECHA/.test(line) ? 5 : 1,
        });
    }
    const excluded =
      /SUB\s*TOTAL|TOTAL\s+(?:NETO|EXENTO|IVA|EFECTIVO|TARJETA|DESCUENTO|ARTICULOS|ITEMS)|VUELTO|CAMBIO|EFECTIVO|MONTO\s+PAGADO/.test(
        line,
      );
    const label = line.match(
      /\b(?:MONTO\s+TOTAL|IMPORTE\s+TOTAL|TOTAL(?:\s+(?:A\s+PAGAR|FINAL|DOCUMENTO|VENTA|CLP))?|MONTO\s+A\s+PAGAR)\b/,
    );
    if (label && !excluded) {
      const rest = line.slice((label.index ?? 0) + label[0].length);
      let candidates = numericCandidates(rest, currency);
      if (!candidates.length)
        for (let j = 1; j <= 2; j++) {
          const next = lines[i + j] ?? "";
          if (
            !/^\s*(?:\$|CLP|\d)/.test(next) ||
            /[A-Z]/.test(next.replace(/CLP/g, ""))
          )
            break;
          candidates = numericCandidates(next, currency);
          if (candidates.length) break;
        }
      if (candidates.length === 1)
        totals.push({
          n: candidates[0],
          score: /MONTO\s+TOTAL|A\s+PAGAR|TOTAL\s+FINAL|TOTAL\s+DOCUMENTO/.test(
            label[0],
          )
            ? 10
            : 5,
        });
    }
    if (/^\s*(?:MONTO\s+)?NETO\b/.test(line))
      net = numericCandidates(
        line.replace(/^\s*(?:MONTO\s+)?NETO\b/, ""),
        currency,
      ).at(-1);
    if (/^\s*(?:MONTO\s+)?I\.?V\.?A\.?\b/.test(line))
      vat = numericCandidates(
        line
          .replace(/19\s*%/g, "")
          .replace(/^\s*(?:MONTO\s+)?I\.?V\.?A\.?\b/, ""),
        currency,
      ).at(-1);
  }
  const max = Math.max(...totals.map((c) => c.score));
  const top = [
    ...new Set(totals.filter((c) => c.score === max).map((c) => c.n)),
  ];
  const datescore = Math.max(...emission.map((c) => c.score));
  const dates = [
    ...new Set(
      emission.filter((c) => c.score === datescore).map((c) => c.date),
    ),
  ];
  return {
    amount: top.length === 1 ? top[0] : undefined,
    date: dates.length === 1 ? dates[0] : undefined,
    vat,
    net,
    amountConflict: top.length > 1,
    dateConflict: dates.length > 1,
  };
}
export function extractReceiptFields(
  text: string,
  currency: string,
): ReceiptFields {
  const r = receiptSummary(text, currency);
  return {
    ...(r.amount !== undefined ? { amount: r.amount } : {}),
    ...(r.date ? { date: r.date } : {}),
  };
}
