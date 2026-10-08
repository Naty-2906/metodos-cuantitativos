import { test } from "node:test";
import assert from "node:assert/strict";
import { financeCSV } from "../src/lib/finance-csv";
test("CSV escapes descriptions and neutralizes spreadsheet formulas while preserving numeric signs", () => {
  const csv = financeCSV([
    ["=1+1", "  @SUM(A1)", 'Detalle; con "comillas"', -5000, 12.5],
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'  @SUM(A1)"'));
  assert.ok(csv.includes('"Detalle; con ""comillas"""'));
  assert.ok(csv.includes('"-5000"'));
  assert.ok(csv.includes('"12,5"'));
});
