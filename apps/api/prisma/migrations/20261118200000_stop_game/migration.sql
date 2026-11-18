-- Invitados y salas de juego independientes de las cuentas escolares.
CREATE TABLE "stop_game_rooms" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(6) NOT NULL,
  "state" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stop_game_rooms_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "stop_game_guests" (
  "id" TEXT NOT NULL,
  "room_id" TEXT NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stop_game_guests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stop_game_rooms_code_key" ON "stop_game_rooms"("code");
CREATE INDEX "stop_game_rooms_expires_at_idx" ON "stop_game_rooms"("expires_at");
CREATE UNIQUE INDEX "stop_game_guests_token_hash_key" ON "stop_game_guests"("token_hash");
CREATE INDEX "stop_game_guests_room_id_idx" ON "stop_game_guests"("room_id");
ALTER TABLE "stop_game_guests" ADD CONSTRAINT "stop_game_guests_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "stop_game_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
