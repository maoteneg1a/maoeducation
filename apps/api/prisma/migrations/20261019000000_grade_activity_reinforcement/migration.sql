ALTER TABLE "grades"
  ADD COLUMN "base_score" DECIMAL(5,2),
  ADD COLUMN "reinforcement_score" DECIMAL(5,2),
  ADD COLUMN "reinforcement_mode" VARCHAR(30),
  ADD COLUMN "reinforcement_recorded_at" TIMESTAMP(3);
