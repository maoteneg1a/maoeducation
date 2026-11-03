-- Complemento por hora. Conserva intactos los registros diarios existentes.
CREATE TABLE "class_attendance_records" (
 "id" TEXT NOT NULL,
 "institution_id" TEXT NOT NULL,
 "course_assignment_id" TEXT NOT NULL,
 "student_id" TEXT NOT NULL,
 "date" DATE NOT NULL,
 "period" INTEGER NOT NULL CHECK ("period" BETWEEN 1 AND 20),
 "status" VARCHAR(20) NOT NULL CHECK ("status" IN ('present','absent','late','excused')),
 "notes" TEXT,
 "recorded_by" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "class_attendance_records_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "class_attendance_records_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "class_attendance_records_course_assignment_id_fkey" FOREIGN KEY ("course_assignment_id") REFERENCES "course_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "class_attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "class_attendance_records_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "class_attendance_records_course_assignment_id_student_id_da_key" ON "class_attendance_records"("course_assignment_id","student_id","date","period");
CREATE INDEX "class_attendance_records_institution_id_course_assignment_i_idx" ON "class_attendance_records"("institution_id","course_assignment_id","date","period");
