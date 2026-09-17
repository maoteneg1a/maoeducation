-- Catálogo curricular (destrezas + competencias) pasa de "una copia por
-- institución" a GLOBAL — una sola copia compartida (contenido oficial
-- MINEDUC, idéntico para toda institución ecuatoriana). Antes cada registro
-- nuevo insertaba ~7,000 filas repetidas vía institution-bootstrap.ts.
--
-- Todos los datos existentes son de PRUEBA (confirmado) — se truncan las
-- tablas del catálogo antes de la migración estructural; se re-siembran una
-- sola vez con scripts/seed-global-curriculum-catalog.ts.
TRUNCATE TABLE "competency_sabers", "competency_indicators", "competencies", "competency_areas",
  "curriculum_sabers", "curriculum_skills", "curriculum_criteria", "curriculum_areas" CASCADE;

-- CurriculumArea: global, sin institution_id.
ALTER TABLE "curriculum_areas" DROP CONSTRAINT IF EXISTS "curriculum_areas_institution_id_fkey";
DROP INDEX IF EXISTS "curriculum_areas_institution_id_code_key";
ALTER TABLE "curriculum_areas" DROP COLUMN IF EXISTS "institution_id";
CREATE UNIQUE INDEX "curriculum_areas_code_key" ON "curriculum_areas"("code");

-- CompetencyArea: global, sin institution_id.
ALTER TABLE "competency_areas" DROP CONSTRAINT IF EXISTS "competency_areas_institution_id_fkey";
DROP INDEX IF EXISTS "competency_areas_institution_id_code_key";
ALTER TABLE "competency_areas" DROP COLUMN IF EXISTS "institution_id";
CREATE UNIQUE INDEX "competency_areas_code_key" ON "competency_areas"("code");

-- CurriculumSkill: institution_id NULLABLE — null = oficial (global),
-- con valor = personalizada (isCustom=true) de esa institución.
ALTER TABLE "curriculum_skills" ADD COLUMN "institution_id" TEXT;
ALTER TABLE "curriculum_skills" ADD CONSTRAINT "curriculum_skills_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Competency: institution_id NULLABLE — misma semántica que arriba.
ALTER TABLE "competencies" ADD COLUMN "institution_id" TEXT;
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
