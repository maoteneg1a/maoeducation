-- Selector real de "Conexión interdisciplinar": el docente elige entre SUS
-- propias materias asignadas (CourseAssignment), no el catálogo completo de
-- áreas curriculares de la institución. interdisciplinaryAreaIds nunca tuvo
-- UI que lo escribiera — se conserva la columna (por si alguna fila la usa)
-- y se agrega esta nueva junto a ella.
ALTER TABLE "learning_situations" ADD COLUMN "interdisciplinary_subject_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
