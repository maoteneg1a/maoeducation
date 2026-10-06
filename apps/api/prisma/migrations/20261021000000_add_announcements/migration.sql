CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "event_at" TIMESTAMP(3),
    "location" VARCHAR(200),
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "audience" VARCHAR(20) NOT NULL DEFAULT 'all',
    "parallel_ids" JSONB NOT NULL DEFAULT '[]',
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcements_institution_id_published_at_idx"
ON "announcements"("institution_id", "published_at");

ALTER TABLE "announcements"
ADD CONSTRAINT "announcements_institution_id_fkey"
FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "announcements"
ADD CONSTRAINT "announcements_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
