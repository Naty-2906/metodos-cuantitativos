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
  const accountTotal = (account: string) => resultAccounts.get(account) ?? 0;
  const serviceIncome = accountTotal("REVENUE_SERVICE"),
    productIncome = accountTotal("REVENUE_PRODUCT");
  const suppliesCost = accountTotal("EXPENSE_SUPPLIES"),
    operatingExpenses = accountTotal("EXPENSE_OPERATING"),
    interestExpenses = accountTotal("EXPENSE_INTEREST");
  const netIncome = serviceIncome + productIncome,
    grossProfit = netIncome - suppliesCost,
    operatingProfit = grossProfit - operatingExpenses;
  const incomeStatement = [
    {
      label: "Ingresos por servicios",
      amount: serviceIncome,
      section: "income",
    },
    {
      label: "Ingresos por productos",
      amount: productIncome,
      section: "income",
    },
    {
      label: "Total de ingresos netos",
      amount: netIncome,
      section: "subtotal",
    },
    {
      label: "Costo de insumos consumidos",
      amount: -suppliesCost,
      section: "cost",
    },
    { label: "Resultado bruto", amount: grossProfit, section: "subtotal" },
    {
      label: "Gastos de funcionamiento",
      amount: -operatingExpenses,
      section: "expense",
    },
    {
      label: "Resultado operacional",
      amount: operatingProfit,
      section: "subtotal",
    },
    {
      label: "Intereses y gastos financieros registrados",
      amount: -interestExpenses,
      section: "finance",
    },
    {
      label: "Resultado antes de impuesto a la renta",
      amount: operatingProfit - interestExpenses,
      section: "result",
    },
  ];
  const balanceSheet = [
    { label: "Activos corrientes", section: "heading", amount: 0 },
    {
      label: "Caja / efectivo",
      section: "account",
      amount: balanceOf(["CASH"]),
    },
    { label: "Banco", section: "account", amount: balanceOf(["BANK"]) },
    {
      label: "Fondos históricos registrados",
      section: "account",
      amount: balanceOf(["LEGACY_FUNDS"]),
    },
    {
      label: "Cuentas por cobrar",
      section: "account",
      amount: balanceOf(["RECEIVABLE"]),
    },
    {
      label: "IVA crédito fiscal registrado",
      section: "account",
      amount: balanceOf(["VAT_INPUT"]),
    },
    {
      label: "Total activos corrientes",
      section: "subtotal",
      amount: balanceOf([
        "CASH",
        "BANK",
        "LEGACY_FUNDS",
        "RECEIVABLE",
        "VAT_INPUT",
      ]),
    },
    { label: "Activos no corrientes", section: "heading", amount: 0 },
    {
      label: "Equipos y muebles",
      section: "account",
      amount: balanceOf(["EQUIPMENT"]),
    },
    { label: "Total activos", section: "total", amount: assets },
    { label: "Pasivos", section: "heading", amount: 0 },
    {
      label: "Cuentas por pagar",
      section: "account",
      amount: -balanceOf(["PAYABLE"]),
    },
    {
      label: "Préstamos por pagar",
      section: "account",
      amount: -balanceOf(["LOAN"]),
    },
    {
      label: "IVA débito fiscal registrado",
      section: "account",
      amount: -balanceOf(["VAT_OUTPUT"]),
    },
    { label: "Total pasivos", section: "subtotal", amount: liabilities },
    { label: "Patrimonio", section: "heading", amount: 0 },
    {
      label: "Aportes del dueño",
      section: "account",
      amount: -balanceOf(["OWNER_CAPITAL"]),
    },
    {
      label: "Retiros del dueño",
      section: "account",
      amount: -balanceOf(["OWNER_DRAWINGS"]),
    },
    {
      label: "Ganancias o pérdidas acumuladas",
      section: "account",
      amount: cumulative.profit,
    },
    { label: "Total patrimonio", section: "subtotal", amount: equity },
    {
      label: "Total pasivos y patrimonio",
      section: "total",
      amount: liabilities + equity,
    },
  ];
  return {
    incomeStatement,
    balanceSheet,
    cashIn,
    cashOut,
    assets,
    liabilities,
    equity,
    balanceDifference: assets - liabilities - equity,
    resultAccounts: [...resultAccounts]
      .sort(
        (a, b) =>
          [
            "REVENUE_SERVICE",
            "REVENUE_PRODUCT",
            "EXPENSE_SUPPLIES",
            "EXPENSE_OPERATING",
            "EXPENSE_INTEREST",
          ].indexOf(a[0]) -
          [
            "REVENUE_SERVICE",
            "REVENUE_PRODUCT",
            "EXPENSE_SUPPLIES",
            "EXPENSE_OPERATING",
            "EXPENSE_INTEREST",
          ].indexOf(b[0]),
      )
      .map(([account, amount]) => ({
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
