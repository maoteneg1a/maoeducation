ALTER TABLE "announcements" ADD COLUMN "recipient_ids" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "course_board_id" TEXT;
CREATE UNIQUE INDEX "announcements_course_board_id_key" ON "announcements"("course_board_id");
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_course_board_id_fkey" FOREIGN KEY ("course_board_id") REFERENCES "course_boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
