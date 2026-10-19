ALTER TABLE "announcements"
  ADD COLUMN "communication_type" VARCHAR(30) NOT NULL DEFAULT 'announcement';

CREATE TABLE "announcement_rsvps" (
  "announcement_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "response" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "responded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "announcement_rsvps_pkey" PRIMARY KEY ("announcement_id", "user_id"),
  CONSTRAINT "announcement_rsvps_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "announcement_rsvps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "announcement_rsvps_announcement_id_response_idx" ON "announcement_rsvps"("announcement_id", "response");
CREATE INDEX "announcement_rsvps_user_id_updated_at_idx" ON "announcement_rsvps"("user_id", "updated_at");
