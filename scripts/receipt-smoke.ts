import "dotenv/config";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { localReceiptExpense } from "../src/lib/receipt-expense";
const base = process.env.APP_ORIGIN!;
if (
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname) ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw Error("Solo pruebas locales");
let cookie = "";
const requestId = randomUUID();
async function post(path: string, body: unknown, auth = true) {
  return fetch(base + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: base,
      ...(auth ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function main() {
  try {
    assert.equal((await fetch(base + "/api/admin/receipt")).status, 401);
    assert.equal(
      (
        await post(
          "/api/admin/receipt",
          { text: "TOTAL 11900", currency: "CLP" },
          false,
        )
      ).status,
      401,
    );
    const login = await post(
      "/api/admin",
      { action: "login", password: process.env.ADMIN_PASSWORD },
      false,
    );
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    const settings = await fetch(base + "/api/admin/receipt", {
      headers: { cookie },
    });
    assert.equal(settings.status, 200);
    assert.equal(
      (await settings.json()).available,
      !!process.env.OPENAI_API_KEY,
    );
    if (!process.env.OPENAI_API_KEY)
      assert.equal(
        (
          await post("/api/admin/receipt", {
            text: "TOTAL 11900",
            currency: "CLP",
          })
        ).status,
        503,
      );
    const fields = localReceiptExpense(
      "Fecha 07/10/2026\nCuchillas 2 10000\nTOTAL 11.900",
      "CLP",
    );
    assert.equal(fields.kind, "SUPPLIES");
    assert.equal(fields.amount, 11900);
    const body = {
      action: "operation",
      operation: {
        requestId,
        kind: fields.kind,
        amount: fields.amount! * 100,
        date: "2026-10-07T15:00:00Z",
        description: fields.description,
        state: "PAID",
        method: "CASH",
        interest: 0,
      },
    };
    assert.equal((await post("/api/admin", body)).status, 200);
    assert.equal((await post("/api/admin", body)).status, 200);
    const entries = await db.journalEntry.findMany({
      where: { sourceKey: "manual:" + requestId },
      include: { lines: true },
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].amount, 1190000);
    assert.equal(
      entries[0].lines.find((l) => l.account === "EXPENSE_SUPPLIES")?.debit,
      1190000,
    );
    assert.match(entries[0].description, /Cuchillas/);
    console.log(
      "Boletas: acceso protegido, estado de IA, lectura de insumos y guardado único del costo verificados. Proveedor IA real no probado sin credencial.",
    );
  } finally {
    await db.journalEntry.deleteMany({
      where: { sourceKey: "manual:" + requestId },
    });
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
