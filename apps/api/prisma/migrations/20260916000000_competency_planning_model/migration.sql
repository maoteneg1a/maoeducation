-- DropForeignKey
ALTER TABLE "reinforcement_plan_skills" DROP CONSTRAINT "reinforcement_plan_skills_curriculum_skill_id_fkey";

-- AlterTable
ALTER TABLE "interdisciplinary_contributions" ADD COLUMN     "competency_ids" TEXT[],
ADD COLUMN     "competency_saber_ids" TEXT[];

-- AlterTable
ALTER TABLE "planning_weeks" ADD COLUMN     "competency_ids" TEXT[],
ADD COLUMN     "competency_indicator_ids" TEXT[],
ADD COLUMN     "competency_saber_ids" TEXT[];

-- AlterTable
ALTER TABLE "reinforcement_plan_skills" ADD COLUMN     "competency_id" TEXT,
ALTER COLUMN "curriculum_skill_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "competency_areas" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competency_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competencies" (
    "id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "subnivel" VARCHAR(20) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "text" TEXT NOT NULL,
    "key_competency_codes" TEXT[],
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency_indicators" (
    "id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competency_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competency_sabers" (
    "id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competency_sabers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_competencies" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "short_name" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "color" VARCHAR(10),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "key_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dua_checkpoints" (
    "id" TEXT NOT NULL,
    "operational_code" VARCHAR(20) NOT NULL,
    "principle_name" VARCHAR(50) NOT NULL,
    "guideline_number" INTEGER NOT NULL,
    "guideline_name" VARCHAR(150) NOT NULL,
    "checkpoint_number" VARCHAR(10) NOT NULL,
    "checkpointText" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dua_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dua_strategies" (
    "id" TEXT NOT NULL,
    "checkpoint_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "compatible_phases" TEXT[],
    "compatible_purposes" TEXT[],
    "source_page" INTEGER,

    CONSTRAINT "dua_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_techniques" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "compatible_instrument_codes" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assessment_techniques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_instruments" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assessment_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricular_insertion_banks" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "title" VARCHAR(150) NOT NULL,

    CONSTRAINT "curricular_insertion_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricular_insertion_candidates" (
    "id" TEXT NOT NULL,
    "bank_id" TEXT NOT NULL,
    "source_code" VARCHAR(30) NOT NULL,
    "text" TEXT NOT NULL,
    "page" INTEGER,

    CONSTRAINT "curricular_insertion_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "competency_areas_institution_id_code_key" ON "competency_areas"("institution_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "competencies_area_id_subnivel_code_key" ON "competencies"("area_id", "subnivel", "code");

-- CreateIndex
CREATE UNIQUE INDEX "competency_indicators_competency_id_code_key" ON "competency_indicators"("competency_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "competency_sabers_competency_id_code_key" ON "competency_sabers"("competency_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "key_competencies_code_key" ON "key_competencies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "dua_checkpoints_operational_code_key" ON "dua_checkpoints"("operational_code");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_techniques_code_key" ON "assessment_techniques"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_instruments_code_key" ON "assessment_instruments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "curricular_insertion_banks_key_key" ON "curricular_insertion_banks"("key");

-- CreateIndex
CREATE INDEX "curricular_insertion_candidates_bank_id_source_code_idx" ON "curricular_insertion_candidates"("bank_id", "source_code");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_plan_skills_plan_id_competency_id_key" ON "reinforcement_plan_skills"("plan_id", "competency_id");

-- AddForeignKey
ALTER TABLE "competency_areas" ADD CONSTRAINT "competency_areas_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "competency_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_indicators" ADD CONSTRAINT "competency_indicators_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competency_sabers" ADD CONSTRAINT "competency_sabers_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dua_strategies" ADD CONSTRAINT "dua_strategies_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "dua_checkpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricular_insertion_candidates" ADD CONSTRAINT "curricular_insertion_candidates_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "curricular_insertion_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_plan_skills" ADD CONSTRAINT "reinforcement_plan_skills_curriculum_skill_id_fkey" FOREIGN KEY ("curriculum_skill_id") REFERENCES "curriculum_skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_plan_skills" ADD CONSTRAINT "reinforcement_plan_skills_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AlterTable (Subject.competencyAreaId — vínculo equivalente al de destrezas)
ALTER TABLE "subjects" ADD COLUMN     "competency_area_id" TEXT;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_competency_area_id_fkey" FOREIGN KEY ("competency_area_id") REFERENCES "competency_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable (Activity.competencyId — equivalente a curriculumSkillId para el modelo por competencias)
ALTER TABLE "activities" ADD COLUMN     "competency_id" TEXT;

-- CreateIndex
CREATE INDEX "activities_competency_id_idx" ON "activities"("competency_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
