-- Calendario institucional: feriados, exámenes y eventos visibles para personal y/o familias.
CREATE TABLE "calendar_events" (
  "id" TEXT NOT NULL,
  "institution_id" TEXT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "type" VARCHAR(20) NOT NULL DEFAULT 'event',
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "audience" VARCHAR(20) NOT NULL DEFAULT 'all',
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_events_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "calendar_events_institution_id_start_date_idx" ON "calendar_events"("institution_id", "start_date");
