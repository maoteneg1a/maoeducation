-- Consola de plataforma: roles del equipo, CRM de leads, límites de plan,
-- notas de soporte y avisos a las instituciones.
ALTER TABLE "platform_admins" ADD COLUMN "role" VARCHAR(20) NOT NULL DEFAULT 'owner';

ALTER TABLE "leads"
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "owner_admin_id" TEXT,
  ADD COLUMN "next_follow_up_at" TIMESTAMP(3),
  ADD COLUMN "converted_institution_id" TEXT;

-- Normaliza estados viejos al vocabulario que usa la app.
UPDATE "leads" SET "status" = 'demo_scheduled' WHERE "status" = 'demo';
UPDATE "leads" SET "status" = 'closed_won' WHERE "status" = 'won';
UPDATE "leads" SET "status" = 'closed_lost' WHERE "status" = 'lost';

ALTER TABLE "subscriptions"
  ADD COLUMN "max_students" INTEGER,
  ADD COLUMN "max_teachers" INTEGER;

CREATE TABLE "institution_notes" (
  "id" TEXT NOT NULL,
  "institution_id" TEXT NOT NULL,
  "platform_admin_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_notes_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "institution_notes_institution_id_created_at_idx" ON "institution_notes"("institution_id", "created_at");

CREATE TABLE "platform_announcements" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "level" VARCHAR(20) NOT NULL DEFAULT 'info',
  "audience" VARCHAR(20) NOT NULL DEFAULT 'all',
  "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMP(3),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_announcements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_announcements_starts_at_ends_at_idx" ON "platform_announcements"("starts_at", "ends_at");
