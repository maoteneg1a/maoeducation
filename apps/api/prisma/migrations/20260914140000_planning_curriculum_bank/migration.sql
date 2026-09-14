-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "curriculum_skill_id" TEXT;

-- AlterTable
ALTER TABLE "levels" ADD COLUMN     "subnivel" VARCHAR(20);

-- AlterTable
ALTER TABLE "pedagogic_recoveries" ADD COLUMN     "curriculum_skill_id" TEXT,
ADD COLUMN     "source" VARCHAR(20) NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "student_enrollments" ADD COLUMN     "adaptation_notes" TEXT,
ADD COLUMN     "adaptation_type" VARCHAR(20),
ADD COLUMN     "has_adaptation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "curriculum_area_id" TEXT;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "curriculum_areas" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_criteria" (
    "id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "subnivel" VARCHAR(20) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "description" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_skills" (
    "id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "description" TEXT NOT NULL,
    "indicator_text" TEXT,
    "competency_tags" TEXT[],
    "insercion_tags" TEXT[],
    "profile_refs" TEXT[],
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_templates" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "schema" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_plans" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "course_assignment_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'borrador',
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_units" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "academic_period_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "skill_ids" TEXT[],
    "start_date" DATE,
    "end_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'borrador',
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_areas_institution_id_code_key" ON "curriculum_areas"("institution_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_criteria_area_id_subnivel_code_key" ON "curriculum_criteria"("area_id", "subnivel", "code");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_skills_criterion_id_code_key" ON "curriculum_skills"("criterion_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_plans_course_assignment_id_key" ON "curriculum_plans"("course_assignment_id");

-- CreateIndex
CREATE INDEX "planning_units_plan_id_academic_period_id_idx" ON "planning_units"("plan_id", "academic_period_id");

-- CreateIndex
CREATE INDEX "activities_curriculum_skill_id_idx" ON "activities"("curriculum_skill_id");

-- CreateIndex
CREATE INDEX "pedagogic_recoveries_curriculum_skill_id_idx" ON "pedagogic_recoveries"("curriculum_skill_id");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_curriculum_area_id_fkey" FOREIGN KEY ("curriculum_area_id") REFERENCES "curriculum_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_areas" ADD CONSTRAINT "curriculum_areas_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_criteria" ADD CONSTRAINT "curriculum_criteria_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "curriculum_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_skills" ADD CONSTRAINT "curriculum_skills_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "curriculum_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_templates" ADD CONSTRAINT "planning_templates_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_course_assignment_id_fkey" FOREIGN KEY ("course_assignment_id") REFERENCES "course_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "planning_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_units" ADD CONSTRAINT "planning_units_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_units" ADD CONSTRAINT "planning_units_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "curriculum_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_units" ADD CONSTRAINT "planning_units_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "planning_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_units" ADD CONSTRAINT "planning_units_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_units" ADD CONSTRAINT "planning_units_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_units" ADD CONSTRAINT "planning_units_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedagogic_recoveries" ADD CONSTRAINT "pedagogic_recoveries_curriculum_skill_id_fkey" FOREIGN KEY ("curriculum_skill_id") REFERENCES "curriculum_skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_curriculum_skill_id_fkey" FOREIGN KEY ("curriculum_skill_id") REFERENCES "curriculum_skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "pedagogic_recoveries_student_id_course_assignment_id_academic_p" RENAME TO "pedagogic_recoveries_student_id_course_assignment_id_academ_key";

