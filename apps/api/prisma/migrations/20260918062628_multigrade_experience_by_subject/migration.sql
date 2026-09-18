-- DropIndex
DROP INDEX "multigrade_shared_experiences_group_id_academic_period_id_w_key";

-- AlterTable
ALTER TABLE "multigrade_shared_experiences" ADD COLUMN     "subject_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "multigrade_shared_experiences_group_id_subject_id_academic__key" ON "multigrade_shared_experiences"("group_id", "subject_id", "academic_period_id", "week_number");

-- AddForeignKey
ALTER TABLE "multigrade_shared_experiences" ADD CONSTRAINT "multigrade_shared_experiences_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
