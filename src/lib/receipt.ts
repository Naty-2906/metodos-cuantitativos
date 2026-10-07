export type ReceiptFields = { amount?: number; date?: string };
export function extractReceiptFields(
  text: string,
  currency: string,
): ReceiptFields {
  const result: ReceiptFields = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (
      !/^\s*(?:TOTAL(?:\s+A\s+PAGAR)?|MONTO\s+TOTAL|IMPORTE\s+TOTAL)\b/i.test(
        line,
      )
    )
      continue;
    const value = line
      .replace(
        /^\s*(?:TOTAL(?:\s+A\s+PAGAR)?|MONTO\s+TOTAL|IMPORTE\s+TOTAL)\s*[:$]?\s*/i,
        "",
      )
      .match(/\$?\s*([\d]+(?:[.,][\d]+)*)/);
    if (!value) continue;
    let raw = value[1];
    if (currency === "CLP") {
      if (!/^\d+$|^\d{1,3}(?:\.\d{3})+$/.test(raw)) continue;
      raw = raw.replaceAll(".", "");
    } else if (raw.includes(","))
      raw = raw.replaceAll(".", "").replace(",", ".");
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) raw = raw.replaceAll(".", "");
    const amount = Number(raw);
    if (amount > 0 && amount <= 20000000) {
      result.amount = amount;
      break;
    }
  }
  const line = lines.find(
    (l) => /fecha/i.test(l) && !/(vencimiento|pago)/i.test(l),
  );
  const match = (line ?? text).match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/);
  if (match) {
    const date = `${match[3]}-${match[2]}-${match[1]}`;
    const parsed = new Date(date + "T12:00:00Z");
    if (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
    )
      result.date = date;
  }
  return result;
}
