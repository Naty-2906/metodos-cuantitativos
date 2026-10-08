// All values here are CLP whole pesos. Journal storage converts to cents only at the API boundary.
export function invoiceFromTotal(total: number) {
  if (!Number.isSafeInteger(total) || total < 0 || total > 20000000)
    throw Error("Monto inválido");
  const net = Math.round(total / 1.19);
  return { net, vat: total - net, total };
}
export function invoiceFromNet(net: number) {
  if (!Number.isSafeInteger(net) || net < 0 || net > 20000000)
    throw Error("Monto inválido");
  const vat = Math.round((net * 19) / 100),
    total = net + vat;
  if (total > 20000000) throw Error("Monto inválido");
  return { net, vat, total };
}
