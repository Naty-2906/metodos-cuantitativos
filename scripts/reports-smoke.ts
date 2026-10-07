import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "../src/lib/db";
import { formatInTimeZone } from "date-fns-tz";
const origin = process.env.APP_ORIGIN!;
if (
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname) ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw Error("Solo pruebas locales");
let cookie = "";
const keys: string[] = [];
async function post(body: unknown) {
  return fetch(origin + "/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin, cookie },
    body: JSON.stringify(body),
  });
}
async function operation(kind: string, state = "PAID") {
  const requestId = randomUUID();
  keys.push("manual:" + requestId);
  assert.equal(
    (
      await post({
        action: "operation",
        operation: {
          requestId,
          kind,
          amount: 1190000,
          date: new Date().toISOString(),
          description: "Report smoke",
          state,
          method: "CASH",
          interest: 0,
        },
      })
    ).status,
    200,
  );
  return (
    await db.journalEntry.findUniqueOrThrow({
      where: { sourceKey: "manual:" + requestId },
    })
  ).id;
}
async function main() {
  const originalConfig = await db.businessConfig.findUniqueOrThrow({
    where: { id: 1 },
  });
  await db.businessConfig.update({
    where: { id: 1 },
    data: { currency: "CLP" },
  });
  try {
    assert.equal(
      (await fetch(origin + "/api/admin/report?month=2026-10")).status,
      401,
    );
    const login = await post({
      action: "login",
      password: process.env.ADMIN_PASSWORD,
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    const sale = await operation("SALE_SERVICE");
    assert.equal(
      (
        await post({
          action: "document",
          document: {
            id: sale,
            type: "RECEIPT",
            folio: "SMOKE-1",
            rut: "",
            vat: 190000,
            recoverable: false,
          },
        })
      ).status,
      200,
    );
    const saleLines = await db.journalLine.findMany({
      where: { entryId: sale },
    });
    assert.equal(
      saleLines.find((l) => l.account === "REVENUE_SERVICE")?.credit,
      1000000,
    );
    assert.equal(
      saleLines.find((l) => l.account === "VAT_OUTPUT")?.credit,
      190000,
    );
    assert.equal(
      (
        await post({
          action: "document",
          document: {
            id: sale,
            type: "RECEIPT",
            folio: "SMOKE-2",
            rut: "",
            vat: 0,
            recoverable: false,
          },
        })
      ).status,
      400,
    );
    const purchase = await operation("SUPPLIES", "PENDING");
    assert.equal(
      (
        await post({
          action: "document",
          document: {
            id: purchase,
            type: "INVOICE",
            folio: "SMOKE-3",
            rut: "12345678-0",
            vat: 190000,
            recoverable: true,
          },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post({
          action: "document",
          document: {
            id: purchase,
            type: "INVOICE",
            folio: "SMOKE-3",
            rut: "12345678-5",
            vat: 190000,
            recoverable: true,
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post({
          action: "settle",
          id: purchase,
          date: new Date().toISOString(),
          method: "TRANSFER",
        })
      ).status,
      200,
    );
    const correction = await operation("SUPPLIES");
    const correctionDocument = {
      id: correction,
      type: "INVOICE",
      folio: "SMOKE-3",
      rut: "12.345.678-5",
      vat: 190000,
      recoverable: true,
    };
    assert.equal(
      (await post({ action: "document", document: correctionDocument })).status,
      400,
    );
    for (const id of [sale, purchase]) {
      assert.equal(
        (
          await post({
            action: "reverse",
            id,
            reason: "Monto incorrecto en prueba",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post({
            action: "reverse",
            id,
            reason: "Reintento de anulación",
          })
        ).status,
        200,
      );
      assert.equal(
        await db.journalEntry.count({ where: { sourceKey: "reversal:" + id } }),
        1,
      );
    }
    assert.equal(
      (
        await post({
          action: "settle",
          id: purchase,
          date: new Date().toISOString(),
          method: "CASH",
        })
      ).status,
      400,
    );
    const originals = await db.journalEntry.findMany({
      where: { OR: [{ id: { in: [sale, purchase] } }, { parentId: purchase }] },
      include: { lines: true },
    });
    for (const e of originals) {
      const reversal = await db.journalEntry.findUniqueOrThrow({
        where: { sourceKey: "reversal:" + e.id },
        include: { lines: true },
      });
      for (const l of e.lines) {
        const rev = reversal.lines.find((r) => r.account === l.account);
        assert.equal(rev?.credit, l.debit);
        assert.equal(rev?.debit, l.credit);
      }
    }
    assert.equal(
      (await post({ action: "document", document: correctionDocument })).status,
      200,
    );
    const config = await db.businessConfig.findUniqueOrThrow({
      where: { id: 1 },
    });
    const month = formatInTimeZone(new Date(), config.timezone, "yyyy-MM");
    const response = await fetch(origin + "/api/admin/report?month=" + month, {
      headers: { cookie },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type")!, /spreadsheetml/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(await response.arrayBuffer()) as never,
    );
    assert.equal(workbook.worksheets.length, 7);
    assert.ok(workbook.getWorksheet("Estado de resultados"));
    assert.ok(workbook.getWorksheet("Documentos")!.rowCount > 1);
    console.log(
      "Reportes: IVA, validación RUT, anulación con pago, reintentos y Excel verificados.",
    );
  } finally {
    const originals = await db.journalEntry.findMany({
      where: { sourceKey: { in: keys } },
      include: { settlement: true },
    });
    const ids = originals.flatMap((e) => [
      e.id,
      ...(e.settlement ? [e.settlement.id] : []),
    ]);
    await db.journalEntry.deleteMany({
      where: { sourceKey: { in: ids.map((id) => "reversal:" + id) } },
    });
    await db.journalEntry.deleteMany({ where: { parentId: { in: ids } } });
    await db.journalEntry.deleteMany({ where: { id: { in: ids } } });
    await db.businessConfig.update({
      where: { id: 1 },
      data: { currency: originalConfig.currency },
    });
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
