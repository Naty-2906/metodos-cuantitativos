import { z } from "zod";
export const accountNames = {
  VAT_INPUT: "IVA crédito fiscal registrado",
  VAT_OUTPUT: "IVA débito fiscal registrado",
  LEGACY_FUNDS: "Pago histórico sin medio registrado",
  CASH: "Caja / efectivo",
  BANK: "Banco / transferencias",
  RECEIVABLE: "Clientes por cobrar",
  PAYABLE: "Proveedores por pagar",
  EQUIPMENT: "Máquinas y muebles",
  OWNER_CAPITAL: "Aportes del dueño",
  OWNER_DRAWINGS: "Retiros del dueño",
  LOAN: "Préstamos por pagar",
  REVENUE_SERVICE: "Ingresos por servicios",
  REVENUE_PRODUCT: "Ingresos por productos",
  EXPENSE_SUPPLIES: "Insumos consumidos",
  EXPENSE_OPERATING: "Gastos de funcionamiento",
  EXPENSE_INTEREST: "Intereses de préstamos",
} as const;
export type Account = keyof typeof accountNames;
export type EntryLine = { account: Account; debit: number; credit: number };
const amount = z.number().int().positive().max(2000000000);
export const operationSchema = z
  .object({
    requestId: z.string().uuid(),
    kind: z.enum([
      "SALE_SERVICE",
      "SALE_PRODUCT",
      "SUPPLIES",
      "EXPENSE",
      "ASSET",
      "OWNER_CONTRIBUTION",
      "OWNER_WITHDRAWAL",
      "LOAN",
      "DEBT_PAYMENT",
    ]),
    amount,
    date: z.string().datetime(),
    description: z.string().trim().max(200).default(""),
    state: z.enum(["PAID", "PENDING"]),
    method: z.enum(["CASH", "TRANSFER"]),
    category: z
      .enum(["RENT", "UTILITIES", "TOOLS", "MARKETING", "OTHER"])
      .optional(),
    interest: z.number().int().min(0).max(2000000000).default(0),
  })
  .superRefine((value, ctx) => {
    if (
      value.state === "PENDING" &&
      ![
        "SALE_SERVICE",
        "SALE_PRODUCT",
        "SUPPLIES",
        "EXPENSE",
        "ASSET",
      ].includes(value.kind)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Esta operación necesita un pago realizado",
      });
    if (value.kind === "DEBT_PAYMENT" && value.interest >= value.amount)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El pago debe incluir una parte de capital",
      });
    if (value.kind !== "DEBT_PAYMENT" && value.interest !== 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Los intereses solo corresponden al pago de préstamos",
      });
  });
