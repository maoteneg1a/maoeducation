-- Simplifica el flujo de estados de LearningSituation (Planificación
-- Microcurricular semanal): de 4 estados con aprobación por terceros
-- ("borrador" | "enviado" | "revisado" | "aprobado") a solo 2, decididos
-- únicamente por el propio docente ("borrador" | "listo"), con transición
-- libre en ambos sentidos. No es un cambio de schema (status ya era
-- VARCHAR(20) libre, sin enum) — solo migra los datos existentes.
--
-- CurriculumPlan.status (PCA/ApprovalStatus) NO se toca — conserva su flujo
-- de 2 pasos sin cambios, este pedido aplica solo a LearningSituation.
UPDATE "learning_situations"
SET "status" = 'listo'
WHERE "status" IN ('enviado', 'revisado', 'aprobado');
