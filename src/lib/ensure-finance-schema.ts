import { Pool } from "pg";
import { financeSchemaSQL } from "./finance-schema-sql";
// Called only after authenticating the owner. Public booking never runs DDL.
export async function ensureFinanceSchema(
  connectionString = process.env.DATABASE_URL,
) {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 8000,
  });
  let client;
  try {
    client = await pool.connect();
    const ready = await client.query<{ ready: boolean }>(
      `SELECT to_regclass('public."JournalDocument"') IS NOT NULL AND to_regclass('public."JournalEntry"') IS NOT NULL AND to_regclass('public."JournalLine"') IS NOT NULL AS ready`,
    );
    if (ready.rows[0].ready) return true;
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '20s'");
    await client.query("SELECT pg_advisory_xact_lock(29062026)");
    // Recheck after the lock: another owner request may have applied it already.
    const locked = await client.query<{ ready: boolean }>(
      `SELECT to_regclass('public."JournalDocument"') IS NOT NULL AND to_regclass('public."JournalEntry"') IS NOT NULL AND to_regclass('public."JournalLine"') IS NOT NULL AS ready`,
    );
    if (!locked.rows[0].ready) await client.query(financeSchemaSQL);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    // Existing installations stay accessible if their DB role cannot create tables.
    console.error("Actualización contable no aplicada", {
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "unknown",
    });
    return false;
  } finally {
    client?.release();
    await pool.end();
  }
}
