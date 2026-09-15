-- AlterTable
ALTER TABLE "subjects" ADD COLUMN "workload_code" VARCHAR(30);

-- AlterTable
ALTER TABLE "parallels" ADD COLUMN "education_offer" VARCHAR(30);

-- AlterTable
ALTER TABLE "course_assignments" ADD COLUMN "weekly_periods_override" SMALLINT;

-- CreateTable
CREATE TABLE "curricular_workloads" (
    "id" TEXT NOT NULL,
    "sublevel" VARCHAR(20) NOT NULL,
    "level_codes" TEXT[],
    "education_offer" VARCHAR(30) NOT NULL,
    "subject_codes" TEXT[],
    "weekly_periods" INTEGER,
    "group_weekly_periods" INTEGER,
    "period_minutes" SMALLINT NOT NULL,
    "source_type" VARCHAR(30) NOT NULL,
    "source_document" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "curricular_workloads_pkey" PRIMARY KEY ("id")
);
