-- CreateTable
CREATE TABLE "early_alerts" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_assignment_id" TEXT NOT NULL,
    "academic_period_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "score_at_detection" DECIMAL(5,2),
    "current_score" DECIMAL(5,2),
    "qualitative_code" VARCHAR(10),
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "dismissed_reason" TEXT,
    "dismissed_by" TEXT,
    "reinforcement_plan_id" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "early_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formal_reports" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "folio" VARCHAR(40),
    "sequence" INTEGER,
    "type_key" VARCHAR(60) NOT NULL,
    "type_label" VARCHAR(200) NOT NULL,
    "scope" VARCHAR(20) NOT NULL,
    "student_id" TEXT,
    "parallel_id" TEXT,
    "course_assignment_id" TEXT,
    "academic_period_id" TEXT,
    "alert_id" TEXT,
    "reinforcement_plan_id" TEXT,
    "parent_report_id" TEXT,
    "previous_version_id" TEXT,
    "author_id" TEXT NOT NULL,
    "recipient_instance" VARCHAR(60) NOT NULL,
    "recipient_instance_label" VARCHAR(200) NOT NULL,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "content" JSONB NOT NULL DEFAULT '{}',
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "type_config" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "content_hash" VARCHAR(64),
    "sent_at" TIMESTAMP(3),
    "ack_deadline_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "received_by_id" TEXT,
    "returned_at" TIMESTAMP(3),
    "return_note" TEXT,
    "attended_at" TIMESTAMP(3),
    "attended_by_id" TEXT,
    "response_note" TEXT,
    "escalated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formal_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formal_report_recipients" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "formal_report_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formal_report_attachments" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formal_report_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_attachments" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "session_id" TEXT,
    "category" VARCHAR(60) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reinforcement_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_sessions" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "target_activity_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reinforcement_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reinforcement_session_attendance" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "score" DECIMAL(5,2),
    "observation" TEXT,
    "applied_score" DECIMAL(5,2),
    "applied_mode" VARCHAR(30),

    CONSTRAINT "reinforcement_session_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin_recommendations" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academic_period_id" TEXT NOT NULL,
    "scope_key" VARCHAR(60) NOT NULL,
    "text" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulletin_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "early_alerts_institution_id_academic_period_id_status_idx" ON "early_alerts"("institution_id", "academic_period_id", "status");

