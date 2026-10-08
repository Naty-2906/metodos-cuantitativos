BEGIN;
CREATE TABLE IF NOT EXISTS "JournalEntry" (
 "id" UUID NOT NULL PRIMARY KEY,
 "sourceKey" TEXT NOT NULL UNIQUE,
 "kind" TEXT NOT NULL,
 "description" TEXT NOT NULL,
 "amount" INTEGER NOT NULL CHECK ("amount" > 0),
 "currency" TEXT NOT NULL,
 "method" TEXT NOT NULL DEFAULT 'CASH',
 "date" TIMESTAMPTZ(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "category" TEXT,
 "pendingAccount" TEXT CHECK ("pendingAccount" IS NULL OR "pendingAccount" IN ('RECEIVABLE','PAYABLE')),
 "settledAt" TIMESTAMPTZ(3),
 "parentId" UUID UNIQUE REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "JournalLine" (
 "id" UUID NOT NULL PRIMARY KEY,
 "entryId" UUID NOT NULL REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "account" TEXT NOT NULL CHECK ("account" IN ('CASH','BANK','LEGACY_FUNDS','RECEIVABLE','PAYABLE','EQUIPMENT','OWNER_CAPITAL','OWNER_DRAWINGS','LOAN','REVENUE_SERVICE','REVENUE_PRODUCT','EXPENSE_SUPPLIES','EXPENSE_OPERATING','EXPENSE_INTEREST')),
 "debit" INTEGER NOT NULL DEFAULT 0,
 "credit" INTEGER NOT NULL DEFAULT 0,
 CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
);
CREATE INDEX IF NOT EXISTS "JournalEntry_date_idx" ON "JournalEntry"("date");
CREATE INDEX IF NOT EXISTS "JournalLine_entryId_idx" ON "JournalLine"("entryId");
CREATE INDEX IF NOT EXISTS "JournalLine_account_idx" ON "JournalLine"("account");
ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalLine" ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.check_barber_journal_balance() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE target UUID; expected BIGINT; debits BIGINT; credits BIGINT; line_count BIGINT;
BEGIN
 IF TG_TABLE_NAME = 'JournalEntry' THEN
  target := COALESCE(NEW."id", OLD."id");
 ELSE
  target := COALESCE(NEW."entryId", OLD."entryId");
 END IF;
 SELECT "amount" INTO expected FROM "JournalEntry" WHERE "id" = target;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT COALESCE(SUM("debit"),0), COALESCE(SUM("credit"),0), COUNT(*) INTO debits, credits, line_count FROM "JournalLine" WHERE "entryId" = target;
 IF line_count < 2 OR debits <> credits OR debits <> expected THEN
  RAISE EXCEPTION 'El asiento debe estar balanceado y coincidir con el monto' USING ERRCODE = '23514';
 END IF;
 RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS barber_journal_entry_balance ON "JournalEntry";
CREATE CONSTRAINT TRIGGER barber_journal_entry_balance AFTER INSERT OR UPDATE ON "JournalEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_barber_journal_balance();
DROP TRIGGER IF EXISTS barber_journal_line_balance ON "JournalLine";
CREATE CONSTRAINT TRIGGER barber_journal_line_balance AFTER INSERT OR UPDATE OR DELETE ON "JournalLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_barber_journal_balance();
COMMIT;
BEGIN;
ALTER TABLE "JournalLine" DROP CONSTRAINT IF EXISTS "JournalLine_account_check";
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_account_check" CHECK ("account" IN ('CASH','BANK','LEGACY_FUNDS','RECEIVABLE','PAYABLE','EQUIPMENT','OWNER_CAPITAL','OWNER_DRAWINGS','LOAN','REVENUE_SERVICE','REVENUE_PRODUCT','EXPENSE_SUPPLIES','EXPENSE_OPERATING','EXPENSE_INTEREST','VAT_INPUT','VAT_OUTPUT'));
CREATE TABLE IF NOT EXISTS "JournalDocument" (
 "entryId" UUID PRIMARY KEY REFERENCES "JournalEntry"("id") ON DELETE CASCADE,
 "type" TEXT NOT NULL CHECK ("type" IN ('INVOICE','RECEIPT','EXEMPT','HONORARIUM','SUPPORT')),
 "folio" TEXT NOT NULL, "rut" TEXT NOT NULL,
 "vat" INTEGER NOT NULL CHECK ("vat" >= 0),
 "recoverable" BOOLEAN NOT NULL DEFAULT FALSE,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK (NOT "recoverable" OR "type" = 'INVOICE'),
 CHECK ("type" NOT IN ('EXEMPT','HONORARIUM','SUPPORT') OR "vat" = 0)
);
ALTER TABLE "JournalDocument" ENABLE ROW LEVEL SECURITY;
COMMIT;
BEGIN;
CREATE TABLE IF NOT EXISTS "TaxProfile" (
 "id" INTEGER PRIMARY KEY CHECK ("id"=1),
 "treatment" TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK ("treatment" IN ('UNKNOWN','AFFECTED','EXEMPT')),
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO "TaxProfile" ("id") VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "ReceiptSubmission" (
 "requestId" UUID PRIMARY KEY,
 "entryId" UUID NOT NULL UNIQUE REFERENCES "JournalEntry"("id") ON DELETE CASCADE,
 "payload" JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "TaxProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReceiptSubmission" ENABLE ROW LEVEL SECURITY;
COMMIT;