export type Operation = z.infer<typeof operationSchema>;
export const kindNames: Record<Operation["kind"] | "SETTLEMENT", string> = {
  SALE_SERVICE: "Cobro de servicio",
  SALE_PRODUCT: "Venta de producto",
  SUPPLIES: "Compra de insumos",
  EXPENSE: "Gasto del negocio",
  ASSET: "Compra de máquina o mueble",
  OWNER_CONTRIBUTION: "Aporte del dueño",
  OWNER_WITHDRAWAL: "Retiro del dueño",
  LOAN: "Préstamo recibido",
  DEBT_PAYMENT: "Pago de préstamo",
  SETTLEMENT: "Pago o cobro de pendiente",
};
const debit = (account: Account, n: number): EntryLine => ({
  account,
  debit: n,
  credit: 0,
});
const credit = (account: Account, n: number): EntryLine => ({
  account,
  debit: 0,
  credit: n,
});
export function checkBalanced(lines: EntryLine[]) {
  if (
    lines.length < 2 ||
    lines.some(
      (l) =>
        !Object.hasOwn(accountNames, l.account) ||
        !Number.isSafeInteger(l.debit) ||
        !Number.isSafeInteger(l.credit) ||
        l.debit < 0 ||
        l.credit < 0 ||
        l.debit > 0 === l.credit > 0,
    )
  )
    throw Error("Asiento inválido");
  const d = lines.reduce((n, l) => n + l.debit, 0),
    c = lines.reduce((n, l) => n + l.credit, 0);
  if (d !== c || d === 0) throw Error("El asiento no está balanceado");
  return lines;
}
export function buildEntry(input: Operation) {
  const value = operationSchema.parse(input),
    cash: Account = value.method === "CASH" ? "CASH" : "BANK",
    n = value.amount;
  let lines: EntryLine[] = [],
    pendingAccount: Account | null = null;
  if (value.kind === "SALE_SERVICE" || value.kind === "SALE_PRODUCT") {
    pendingAccount = value.state === "PENDING" ? "RECEIVABLE" : null;
    lines = [
      debit(pendingAccount ?? cash, n),
      credit(
        value.kind === "SALE_SERVICE" ? "REVENUE_SERVICE" : "REVENUE_PRODUCT",
        n,
      ),
    ];
  } else if (["SUPPLIES", "EXPENSE", "ASSET"].includes(value.kind)) {
    pendingAccount = value.state === "PENDING" ? "PAYABLE" : null;
    const account: Account =
      value.kind === "SUPPLIES"
        ? "EXPENSE_SUPPLIES"
        : value.kind === "ASSET"
          ? "EQUIPMENT"
          : "EXPENSE_OPERATING";
    lines = [debit(account, n), credit(pendingAccount ?? cash, n)];
  } else if (value.kind === "OWNER_CONTRIBUTION")
    lines = [debit(cash, n), credit("OWNER_CAPITAL", n)];
  else if (value.kind === "OWNER_WITHDRAWAL")
    lines = [debit("OWNER_DRAWINGS", n), credit(cash, n)];
  else if (value.kind === "LOAN") lines = [debit(cash, n), credit("LOAN", n)];
  else if (value.kind === "DEBT_PAYMENT")
    lines = [
      debit("LOAN", n - value.interest),
      ...(value.interest ? [debit("EXPENSE_INTEREST", value.interest)] : []),
      credit(cash, n),
    ];
  return { lines: checkBalanced(lines), pendingAccount };
}
export function buildSettlement(
  pendingAccount: string,
  n: number,
  method: "CASH" | "TRANSFER",
) {
  const cash: Account = method === "CASH" ? "CASH" : "BANK";
  if (pendingAccount === "RECEIVABLE")
    return checkBalanced([debit(cash, n), credit("RECEIVABLE", n)]);
  if (pendingAccount === "PAYABLE")
    return checkBalanced([debit("PAYABLE", n), credit(cash, n)]);
  throw Error("La operación no tiene un saldo pendiente");
}
export type JournalView = {
  id: string;
  kind: string;
  sourceKey: string;
  description: string;
  amount: number;
  currency: string;
  method: string;
  date: string;
  category: string | null;
  pendingAccount: string | null;
  settledAt: string | null;
  parentId: string | null;
  document?: {
    type: string;
    folio: string;
    rut: string;
    vat: number;
    recoverable: boolean;
  };
  lines: { account: string; debit: number; credit: number }[];
};
export function financialTotals(entries: Pick<JournalView, "lines">[]) {
  const totals = {
    income: 0,
    expenses: 0,
    cash: 0,
    bank: 0,
    legacyFunds: 0,
    receivable: 0,
    payable: 0,
    loans: 0,
    equipment: 0,
  };
  for (const entry of entries)
    for (const l of entry.lines) {
      if (l.account.startsWith("REVENUE_")) totals.income += l.credit - l.debit;
      if (l.account.startsWith("EXPENSE_"))
        totals.expenses += l.debit - l.credit;
      if (l.account === "CASH") totals.cash += l.debit - l.credit;
      if (l.account === "BANK") totals.bank += l.debit - l.credit;
      if (l.account === "LEGACY_FUNDS")
        totals.legacyFunds += l.debit - l.credit;
      if (l.account === "RECEIVABLE") totals.receivable += l.debit - l.credit;
      if (l.account === "PAYABLE") totals.payable += l.credit - l.debit;
      if (l.account === "LOAN") totals.loans += l.credit - l.debit;
      if (l.account === "EQUIPMENT") totals.equipment += l.debit - l.credit;
    }
  return { ...totals, profit: totals.income - totals.expenses };
}
