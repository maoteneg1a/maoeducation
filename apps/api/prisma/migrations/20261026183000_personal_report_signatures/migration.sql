CREATE TABLE "user_signatures" (
  "user_id" TEXT NOT NULL,
  "image_data" TEXT NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_signatures_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "formal_reports" ADD COLUMN "author_signature" JSONB, ADD COLUMN "recipient_signature" JSONB;
