BEGIN;

-- Preserve existing records. Refuse the change if a report was encrypted after
-- the initial count; a separate decryption migration is required in that case.
LOCK TABLE "dece_cases", "dece_case_actions" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "dece_cases" WHERE "encrypted_report" LIKE 'v1.%')
     OR EXISTS (SELECT 1 FROM "dece_case_actions" WHERE "encrypted_content" LIKE 'v1.%') THEN
    RAISE EXCEPTION 'Existen registros DECE cifrados. Conservar la clave anterior y convertirlos antes de aplicar esta migración.';
  END IF;
END $$;

ALTER TABLE "dece_cases" RENAME COLUMN "encrypted_report" TO "report_content";
ALTER TABLE "dece_cases" ALTER COLUMN "report_content" TYPE JSONB USING "report_content"::JSONB;
ALTER TABLE "dece_case_actions" RENAME COLUMN "encrypted_content" TO "content";
ALTER TABLE "dece_case_actions" ALTER COLUMN "content" TYPE JSONB USING "content"::JSONB;

COMMIT;
