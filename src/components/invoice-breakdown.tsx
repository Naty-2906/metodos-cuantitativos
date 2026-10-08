"use client";
import { invoiceFromTotal, invoiceFromNet } from "@/lib/invoice";
export default function InvoiceBreakdown({
  amount,
  vat,
  onAmount,
  onVat,
  automatic,
  onAutomatic,
  required = false,
  exempt = false,
}: {
  amount: string;
  vat: string;
  onAmount: (value: string) => void;
  onVat: (value: string) => void;
  automatic: boolean;
  onAutomatic: (value: boolean) => void;
  required?: boolean;
  exempt?: boolean;
}) {
  const total = Number(amount),
    tax = Number(vat),
    validTotal =
      amount !== "" &&
      Number.isSafeInteger(total) &&
      total >= 0 &&
      total <= 20000000;
  const applyTotal = () => {
    if (!validTotal) return;
    const split = exempt
      ? { net: total, vat: 0, total }
      : invoiceFromTotal(total);
    onVat(String(split.vat));
    onAutomatic(true);
  };
  return (
    <div className="space-y-3">
      <h4 className="font-semibold">Neto, IVA y total</h4>
      <p className="muted text-xs">
        El total incluye IVA. Para ingresar un precio sin IVA, escribe el neto;
        se calcula el IVA al 19% y el total. Los valores leídos del documento se
        conservan hasta que los cambies.
      </p>
      <div className="grid sm:grid-cols-3 gap-3">
        <label>
          Monto neto sin IVA (CLP)
          <input
            type="number"
            min="0"
            max="16806722"
            step="1"
            value={validTotal && vat !== "" ? String(total - tax) : ""}
            onChange={(e) => {
              if (e.target.value === "") return;
              const n = Number(e.target.value);
              if (!Number.isSafeInteger(n) || n < 0 || n > 16806722) return;
              const split = exempt
                ? { net: n, vat: 0, total: n }
                : invoiceFromNet(n);
              onAmount(String(split.total));
              onVat(String(split.vat));
              onAutomatic(true);
            }}
          />
        </label>
        <label>
          IVA del documento (opcional, CLP)
          <input
            type="number"
            min="0"
            step="1"
            max={validTotal ? Math.max(0, total - 1) : 20000000}
            required={required}
            value={vat}
            onChange={(e) => {
              onVat(e.target.value);
              onAutomatic(false);
            }}
          />
        </label>
        <label>
          Total con IVA incluido (CLP)
          <input
            id="operation-amount"
            type="number"
            min="1"
            max="20000000"
            step="1"
            required
            value={amount}
            onChange={(e) => {
              onAmount(e.target.value);
              if (
                automatic &&
                e.target.value !== "" &&
                Number.isSafeInteger(Number(e.target.value)) &&
                Number(e.target.value) >= 0 &&
                Number(e.target.value) <= 20000000
              )
                onVat(
                  String(
                    exempt ? 0 : invoiceFromTotal(Number(e.target.value)).vat,
                  ),
                );
            }}
          />
        </label>
      </div>
      <button
        type="button"
        className="accounting-tab"
        disabled={!validTotal}
        onClick={applyTotal}
      >
        {exempt
          ? "Documento exento: IVA $0"
          : "Calcular IVA incluido al 19% desde el total"}
      </button>
      {automatic && (
        <p className="muted text-xs">
          Cálculo {exempt ? "exento" : "al 19%"}. Si el documento informa otro
          desglose, puedes editarlo.
        </p>
      )}
      {vat !== "" && validTotal && tax >= total && total > 0 && (
        <p role="alert" className="text-red-700 text-sm">
          El IVA no puede superar el total. Revisa el monto leído.
        </p>
      )}
      <p className="muted text-xs">
        Deja el IVA vacío si solo quieres contar el gasto y el documento no lo
        informa. Se guardará el total sin crédito fiscal.
      </p>
    </div>
  );
}
