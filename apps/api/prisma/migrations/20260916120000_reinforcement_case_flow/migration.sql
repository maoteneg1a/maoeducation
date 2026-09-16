-- DropIndex
DROP INDEX "reinforcement_plans_student_id_course_assignment_id_academi_key";

-- AlterTable
ALTER TABLE "learning_situations" ALTER COLUMN "interdisciplinary_subject_ids" DROP DEFAULT;

-- AlterTable
ALTER TABLE "reinforcement_plans" ADD COLUMN     "case_status" VARCHAR(30) NOT NULL DEFAULT 'DETECTED',
ADD COLUMN     "cycle_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "detected_on" DATE,
ADD COLUMN     "detection_evidence_origin" TEXT,
ADD COLUMN     "detection_evidence_value" TEXT,
ADD COLUMN     "detection_initial_result" TEXT,
ADD COLUMN     "detection_observation" TEXT,
ADD COLUMN     "detection_period" TEXT,
ADD COLUMN     "detection_source_code" VARCHAR(40),
ADD COLUMN     "evaluation_instrument" TEXT,
ADD COLUMN     "evaluation_observed_result" TEXT,
ADD COLUMN     "evaluation_scale_type" VARCHAR(20) DEFAULT 'NONE',
ADD COLUMN     "learning_target_activities" TEXT[],
ADD COLUMN     "learning_target_description" TEXT,
ADD COLUMN     "learning_target_evidence" TEXT,
ADD COLUMN     "learning_target_title" TEXT,
ADD COLUMN     "mode" VARCHAR(10) NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "mode_authority" VARCHAR(40),
ADD COLUMN     "need_codes" TEXT[],
ADD COLUMN     "need_observation" TEXT,
ADD COLUMN     "previous_case_id" TEXT,
ADD COLUMN     "proposal_active_strategy" TEXT,
ADD COLUMN     "proposal_authority" VARCHAR(30) DEFAULT 'TIGA_SUGGESTED',
ADD COLUMN     "proposal_concrete_activity" TEXT,
ADD COLUMN     "proposal_duration_frequency" TEXT,
ADD COLUMN     "proposal_evaluation" TEXT,
ADD COLUMN     "proposal_evidence" TEXT,
ADD COLUMN     "proposal_expected_result" TEXT,
ADD COLUMN     "proposal_learning_to_reinforce" TEXT,
ADD COLUMN     "proposal_objective" TEXT,
ADD COLUMN     "proposal_resource" TEXT,
ADD COLUMN     "proposal_teacher_confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "psychopedagogical_authority_reference" TEXT,
ADD COLUMN     "psychopedagogical_report_exists" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reinforcement_duration_weeks" INTEGER,
ADD COLUMN     "reinforcement_frequency" TEXT,
ADD COLUMN     "root_case_id" TEXT;

-- CreateTable
CREATE TABLE "reinforcement_case_students" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,

    CONSTRAINT "reinforcement_case_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_plan_units" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "temporal_index" INTEGER NOT NULL,
    "phase" VARCHAR(30) NOT NULL,
    "learning_focus" TEXT NOT NULL,
    "specific_objective" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "concrete_activity" TEXT NOT NULL,
    "required_resource" TEXT NOT NULL,
    "observable_evidence" TEXT NOT NULL,
    "evaluation_mechanism" TEXT NOT NULL,
    "frequency" TEXT,
    "advancement_criterion" TEXT NOT NULL,
    "next_step" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reinforcement_plan_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_communications" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "medium_code" VARCHAR(30) NOT NULL,
    "medium_label" TEXT NOT NULL,
    "recipient" TEXT NOT NULL DEFAULT 'Representante',
    "institutional_text" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reinforcement_communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_commitments" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "commitment_code" VARCHAR(30) NOT NULL,
    "commitment_label" TEXT NOT NULL,
    "responsible" TEXT NOT NULL DEFAULT 'Representante y estudiante',
    "target_date" DATE,
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reinforcement_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_follow_ups" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "strategy_applied" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "activity_applied" TEXT,
    "support_or_adjustment" TEXT,
    "observed_progress" TEXT,
    "persistent_difficulty" TEXT,
    "next_action" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reinforcement_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_reevaluations" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "evaluation" TEXT NOT NULL,
    "persistent_difficulty" BOOLEAN NOT NULL DEFAULT false,
    "institutional_support_suggestion" TEXT,
    "initial_result" TEXT,
    "subsequent_result" TEXT,
    "observed_progress" TEXT,
    "evidence" TEXT,
    "pedagogical_decision" VARCHAR(40),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reinforcement_reevaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_reevaluation_outcomes" (
    "id" TEXT NOT NULL,
    "reevaluation_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "result" VARCHAR(20) NOT NULL,
    "assessment_value" TEXT,
    "observation" TEXT,

    CONSTRAINT "reinforcement_reevaluation_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_case_students_plan_id_student_id_key" ON "reinforcement_case_students"("plan_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_plan_units_plan_id_temporal_index_key" ON "reinforcement_plan_units"("plan_id", "temporal_index");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_reevaluation_outcomes_reevaluation_id_student_key" ON "reinforcement_reevaluation_outcomes"("reevaluation_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_plans_previous_case_id_key" ON "reinforcement_plans"("previous_case_id");

-- CreateIndex
CREATE INDEX "reinforcement_plans_student_id_course_assignment_id_academi_idx" ON "reinforcement_plans"("student_id", "course_assignment_id", "academic_period_id");

-- AddForeignKey
ALTER TABLE "reinforcement_plans" ADD CONSTRAINT "reinforcement_plans_root_case_id_fkey" FOREIGN KEY ("root_case_id") REFERENCES "reinforcement_plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reinforcement_plans" ADD CONSTRAINT "reinforcement_plans_previous_case_id_fkey" FOREIGN KEY ("previous_case_id") REFERENCES "reinforcement_plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reinforcement_case_students" ADD CONSTRAINT "reinforcement_case_students_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "reinforcement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_case_students" ADD CONSTRAINT "reinforcement_case_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_plan_units" ADD CONSTRAINT "reinforcement_plan_units_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "reinforcement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_communications" ADD CONSTRAINT "reinforcement_communications_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "reinforcement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_communications" ADD CONSTRAINT "reinforcement_communications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_commitments" ADD CONSTRAINT "reinforcement_commitments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "reinforcement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_commitments" ADD CONSTRAINT "reinforcement_commitments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_follow_ups" ADD CONSTRAINT "reinforcement_follow_ups_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "reinforcement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_follow_ups" ADD CONSTRAINT "reinforcement_follow_ups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reevaluations" ADD CONSTRAINT "reinforcement_reevaluations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "reinforcement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reevaluations" ADD CONSTRAINT "reinforcement_reevaluations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reevaluation_outcomes" ADD CONSTRAINT "reinforcement_reevaluation_outcomes_reevaluation_id_fkey" FOREIGN KEY ("reevaluation_id") REFERENCES "reinforcement_reevaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_reevaluation_outcomes" ADD CONSTRAINT "reinforcement_reevaluation_outcomes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

