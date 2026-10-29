#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/setup-local.mjs --env-only
# Select the existing local connection; do not switch an established environment.
db_service=$(node --input-type=module -e '
  import { readFileSync } from "node:fs";
  import { parseEnv } from "node:util";
  const env = parseEnv(readFileSync("apps/api/.env", "utf8"));
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    if (process.env[key] && process.env[key] !== env[key]) throw new Error(`${key} exportada en la terminal difiere de apps/api/.env; elimina ese override antes de arrancar`);
  }
  const url = new URL(env.DATABASE_URL);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("dev:local requiere una base local");
  if (url.port === "5434") console.log("postgres18");
  else if (url.port === "5433") console.log("postgres");
  else throw new Error("Puerto local no configurado en docker-compose.yml");
')
docker compose up -d --wait "$db_service"
echo "API: http://localhost:3000 | App: http://localhost:5173 | Landing: http://localhost:4321"
exec pnpm dev
