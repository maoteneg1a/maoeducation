-- Solo estructuras nuevas; no se activan programas ni se convierten notas existentes.
-- CreateTable
CREATE TABLE "preparatory_programs" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "parallel_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "catalog_version" TEXT NOT NULL,
    "catalog" JSONB NOT NULL,
    "scale_version" TEXT NOT NULL DEFAULT '2026-00082A',
    "ambit_teachers" JSONB NOT NULL DEFAULT '{}',
    "selections" JSONB NOT NULL DEFAULT '{}',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preparatory_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preparatory_values" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "code" VARCHAR(10),
    "notes" TEXT NOT NULL DEFAULT '',
    "recorded_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preparatory_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preparatory_comments" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "recorded_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preparatory_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "preparatory_programs_parallel_id_key" ON "preparatory_programs"("parallel_id");

-- CreateIndex
CREATE INDEX "preparatory_programs_institution_id_academic_year_id_idx" ON "preparatory_programs"("institution_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "preparatory_values_institution_id_student_id_idx" ON "preparatory_values"("institution_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "preparatory_values_program_id_student_id_period_id_item_key_key" ON "preparatory_values"("program_id", "student_id", "period_id", "item_key");

-- CreateIndex
CREATE UNIQUE INDEX "preparatory_comments_program_id_student_id_period_id_key" ON "preparatory_comments"("program_id", "student_id", "period_id");

-- AddForeignKey
ALTER TABLE "preparatory_programs" ADD CONSTRAINT "preparatory_programs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparatory_programs" ADD CONSTRAINT "preparatory_programs_parallel_id_fkey" FOREIGN KEY ("parallel_id") REFERENCES "parallels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparatory_programs" ADD CONSTRAINT "preparatory_programs_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparatory_values" ADD CONSTRAINT "preparatory_values_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparatory_values" ADD CONSTRAINT "preparatory_values_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparatory_values" ADD CONSTRAINT "preparatory_values_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "preparatory_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparatory_comments" ADD CONSTRAINT "preparatory_comments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparatory_comments" ADD CONSTRAINT "preparatory_comments_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparatory_comments" ADD CONSTRAINT "preparatory_comments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "preparatory_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
