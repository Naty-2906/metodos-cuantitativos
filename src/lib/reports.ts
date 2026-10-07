import { formatInTimeZone } from "date-fns-tz";
import { financialTotals, type JournalView } from "./accounting";
export function isVoided(
  e: Pick<JournalView, "id">,
  entries: Pick<JournalView, "sourceKey">[],
) {
  return entries.some((x) => x.sourceKey === "reversal:" + e.id);
}
export function report(
  entries: JournalView[],
  month: string,
  zone: string,
  currency: string,
) {
  const all = entries.filter((e) => e.currency === currency);
  const period = all.filter(
    (e) => formatInTimeZone(e.date, zone, "yyyy-MM") === month,
  );
  const through = all.filter(
    (e) => formatInTimeZone(e.date, zone, "yyyy-MM") <= month,
  );
  const sums = new Map<string, { debit: number; credit: number }>();
  for (const e of through)
    for (const l of e.lines) {
      const v = sums.get(l.account) ?? { debit: 0, credit: 0 };
      v.debit += l.debit;
      v.credit += l.credit;
      sums.set(l.account, v);
    }
  const active = period.filter(
    (e) => !e.sourceKey.startsWith("reversal:") && !isVoided(e, all),
  );
  const funds = active
    .flatMap((e) => e.lines)
    .filter((l) => ["CASH", "BANK", "LEGACY_FUNDS"].includes(l.account));
  const cashIn = funds.reduce((n, l) => n + l.debit, 0),
    cashOut = funds.reduce((n, l) => n + l.credit, 0);
  const documents = active.filter((e) => e.document);
  const purchases = documents.filter((e) =>
    ["SUPPLIES", "EXPENSE", "ASSET"].includes(e.kind),
  );
  const vatOutput = period
    .flatMap((e) => e.lines)
    .filter((l) => l.account === "VAT_OUTPUT")
    .reduce((s, l) => s + l.credit - l.debit, 0);
  const vatInput = period
    .flatMap((e) => e.lines)
    .filter((l) => l.account === "VAT_INPUT")
    .reduce((s, l) => s + l.debit - l.credit, 0);
  const missing = active.filter(
    (e) =>
      ["SALE_SERVICE", "SALE_PRODUCT", "SUPPLIES", "EXPENSE", "ASSET"].includes(
        e.kind,
      ) &&
      (!e.document || e.document.type === "SUPPORT"),
  ).length;
  const paidPurchaseVat = all
    .filter(
      (e) =>
        ["SUPPLIES", "EXPENSE", "ASSET"].includes(e.kind) &&
        e.document &&
        !isVoided(e, all),
    )
    .filter(
      (e) =>
        formatInTimeZone(
          e.pendingAccount ? (e.settledAt ?? "9999-01-01T00:00:00Z") : e.date,
          zone,
          "yyyy-MM",
        ) === month,
    )
    .reduce((s, e) => s + (e.document?.vat ?? 0), 0);
  const balanceOf = (accounts: string[]) =>
    accounts.reduce(
      (n, a) => n + (sums.get(a)?.debit ?? 0) - (sums.get(a)?.credit ?? 0),
      0,
    );
  const cumulative = financialTotals(through);
  const assets = balanceOf([
    "CASH",
    "BANK",
    "LEGACY_FUNDS",
    "RECEIVABLE",
    "EQUIPMENT",
    "VAT_INPUT",
  ]);
  const liabilities = -balanceOf(["PAYABLE", "LOAN", "VAT_OUTPUT"]);
  const equity =
    -balanceOf(["OWNER_CAPITAL", "OWNER_DRAWINGS"]) + cumulative.profit;
  const resultAccounts = new Map<string, number>();
  for (const e of period)
    for (const l of e.lines)
      if (l.account.startsWith("REVENUE_") || l.account.startsWith("EXPENSE_"))
        resultAccounts.set(
          l.account,
          (resultAccounts.get(l.account) ?? 0) +
            (l.account.startsWith("REVENUE_")
              ? l.credit - l.debit
              : l.debit - l.credit),
        );
  return {
    cashIn,
    cashOut,
    assets,
    liabilities,
    equity,
    balanceDifference: assets - liabilities - equity,
    resultAccounts: [...resultAccounts].map(([account, amount]) => ({
      account,
      amount,
    })),
    period,
    totals: financialTotals(period),
    cumulative: financialTotals(through),
    balances: [...sums].map(([account, v]) => ({
      account,
      ...v,
      balance: v.debit - v.credit,
    })),
    vatOutput,
    vatInput,
    vatDifference: vatOutput - vatInput,
    purchaseVat: purchases.reduce((s, e) => s + (e.document?.vat ?? 0), 0),
    paidPurchaseVat,
    missing,
  };
}
export function validRut(value: string) {
  const normalized = value.replace(/[.\s]/g, "").toUpperCase();
  if (!/^\d{7,8}-[\dK]$/.test(normalized)) return false;
  const [body, check] = normalized.split("-");
  if (Number(body) === 0) return false;
  let sum = 0,
    m = 2;
  for (const c of [...body].reverse()) {
    sum += Number(c) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const n = 11 - (sum % 11);
  return check === (n === 11 ? "0" : n === 10 ? "K" : String(n));
}
