-- Unificar la distribución de catálogos compatibles sin mover las valoraciones.
BEGIN;
LOCK TABLE preparatory_programs IN SHARE ROW EXCLUSIVE MODE;

WITH programs AS (
  SELECT program.*,
         parallel.level_id,
         history.value_count,
         distribution.by_key
  FROM preparatory_programs AS program
  JOIN parallels AS parallel
    ON parallel.id = program.parallel_id
   AND parallel.institution_id = program.institution_id
   AND parallel.academic_year_id = program.academic_year_id
  JOIN levels AS level
    ON level.id = parallel.level_id
   AND level.institution_id = program.institution_id
   AND upper(trim(level.code)) = '1B'
  CROSS JOIN LATERAL (
    SELECT count(*) AS value_count
    FROM preparatory_values AS value
    WHERE value.program_id = program.id
  ) AS history
  CROSS JOIN LATERAL (
    SELECT jsonb_object_agg(item->>'key', item->'ambit') AS by_key
    FROM jsonb_array_elements(program.catalog) AS item
  ) AS distribution
),
grade_catalogs AS (
  SELECT DISTINCT ON (institution_id, academic_year_id, level_id)
         institution_id, academic_year_id, level_id, catalog_version, by_key
  FROM programs
  ORDER BY institution_id, academic_year_id, level_id,
           value_count DESC, reviewed_at DESC NULLS LAST, id
)
UPDATE preparatory_programs AS target
SET catalog = (
      SELECT jsonb_agg(jsonb_set(item, '{ambit}', source.by_key->(item->>'key')) ORDER BY position)
      FROM jsonb_array_elements(program.catalog) WITH ORDINALITY AS catalog(item, position)
    ),
    revision = target.revision + 1,
    updated_at = CURRENT_TIMESTAMP
FROM programs AS program
JOIN grade_catalogs AS source USING (institution_id, academic_year_id, level_id, catalog_version)
WHERE target.id = program.id
  AND program.value_count = 0
  AND program.by_key <> source.by_key
  AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(program.by_key) AS keys(key))
    = (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(source.by_key) AS keys(key));

COMMIT;