-- CreateIndex
CREATE INDEX "early_alerts_course_assignment_id_academic_period_id_idx" ON "early_alerts"("course_assignment_id", "academic_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "early_alerts_student_id_course_assignment_id_academic_perio_key" ON "early_alerts"("student_id", "course_assignment_id", "academic_period_id");

-- CreateIndex
CREATE INDEX "formal_reports_institution_id_status_idx" ON "formal_reports"("institution_id", "status");

-- CreateIndex
CREATE INDEX "formal_reports_student_id_academic_year_id_idx" ON "formal_reports"("student_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "formal_reports_author_id_idx" ON "formal_reports"("author_id");

-- CreateIndex
CREATE INDEX "formal_reports_alert_id_idx" ON "formal_reports"("alert_id");

-- CreateIndex
CREATE INDEX "formal_reports_reinforcement_plan_id_idx" ON "formal_reports"("reinforcement_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "formal_reports_institution_id_folio_key" ON "formal_reports"("institution_id", "folio");

-- CreateIndex
CREATE UNIQUE INDEX "formal_reports_institution_id_academic_year_id_sequence_key" ON "formal_reports"("institution_id", "academic_year_id", "sequence");

-- CreateIndex
CREATE INDEX "formal_report_recipients_user_id_idx" ON "formal_report_recipients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "formal_report_recipients_report_id_user_id_key" ON "formal_report_recipients"("report_id", "user_id");

-- CreateIndex
CREATE INDEX "formal_report_attachments_report_id_idx" ON "formal_report_attachments"("report_id");

-- CreateIndex
CREATE INDEX "reinforcement_attachments_plan_id_idx" ON "reinforcement_attachments"("plan_id");

-- CreateIndex
CREATE INDEX "reinforcement_sessions_plan_id_idx" ON "reinforcement_sessions"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "reinforcement_session_attendance_session_id_student_id_key" ON "reinforcement_session_attendance"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "bulletin_recommendations_institution_id_academic_period_id_idx" ON "bulletin_recommendations"("institution_id", "academic_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "bulletin_recommendations_student_id_academic_period_id_scop_key" ON "bulletin_recommendations"("student_id", "academic_period_id", "scope_key");

-- AddForeignKey
ALTER TABLE "early_alerts" ADD CONSTRAINT "early_alerts_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "early_alerts" ADD CONSTRAINT "early_alerts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formal_reports" ADD CONSTRAINT "formal_reports_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formal_reports" ADD CONSTRAINT "formal_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formal_reports" ADD CONSTRAINT "formal_reports_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formal_reports" ADD CONSTRAINT "formal_reports_parent_report_id_fkey" FOREIGN KEY ("parent_report_id") REFERENCES "formal_reports"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "formal_report_recipients" ADD CONSTRAINT "formal_report_recipients_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "formal_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formal_report_recipients" ADD CONSTRAINT "formal_report_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formal_report_attachments" ADD CONSTRAINT "formal_report_attachments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "formal_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formal_report_attachments" ADD CONSTRAINT "formal_report_attachments_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formal_report_attachments" ADD CONSTRAINT "formal_report_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_attachments" ADD CONSTRAINT "reinforcement_attachments_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_attachments" ADD CONSTRAINT "reinforcement_attachments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "reinforcement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_attachments" ADD CONSTRAINT "reinforcement_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_sessions" ADD CONSTRAINT "reinforcement_sessions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_sessions" ADD CONSTRAINT "reinforcement_sessions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "reinforcement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_session_attendance" ADD CONSTRAINT "reinforcement_session_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reinforcement_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reinforcement_session_attendance" ADD CONSTRAINT "reinforcement_session_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_recommendations" ADD CONSTRAINT "bulletin_recommendations_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_recommendations" ADD CONSTRAINT "bulletin_recommendations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permisos nuevos (catálogo global) — idempotente
INSERT INTO "permissions" ("id", "resource", "action", "scope")
VALUES
  (gen_random_uuid()::text, 'early_alerts', 'read', 'all'),
  (gen_random_uuid()::text, 'early_alerts', 'read', 'own'),
  (gen_random_uuid()::text, 'formal_reports', 'read', 'all'),
  (gen_random_uuid()::text, 'formal_reports', 'read', 'own'),
  (gen_random_uuid()::text, 'formal_reports', 'write', 'own'),
  (gen_random_uuid()::text, 'formal_reports', 'manage', 'all'),
  (gen_random_uuid()::text, 'reinforcement_cases', 'read', 'all')
ON CONFLICT ("resource", "action", "scope") DO NOTHING;

-- Asignación a los roles de sistema de TODAS las instituciones existentes
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN (VALUES
  ('admin', 'early_alerts', 'read', 'all'),
  ('admin', 'formal_reports', 'manage', 'all'),
  ('admin', 'reinforcement_cases', 'read', 'all'),
  ('dece', 'early_alerts', 'read', 'all'),
  ('dece', 'formal_reports', 'read', 'own'),
  ('dece', 'formal_reports', 'write', 'own'),
  ('inspector', 'early_alerts', 'read', 'all'),
  ('inspector', 'formal_reports', 'read', 'own'),
  ('inspector', 'formal_reports', 'write', 'own'),
  ('inspector', 'reinforcement_cases', 'read', 'all'),
  ('teacher', 'early_alerts', 'read', 'own'),
  ('teacher', 'formal_reports', 'read', 'own'),
  ('teacher', 'formal_reports', 'write', 'own'),
  ('guardian', 'formal_reports', 'read', 'own')
) AS m(role_name, resource, action, scope) ON m.role_name = r."name"
JOIN "permissions" p ON p."resource" = m.resource AND p."action" = m.action AND p."scope" = m.scope
ON CONFLICT DO NOTHING;
