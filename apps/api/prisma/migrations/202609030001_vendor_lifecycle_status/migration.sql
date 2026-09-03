ALTER TABLE "vendors" ADD COLUMN "lifecycleStatus" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

UPDATE "vendors"
SET "lifecycleStatus" = 'SUSPENDED', "status" = 'Chưa đánh giá'
WHERE "status" = 'Tạm ngưng';

ALTER TABLE "vendors"
ADD CONSTRAINT "vendors_lifecycleStatus_check"
CHECK ("lifecycleStatus" IN ('ACTIVE', 'SUSPENDED', 'BLOCKED'));
