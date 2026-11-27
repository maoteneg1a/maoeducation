-- Configura los indicadores entregados por UEEU para el primer trimestre 2026-2027.
-- Las valoraciones existentes y las selecciones de otros periodos se conservan.
BEGIN;

-- Incorpora el octavo ámbito y su indicador único a los programas existentes.
UPDATE preparatory_programs AS program
SET catalog = program.catalog || jsonb_build_array(jsonb_build_object(
      'key', 'PROYECTO',
      'code', 'PROYECTO',
      'text', 'Proyecto',
      'ambit', 'project',
      'competencyCode', 'PROYECTO',
      'competencyText', 'Proyecto'
    )),
    catalog_version = 'auleka-preparatoria-indicators-2026-v2',
    ambit_teachers = jsonb_set(
      program.ambit_teachers,
      '{project}',
      COALESCE(program.ambit_teachers->'identity', to_jsonb(parallel.tutor_id)),
      true
    ),
    revision = program.revision + 1,
    updated_at = CURRENT_TIMESTAMP
FROM institutions AS institution,
     academic_years AS academic_year,
     parallels AS parallel,
     levels AS level
WHERE institution.id = program.institution_id
  AND upper(trim(institution.code)) = 'UEEU'
  AND academic_year.id = program.academic_year_id
  AND academic_year.institution_id = program.institution_id
  AND academic_year.name = '2026-2027'
  AND parallel.id = program.parallel_id
  AND parallel.institution_id = program.institution_id
  AND parallel.academic_year_id = program.academic_year_id
  AND level.id = parallel.level_id
  AND level.institution_id = program.institution_id
  AND upper(trim(level.code)) = '1B'
  AND NOT program.catalog @> '[{"key":"PROYECTO"}]'::jsonb;

WITH target_programs AS (
  SELECT program.id,
         period.id AS period_id,
         to_jsonb(ARRAY[
           'I.CI.1.1.1',
           'I.CI.0.9.26',
           'I.CI.0.9.27',
           'I.CI.0.9.28',
           'I.CI.1.2.1',
           'I.CI.1.2.2',
           'I.CI.1.8.1',
           'I.CI.1.8.2',
           'I.CI.1.8.3',
           'I.CI.1.13.1',
           'I.CI.1.13.2',
           'I.CI.1.13.3',
           'I.CI.1.13.4',
           'I.CI.1.14.1',
           'I.CI.1.15.1',
           'I.CI.1.15.2',
           'I.CI.1.15.3',
           'I.CI.1.18.1',
           'I.CI.1.18.2',
           'I.CI.1.21.1',
           'I.CI.1.21.2',
           'I.CI.1.22.1',
           'I.CI.1.22.2',
           'I.CI.1.23.1',
           'I.CI.1.23.2',
           'PROYECTO'
         ]::text[]) AS indicator_keys
  FROM preparatory_programs AS program
  JOIN institutions AS institution
    ON institution.id = program.institution_id
   AND upper(trim(institution.code)) = 'UEEU'
  JOIN academic_years AS academic_year
    ON academic_year.id = program.academic_year_id
   AND academic_year.institution_id = program.institution_id
   AND academic_year.name = '2026-2027'
  JOIN parallels AS parallel
    ON parallel.id = program.parallel_id
   AND parallel.institution_id = program.institution_id
   AND parallel.academic_year_id = program.academic_year_id
  JOIN levels AS level
    ON level.id = parallel.level_id
   AND level.institution_id = program.institution_id
   AND upper(trim(level.code)) = '1B'
  JOIN academic_periods AS period
    ON period.academic_year_id = program.academic_year_id
   AND period.period_number = 1
  WHERE 26 = (
    SELECT count(*)
    FROM jsonb_array_elements(program.catalog) AS expected(item)
    WHERE expected.item->>'key' = ANY (ARRAY[
      'I.CI.1.1.1', 'I.CI.0.9.26', 'I.CI.0.9.27', 'I.CI.0.9.28', 'I.CI.1.2.1',
      'I.CI.1.2.2', 'I.CI.1.8.1', 'I.CI.1.8.2', 'I.CI.1.8.3', 'I.CI.1.13.1',
      'I.CI.1.13.2', 'I.CI.1.13.3', 'I.CI.1.13.4', 'I.CI.1.14.1', 'I.CI.1.15.1',
      'I.CI.1.15.2', 'I.CI.1.15.3', 'I.CI.1.18.1', 'I.CI.1.18.2', 'I.CI.1.21.1',
      'I.CI.1.21.2', 'I.CI.1.22.1', 'I.CI.1.22.2', 'I.CI.1.23.1', 'I.CI.1.23.2',
      'PROYECTO'
    ]::text[])
  )
)
UPDATE preparatory_programs AS program
SET selections = jsonb_set(program.selections, ARRAY[target.period_id], target.indicator_keys, true),
    revision = program.revision + 1,
    updated_at = CURRENT_TIMESTAMP
FROM target_programs AS target
WHERE program.id = target.id
  AND program.selections->target.period_id IS DISTINCT FROM target.indicator_keys;

COMMIT;
