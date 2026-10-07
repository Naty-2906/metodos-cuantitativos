import "dotenv/config";
import { Pool } from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ensureFinanceSchema } from "../src/lib/ensure-finance-schema";
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw Error("Solo base local");
  const name = "barber_schema_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString: url.toString(), max: 1 });
  let test: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname = "/" + name;
    test = new Pool({ connectionString: url.toString(), max: 1 });
    await test.query(
      'CREATE TABLE "AgendaMarker" (id INTEGER PRIMARY KEY); INSERT INTO "AgendaMarker" VALUES (1)',
    );
    const results = await Promise.all([
      ensureFinanceSchema(url.toString()),
      ensureFinanceSchema(url.toString()),
    ]);
    assert.deepEqual(results, [true, true]);
    const tables = await test.query(
      `SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('JournalEntry','JournalLine','JournalDocument')`,
    );
    assert.equal(tables.rowCount, 3);
    assert.ok(tables.rows.every((r) => r.rowsecurity));
    const id = randomUUID();
    const client = await test.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        'INSERT INTO "JournalEntry" (id,"sourceKey",kind,description,amount,currency,date) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
        [
          id,
          "test:preserve",
          "SALE_SERVICE",
          "Dato conservado",
          1190000,
          "CLP",
        ],
      );
      for (const [account, debit, credit] of [
        ["CASH", 1190000, 0],
        ["REVENUE_SERVICE", 0, 1000000],
        ["VAT_OUTPUT", 0, 190000],
      ])
        await client.query(
          'INSERT INTO "JournalLine" (id,"entryId",account,debit,credit) VALUES ($1,$2,$3,$4,$5)',
          [randomUUID(), id, account, debit, credit],
        );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    await test.query('DROP TABLE "JournalDocument"');
    assert.equal(await ensureFinanceSchema(url.toString()), true);
    assert.equal(await ensureFinanceSchema(url.toString()), true);
    assert.equal(
      (await test.query('SELECT * FROM "AgendaMarker"')).rowCount,
      1,
    );
    assert.equal(
      (await test.query('SELECT * FROM "JournalEntry"')).rowCount,
      1,
    );
    assert.equal((await test.query('SELECT * FROM "JournalLine"')).rowCount, 3);
    console.log(
      "Actualización automática: base nueva, concurrencia, repetición y conservación de datos verificadas.",
    );
  } finally {
    await test?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
