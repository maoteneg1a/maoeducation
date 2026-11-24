CREATE TABLE "native_push_devices" (
  "token" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "native_push_devices_user_id_idx" ON "native_push_devices" ("user_id");
