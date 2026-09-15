-- DropForeignKey
ALTER TABLE "planning_units" DROP CONSTRAINT "planning_units_academic_period_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_units" DROP CONSTRAINT "planning_units_approved_by_fkey";

-- DropForeignKey
ALTER TABLE "planning_units" DROP CONSTRAINT "planning_units_created_by_fkey";

-- DropForeignKey
ALTER TABLE "planning_units" DROP CONSTRAINT "planning_units_institution_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_units" DROP CONSTRAINT "planning_units_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_units" DROP CONSTRAINT "planning_units_template_id_fkey";

-- DropTable
DROP TABLE "planning_units";

-- CreateTable
CREATE TABLE "curriculum_sabers" (
    "id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculum_sabers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_situations" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "academic_period_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "interdisciplinary_area_ids" TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'borrador',
    "created_by" TEXT NOT NULL,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_situations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_weeks" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "situation_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "name" VARCHAR(150),
    "start_date" DATE,
    "end_date" DATE,
    "competencias_especificas" TEXT,
    "indicadores_evaluacion" TEXT,
    "skill_ids" TEXT[],
    "saber_ids" TEXT[],
    "momentos" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_sabers_skill_id_code_key" ON "curriculum_sabers"("skill_id", "code");

-- CreateIndex
CREATE INDEX "learning_situations_plan_id_academic_period_id_idx" ON "learning_situations"("plan_id", "academic_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "planning_weeks_situation_id_week_number_key" ON "planning_weeks"("situation_id", "week_number");

-- AddForeignKey
ALTER TABLE "curriculum_sabers" ADD CONSTRAINT "curriculum_sabers_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "curriculum_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_situations" ADD CONSTRAINT "learning_situations_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_situations" ADD CONSTRAINT "learning_situations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "curriculum_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_situations" ADD CONSTRAINT "learning_situations_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_situations" ADD CONSTRAINT "learning_situations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_situations" ADD CONSTRAINT "learning_situations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_situations" ADD CONSTRAINT "learning_situations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_weeks" ADD CONSTRAINT "planning_weeks_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_weeks" ADD CONSTRAINT "planning_weeks_situation_id_fkey" FOREIGN KEY ("situation_id") REFERENCES "learning_situations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

