-- AlterTable
ALTER TABLE "planning_weeks" ADD COLUMN     "multigrade_experience_id" TEXT;

-- CreateTable
CREATE TABLE "multigrade_groups" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "allow_superior_extension" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "multigrade_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "multigrade_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "grade_code" VARCHAR(20) NOT NULL,
    "course_assignment_id" TEXT NOT NULL,
    "parallel_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "multigrade_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "multigrade_shared_experiences" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "academic_period_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "context" TEXT NOT NULL,
    "common_purpose" TEXT NOT NULL,
    "participant_grade_codes" TEXT[],
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "multigrade_shared_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "multigrade_group_members_course_assignment_id_key" ON "multigrade_group_members"("course_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "multigrade_shared_experiences_group_id_academic_period_id_w_key" ON "multigrade_shared_experiences"("group_id", "academic_period_id", "week_number");

-- AddForeignKey
ALTER TABLE "planning_weeks" ADD CONSTRAINT "planning_weeks_multigrade_experience_id_fkey" FOREIGN KEY ("multigrade_experience_id") REFERENCES "multigrade_shared_experiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_groups" ADD CONSTRAINT "multigrade_groups_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_groups" ADD CONSTRAINT "multigrade_groups_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_groups" ADD CONSTRAINT "multigrade_groups_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_groups" ADD CONSTRAINT "multigrade_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_group_members" ADD CONSTRAINT "multigrade_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "multigrade_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_group_members" ADD CONSTRAINT "multigrade_group_members_course_assignment_id_fkey" FOREIGN KEY ("course_assignment_id") REFERENCES "course_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_group_members" ADD CONSTRAINT "multigrade_group_members_parallel_id_fkey" FOREIGN KEY ("parallel_id") REFERENCES "parallels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_group_members" ADD CONSTRAINT "multigrade_group_members_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_shared_experiences" ADD CONSTRAINT "multigrade_shared_experiences_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_shared_experiences" ADD CONSTRAINT "multigrade_shared_experiences_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "multigrade_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_shared_experiences" ADD CONSTRAINT "multigrade_shared_experiences_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "multigrade_shared_experiences" ADD CONSTRAINT "multigrade_shared_experiences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
