CREATE TABLE "platform_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
