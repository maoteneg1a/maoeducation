-- CreateTable
CREATE TABLE "dossier_files" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "course_assignment_id" TEXT,
    "scope_key" VARCHAR(60) NOT NULL,
    "item_key" VARCHAR(60) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "is_signed" BOOLEAN NOT NULL DEFAULT false,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "observation" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dossier_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_exceptions" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "course_assignment_id" TEXT,
    "scope_key" VARCHAR(60) NOT NULL,
    "item_key" VARCHAR(60) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dossier_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dossier_files_institution_id_student_id_academic_year_id_idx" ON "dossier_files"("institution_id", "student_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "dossier_files_institution_id_student_id_academic_year_id_it_key" ON "dossier_files"("institution_id", "student_id", "academic_year_id", "item_key", "scope_key", "sha256");

-- CreateIndex
CREATE INDEX "dossier_exceptions_institution_id_student_id_academic_year__idx" ON "dossier_exceptions"("institution_id", "student_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "dossier_exceptions_institution_id_student_id_academic_year__key" ON "dossier_exceptions"("institution_id", "student_id", "academic_year_id", "item_key", "scope_key");

-- AddForeignKey
ALTER TABLE "dossier_files" ADD CONSTRAINT "dossier_files_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_files" ADD CONSTRAINT "dossier_files_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_files" ADD CONSTRAINT "dossier_files_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_files" ADD CONSTRAINT "dossier_files_course_assignment_id_fkey" FOREIGN KEY ("course_assignment_id") REFERENCES "course_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_files" ADD CONSTRAINT "dossier_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_exceptions" ADD CONSTRAINT "dossier_exceptions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_exceptions" ADD CONSTRAINT "dossier_exceptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_exceptions" ADD CONSTRAINT "dossier_exceptions_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_exceptions" ADD CONSTRAINT "dossier_exceptions_course_assignment_id_fkey" FOREIGN KEY ("course_assignment_id") REFERENCES "course_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_exceptions" ADD CONSTRAINT "dossier_exceptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
