CREATE TABLE "platform_errors" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT,
    "user_id" TEXT,
    "code" VARCHAR(100) NOT NULL DEFAULT 'INTERNAL_ERROR',
    "message" VARCHAR(500) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "route" VARCHAR(255) NOT NULL,
    "request_id" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_errors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_errors_created_at_idx" ON "platform_errors"("created_at");
CREATE INDEX "platform_errors_institution_id_created_at_idx" ON "platform_errors"("institution_id", "created_at");
CREATE INDEX "platform_errors_route_created_at_idx" ON "platform_errors"("route", "created_at");

ALTER TABLE "platform_errors"
ADD CONSTRAINT "platform_errors_institution_id_fkey"
FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
