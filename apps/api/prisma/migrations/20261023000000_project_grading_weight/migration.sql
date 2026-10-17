ALTER TABLE "course_assignments" ADD COLUMN "project_weight" DOUBLE PRECISION;
ALTER TABLE "course_assignments" ADD CONSTRAINT "course_assignments_project_weight_check"
CHECK ("project_weight" IS NULL OR ("project_weight" >= 0 AND "project_weight" <= "exam_weight"));
