-- CreateTable
CREATE TABLE "reinforcement_plans" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_assignment_id" TEXT NOT NULL,
    "academic_period_id" TEXT NOT NULL,
    "planType" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'borrador',
    "objetivo_general" TEXT,
    "estrategias" TEXT,
    "responsables" TEXT,
    "fecha_inicio" DATE,
    "fecha_seguimiento" DATE,
    "observaciones_finales" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reinforcement_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_plan_skills" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "curriculum_skill_id" TEXT NOT NULL,
    "average_at_detection" DECIMAL(5,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reinforcement_plan_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reinforcement_plans_institution_id_academic_period_id_idx" ON "reinforcement_plans"("institution_id", "academic_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_plans_student_id_course_assignment_id_academi_key" ON "reinforcement_plans"("student_id", "course_assignment_id", "academic_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_plan_skills_plan_id_curriculum_skill_id_key" ON "reinforcement_plan_skills"("plan_id", "curriculum_skill_id");

-- AddForeignKey
ALTER TABLE "reinforcement_plans" ADD CONSTRAINT "reinforcement_plans_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_plans" ADD CONSTRAINT "reinforcement_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_plans" ADD CONSTRAINT "reinforcement_plans_course_assignment_id_fkey" FOREIGN KEY ("course_assignment_id") REFERENCES "course_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_plans" ADD CONSTRAINT "reinforcement_plans_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_plans" ADD CONSTRAINT "reinforcement_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_plan_skills" ADD CONSTRAINT "reinforcement_plan_skills_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "reinforcement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_plan_skills" ADD CONSTRAINT "reinforcement_plan_skills_curriculum_skill_id_fkey" FOREIGN KEY ("curriculum_skill_id") REFERENCES "curriculum_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

