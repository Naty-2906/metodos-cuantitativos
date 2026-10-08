export function financeCSV(rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    const raw =
      typeof value === "number"
        ? String(value).replace(".", ",")
        : /^[\s]*[=+@-]/.test(value)
          ? "'" + value
          : value;
    return '"' + raw.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
}
