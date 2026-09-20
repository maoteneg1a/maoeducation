-- Vincula InterdisciplinaryProject con su situación de origen (LearningSituation),
-- para que "regenerar con IA desde una situación" pueda reemplazar el proyecto
-- anterior de esa situación en vez de crear uno adicional huérfano cada vez.
-- Nullable: proyectos existentes creados antes de este campo no tienen el vínculo.
ALTER TABLE "interdisciplinary_projects" ADD COLUMN "situation_id" TEXT;

CREATE INDEX "interdisciplinary_projects_situation_id_idx" ON "interdisciplinary_projects"("situation_id");
