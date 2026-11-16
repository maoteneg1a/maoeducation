-- CreateTable
CREATE TABLE "course_boards" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "parallel_id" TEXT NOT NULL,
    "academic_period_id" TEXT NOT NULL,
    "chair_id" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "conclusions" TEXT NOT NULL DEFAULT '',
    "snapshot" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMP(3),
    "closed_by" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_board_evidence" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "snapshot" JSONB,
    "is_signed" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_board_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_boards_institution_id_academic_period_id_idx" ON "course_boards"("institution_id", "academic_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_boards_parallel_id_academic_period_id_key" ON "course_boards"("parallel_id", "academic_period_id");

-- CreateIndex
CREATE INDEX "course_board_evidence_board_id_created_at_idx" ON "course_board_evidence"("board_id", "created_at");

-- AddForeignKey
ALTER TABLE "course_boards" ADD CONSTRAINT "course_boards_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_boards" ADD CONSTRAINT "course_boards_parallel_id_fkey" FOREIGN KEY ("parallel_id") REFERENCES "parallels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_boards" ADD CONSTRAINT "course_boards_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_boards" ADD CONSTRAINT "course_boards_chair_id_fkey" FOREIGN KEY ("chair_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_board_evidence" ADD CONSTRAINT "course_board_evidence_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "course_boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_board_evidence" ADD CONSTRAINT "course_board_evidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
