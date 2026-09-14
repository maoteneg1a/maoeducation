-- CreateTable
CREATE TABLE "interdisciplinary_projects" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "parallel_id" TEXT NOT NULL,
    "academic_period_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "situacion_reto" TEXT,
    "contexto" TEXT,
    "proposito_comun" TEXT,
    "producto_final" TEXT,
    "weeks_count" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'borrador',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interdisciplinary_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interdisciplinary_contributions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "course_assignment_id" TEXT NOT NULL,
    "contribucion" TEXT,
    "responsabilidad" TEXT,
    "skill_ids" TEXT[],
    "saber_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interdisciplinary_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interdisciplinary_week_entries" (
    "id" TEXT NOT NULL,
    "contribution_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "week_proposito" TEXT,
    "fase_inicio" TEXT,
    "fase_desarrollo" TEXT,
    "fase_cierre" TEXT,
    "proposito_pedagogico" TEXT,
    "evidencias" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interdisciplinary_week_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interdisciplinary_projects_parallel_id_academic_period_id_t_key" ON "interdisciplinary_projects"("parallel_id", "academic_period_id", "title");

-- CreateIndex
CREATE UNIQUE INDEX "interdisciplinary_contributions_project_id_course_assignmen_key" ON "interdisciplinary_contributions"("project_id", "course_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "interdisciplinary_week_entries_contribution_id_week_number_key" ON "interdisciplinary_week_entries"("contribution_id", "week_number");

-- AddForeignKey
ALTER TABLE "interdisciplinary_projects" ADD CONSTRAINT "interdisciplinary_projects_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interdisciplinary_projects" ADD CONSTRAINT "interdisciplinary_projects_parallel_id_fkey" FOREIGN KEY ("parallel_id") REFERENCES "parallels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interdisciplinary_projects" ADD CONSTRAINT "interdisciplinary_projects_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interdisciplinary_projects" ADD CONSTRAINT "interdisciplinary_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interdisciplinary_contributions" ADD CONSTRAINT "interdisciplinary_contributions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "interdisciplinary_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interdisciplinary_contributions" ADD CONSTRAINT "interdisciplinary_contributions_course_assignment_id_fkey" FOREIGN KEY ("course_assignment_id") REFERENCES "course_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interdisciplinary_week_entries" ADD CONSTRAINT "interdisciplinary_week_entries_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "interdisciplinary_contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

