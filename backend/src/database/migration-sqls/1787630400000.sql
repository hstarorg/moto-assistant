-- 1. 先增加兼容字段
ALTER TABLE "moto_assistant"."fuel_records"
ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE;

-- 2. 保留旧索引，先并发建立新索引
CREATE INDEX CONCURRENTLY "idx_fuel_records_moto_active_date_id"
ON "moto_assistant"."fuel_records" ("moto_id", "refuel_date", "id")
WHERE "deleted_at" IS NULL;

-- 3. 新索引有效后，再移除旧索引
DROP INDEX CONCURRENTLY
"moto_assistant"."idx_fuel_records_moto_date_id";