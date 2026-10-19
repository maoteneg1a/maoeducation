-- Auditoría: distinguir acciones de superadmin y suplantaciones.
ALTER TABLE "audit_logs"
  ADD COLUMN "platform_admin_id" TEXT,
  ADD COLUMN "impersonator_id" TEXT;

CREATE INDEX "audit_logs_institution_id_created_at_idx" ON "audit_logs"("institution_id", "created_at");
CREATE INDEX "audit_logs_platform_admin_id_created_at_idx" ON "audit_logs"("platform_admin_id", "created_at");
