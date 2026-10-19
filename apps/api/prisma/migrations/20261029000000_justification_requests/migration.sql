-- Justificaciones solicitadas por la familia: quedan pendientes hasta que el personal las revisa.
ALTER TABLE "absence_justifications"
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN "reviewed_by" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "review_notes" TEXT;

CREATE INDEX "absence_justifications_institution_id_status_idx" ON "absence_justifications"("institution_id", "status");
