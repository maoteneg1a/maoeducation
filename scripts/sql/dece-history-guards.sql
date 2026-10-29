-- Prisma db push omite estas protecciones SQL del historial DECE.
BEGIN;
CREATE OR REPLACE FUNCTION dece_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DECE history is append-only';
END;
$$;
DROP TRIGGER IF EXISTS dece_audit_append_only ON "dece_audit_logs";
CREATE TRIGGER dece_audit_append_only BEFORE UPDATE OR DELETE ON "dece_audit_logs"
FOR EACH ROW EXECUTE FUNCTION dece_reject_history_mutation();
DROP TRIGGER IF EXISTS dece_audit_no_truncate ON "dece_audit_logs";
CREATE TRIGGER dece_audit_no_truncate BEFORE TRUNCATE ON "dece_audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION dece_reject_history_mutation();
DROP TRIGGER IF EXISTS dece_actions_append_only ON "dece_case_actions";
CREATE TRIGGER dece_actions_append_only BEFORE UPDATE OR DELETE ON "dece_case_actions"
FOR EACH ROW EXECUTE FUNCTION dece_reject_history_mutation();
DROP TRIGGER IF EXISTS dece_actions_no_truncate ON "dece_case_actions";
CREATE TRIGGER dece_actions_no_truncate BEFORE TRUNCATE ON "dece_case_actions"
FOR EACH STATEMENT EXECUTE FUNCTION dece_reject_history_mutation();

COMMIT;
