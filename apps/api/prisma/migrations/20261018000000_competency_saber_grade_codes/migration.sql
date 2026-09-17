-- Granularidad por grado individual (fuente: TIGA) para los saberes de una
-- competencia. Retrocompatible: array vacío (default) = aplica a todos los
-- grados del subnivel de la competencia (comportamiento histórico, sin
-- filtro). El importador de granularidad (scripts/import-tiga-grade-granularity.ts)
-- llena este array con códigos de Level.code (ej. "5B","6B") solo para los
-- saberes donde TIGA distingue grado dentro del subnivel.
ALTER TABLE "competency_sabers" ADD COLUMN "grade_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
