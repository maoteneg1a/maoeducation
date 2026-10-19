-- CreateTable
CREATE TABLE "dece_cases" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "encrypted_report" TEXT NOT NULL,
    "urgency" VARCHAR(10) NOT NULL DEFAULT 'unknown',
    "fallback_receiver_id" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'received',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dece_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dece_case_access" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access" VARCHAR(20) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dece_case_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dece_case_exclusions" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dece_case_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dece_case_actions" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "encrypted_content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dece_case_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dece_audit_logs" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "case_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dece_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dece_cases_institution_id_status_created_at_idx" ON "dece_cases"("institution_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dece_cases_id_institution_id_key" ON "dece_cases"("id", "institution_id");

-- CreateIndex
CREATE UNIQUE INDEX "dece_cases_institution_id_reporter_id_request_id_key" ON "dece_cases"("institution_id", "reporter_id", "request_id");

-- CreateIndex
CREATE INDEX "dece_case_access_institution_id_user_id_revoked_at_idx" ON "dece_case_access"("institution_id", "user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "dece_case_access_case_id_user_id_key" ON "dece_case_access"("case_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dece_case_exclusions_case_id_user_id_key" ON "dece_case_exclusions"("case_id", "user_id");

-- CreateIndex
CREATE INDEX "dece_case_actions_institution_id_case_id_created_at_idx" ON "dece_case_actions"("institution_id", "case_id", "created_at");

-- CreateIndex
CREATE INDEX "dece_audit_logs_institution_id_case_id_created_at_idx" ON "dece_audit_logs"("institution_id", "case_id", "created_at");

-- AddForeignKey
ALTER TABLE "dece_cases" ADD CONSTRAINT "dece_cases_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dece_cases" ADD CONSTRAINT "dece_cases_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dece_case_access" ADD CONSTRAINT "dece_case_access_case_id_institution_id_fkey" FOREIGN KEY ("case_id", "institution_id") REFERENCES "dece_cases"("id", "institution_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dece_case_access" ADD CONSTRAINT "dece_case_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dece_case_exclusions" ADD CONSTRAINT "dece_case_exclusions_case_id_institution_id_fkey" FOREIGN KEY ("case_id", "institution_id") REFERENCES "dece_cases"("id", "institution_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dece_case_exclusions" ADD CONSTRAINT "dece_case_exclusions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dece_case_actions" ADD CONSTRAINT "dece_case_actions_case_id_institution_id_fkey" FOREIGN KEY ("case_id", "institution_id") REFERENCES "dece_cases"("id", "institution_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dece_case_actions" ADD CONSTRAINT "dece_case_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dece_audit_logs" ADD CONSTRAINT "dece_audit_logs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dece_audit_logs" ADD CONSTRAINT "dece_audit_logs_case_id_institution_id_fkey" FOREIGN KEY ("case_id", "institution_id") REFERENCES "dece_cases"("id", "institution_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dece_audit_logs" ADD CONSTRAINT "dece_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Las actuaciones y auditorías son append-only, incluso fuera de la API.
CREATE FUNCTION dece_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DECE history is append-only';
END;
$$;
CREATE TRIGGER dece_audit_append_only BEFORE UPDATE OR DELETE ON "dece_audit_logs"
FOR EACH ROW EXECUTE FUNCTION dece_reject_history_mutation();
CREATE TRIGGER dece_audit_no_truncate BEFORE TRUNCATE ON "dece_audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION dece_reject_history_mutation();
CREATE TRIGGER dece_actions_append_only BEFORE UPDATE OR DELETE ON "dece_case_actions"
FOR EACH ROW EXECUTE FUNCTION dece_reject_history_mutation();
CREATE TRIGGER dece_actions_no_truncate BEFORE TRUNCATE ON "dece_case_actions"
FOR EACH STATEMENT EXECUTE FUNCTION dece_reject_history_mutation();

ALTER TABLE "dece_cases" ADD CONSTRAINT "dece_cases_fallback_receiver_id_fkey" FOREIGN KEY ("fallback_receiver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "dece_cases_institution_id_fallback_receiver_id_status_idx" ON "dece_cases"("institution_id", "fallback_receiver_id", "status");
