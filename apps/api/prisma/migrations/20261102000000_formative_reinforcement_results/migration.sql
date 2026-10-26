CREATE TABLE "formative_reinforcement_results" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "institution_id" TEXT NOT NULL REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "student_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "course_assignment_id" TEXT NOT NULL REFERENCES "course_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "academic_period_id" TEXT NOT NULL REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "plan_id" TEXT NOT NULL REFERENCES "reinforcement_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "recorded_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "payload" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "formative_result_scope_idx" ON "formative_reinforcement_results"
  ("institution_id", "course_assignment_id", "academic_period_id", "student_id", "created_at");
CREATE INDEX "formative_result_plan_idx" ON "formative_reinforcement_results" ("plan_id");

ALTER TABLE "reinforcement_session_attendance" ADD COLUMN "score_scale_max" DECIMAL(8,2);
