ALTER TABLE "announcements"
ADD COLUMN "flyer_name" VARCHAR(255),
ADD COLUMN "flyer_stored_name" VARCHAR(255),
ADD COLUMN "flyer_mime_type" VARCHAR(100),
ADD COLUMN "attachment_name" VARCHAR(255),
ADD COLUMN "attachment_stored_name" VARCHAR(255),
ADD COLUMN "attachment_mime_type" VARCHAR(100),
ADD COLUMN "attachment_size" INTEGER;

CREATE TABLE "announcement_reads" (
    "announcement_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("announcement_id", "user_id")
);

CREATE INDEX "announcement_reads_user_id_read_at_idx"
ON "announcement_reads"("user_id", "read_at");

ALTER TABLE "announcement_reads"
ADD CONSTRAINT "announcement_reads_announcement_id_fkey"
FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "announcement_reads"
ADD CONSTRAINT "announcement_reads_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
