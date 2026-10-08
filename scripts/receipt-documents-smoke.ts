import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
const origin = process.env.APP_ORIGIN!;
if (
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname) ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw Error("Solo pruebas locales");
let cookie = "";
const ids: string[] = [];
const post = (body: unknown) =>
  fetch(origin + "/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin, cookie },
    body: JSON.stringify(body),
  });
async function main() {
  const config = await db.businessConfig.findUniqueOrThrow({
    where: { id: 1 },
  });
  const original = await db.$queryRaw<
    { treatment: string; updatedAt: Date }[]
  >`SELECT "treatment","updatedAt" FROM "TaxProfile" WHERE id=1`;
  try {
    await db.businessConfig.update({
      where: { id: 1 },
      data: { currency: "CLP" },
    });
    const login = await post({
      action: "login",
      password: process.env.ADMIN_PASSWORD,
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await fetch(origin + "/api/admin", { headers: { cookie } })).status,
      200,
    );
    assert.equal(
      (
        await post({
          action: "tax_profile",
          treatment: "AFFECTED",
          confirmed: true,
        })
      ).status,
      200,
    );
    const saleId = randomUUID();
    ids.push(saleId);
    const operation = {
      requestId: saleId,
      kind: "SALE_SERVICE",
      amount: 1190000,
      date: new Date().toISOString(),
      description: "IVA smoke",
      state: "PAID",
      method: "CASH",
      interest: 0,
    };
    assert.equal((await post({ action: "operation", operation })).status, 200);
    const sale = await db.journalEntry.findUniqueOrThrow({
      where: { sourceKey: "manual:" + saleId },
      include: { lines: true },
    });
    assert.equal(
      sale.lines.find((l) => l.account === "VAT_OUTPUT")?.credit,
      190000,
    );
    assert.equal(
      (
        await post({
          action: "tax_profile",
          treatment: "EXEMPT",
          confirmed: true,
        })
      ).status,
      200,
    );
    assert.equal((await post({ action: "operation", operation })).status, 200);
    assert.equal(
      (
        await post({
          action: "document",
          document: {
            id: sale.id,
            type: "RECEIPT",
            folio: "tax-smoke-" + saleId,
            rut: "",
            vat: 190000,
            recoverable: false,
          },
        })
      ).status,
      200,
    );
    const lines = await db.journalLine.findMany({
      where: { entryId: sale.id },
    });
    assert.equal(
      lines.find((l) => l.account === "REVENUE_SERVICE")?.credit,
      1000000,
    );
    const requestId = randomUUID();
    ids.push(requestId);
    const body = {
      action: "receipt_operation",
      operation: {
        ...operation,
        requestId,
        kind: "SUPPLIES",
        state: "PENDING",
        date: "2026-10-07T15:00:00Z",
      },
      document: {
        type: "INVOICE",
        folio: requestId,
        rut: "76.123.456-0",
        vat: 190000,
        recoverable: true,
      },
    };
    assert.equal((await post(body)).status, 200);
    assert.equal((await post(body)).status, 200);
    const expense = await db.journalEntry.findUniqueOrThrow({
      where: { sourceKey: "manual:" + requestId },
      include: { lines: true, document: true },
    });
    assert.equal(
      expense.lines.find((l) => l.account === "VAT_INPUT")?.debit,
      190000,
    );
    assert.equal(
      expense.lines.find((l) => l.account === "EXPENSE_SUPPLIES")?.debit,
      1000000,
    );
    assert.equal(expense.pendingAccount, "PAYABLE");
    assert.equal(expense.document?.folio, requestId);
    assert.equal(
      (await post({ ...body, document: { ...body.document, vat: 180000 } }))
        .status,
      400,
    );
    const duplicate = randomUUID();
    ids.push(duplicate);
    assert.equal(
      (
        await post({
          ...body,
          operation: { ...body.operation, requestId: duplicate },
        })
      ).status,
      400,
    );
    assert.equal(
      await db.journalEntry.count({
        where: { sourceKey: "manual:" + duplicate },
      }),
      0,
    );
    const invalid = randomUUID();
    ids.push(invalid);
    assert.equal(
      (
        await post({
          ...body,
          operation: { ...body.operation, requestId: invalid },
          document: { ...body.document, rut: "invalid" },
        })
      ).status,
      400,
    );
    assert.equal(
      await db.journalEntry.count({
        where: { sourceKey: "manual:" + invalid },
      }),
      0,
    );
    for (const type of ["RECEIPT", "INVOICE", "INVOICE"]) {
      const simple = randomUUID();
      ids.push(simple);
      assert.equal(
        (
          await post({
            ...body,
            operation: { ...body.operation, requestId: simple, state: "PAID" },
            document: { type, folio: "", rut: "", vat: 0, recoverable: false },
          })
        ).status,
        200,
      );
      const saved = await db.journalEntry.findUniqueOrThrow({
        where: { sourceKey: "manual:" + simple },
        include: { document: true, lines: true },
      });
      assert.equal(saved.document?.folio, "");
      assert.equal(
        saved.lines.find((l) => l.account === "EXPENSE_SUPPLIES")?.debit,
        1190000,
      );
    }
    console.log(
      "IVA configurable, historial preservado, documento+gasto atómicos, reintentos y duplicados verificados.",
    );
  } finally {
    await db.journalEntry.deleteMany({
      where: { sourceKey: { in: ids.map((id) => "manual:" + id) } },
    });
    await db.businessConfig.update({
      where: { id: 1 },
      data: { currency: config.currency },
    });
    await db.$executeRaw`UPDATE "TaxProfile" SET treatment=${original[0].treatment},"updatedAt"=${original[0].updatedAt} WHERE id=1`;
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Falló la prueba local de documentos; no se muestran credenciales.",
  );
  process.exitCode = 1;
});
