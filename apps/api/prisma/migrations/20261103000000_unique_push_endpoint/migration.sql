-- Una instalación PWA solo puede recibir notificaciones de la cuenta que la
-- vinculó más recientemente. Limpia asociaciones históricas duplicadas antes
-- de imponer la unicidad global del endpoint.
DELETE FROM "push_subscriptions" AS older
USING "push_subscriptions" AS newer
WHERE older."endpoint" = newer."endpoint"
  AND (
    older."created_at" < newer."created_at"
    OR (older."created_at" = newer."created_at" AND older."id" < newer."id")
  );

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key"
  ON "push_subscriptions"("endpoint");
