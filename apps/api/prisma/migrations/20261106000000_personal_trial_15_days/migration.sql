-- Las cuentas personales tienen 15 días de prueba sin período de gracia.
-- No modifica suscripciones pagadas ni instituciones normales.
UPDATE "subscriptions" AS s
SET
  "expires_at" = s."starts_at" + INTERVAL '15 days',
  "grace_days" = 0,
  "updated_at" = CURRENT_TIMESTAMP
FROM "institutions" AS i
WHERE i."id" = s."institution_id"
  AND i."settings" ->> 'accountType' = 'personal'
  AND s."plan" = 'trial';

-- Planificaciones y sus productos relacionados nacen ocultos. El
-- superadministrador puede volver a agregarlos desde la gestión de módulos.
UPDATE "institutions" AS i
SET "settings" = jsonb_set(
  i."settings",
  '{modules}',
  COALESCE(
    (
      SELECT jsonb_agg(module_rows.value)
      FROM jsonb_array_elements_text(COALESCE(i."settings" -> 'modules', '[]'::jsonb)) AS module_rows(value)
      WHERE module_rows.value NOT IN ('planning', 'interdisciplinary_projects', 'reinforcement_plans')
    ),
    '[]'::jsonb
  ),
  true
)
WHERE i."settings" ->> 'accountType' = 'personal';
