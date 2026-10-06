CREATE TABLE "manual_insumo_averages" (
  "id" TEXT NOT NULL,
  "institution_id" TEXT NOT NULL,
  "insumo_id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "score" DECIMAL(5,2),
  "reason" TEXT,
  "recorded_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "manual_insumo_averages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "manual_insumo_averages_insumo_id_student_id_key" ON "manual_insumo_averages"("insumo_id", "student_id");
CREATE INDEX "manual_insumo_averages_institution_id_student_id_idx" ON "manual_insumo_averages"("institution_id", "student_id");
ALTER TABLE "manual_insumo_averages" ADD CONSTRAINT "manual_insumo_averages_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manual_insumo_averages" ADD CONSTRAINT "manual_insumo_averages_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manual_insumo_averages" ADD CONSTRAINT "manual_insumo_averages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manual_insumo_averages" ADD CONSTRAINT "manual_insumo_averages_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
