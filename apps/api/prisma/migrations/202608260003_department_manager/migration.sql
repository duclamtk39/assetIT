ALTER TABLE "departments"
ADD COLUMN "managerPersonId" UUID;

CREATE INDEX "departments_managerPersonId_idx"
ON "departments"("managerPersonId");

ALTER TABLE "departments"
ADD CONSTRAINT "departments_managerPersonId_fkey"
FOREIGN KEY ("managerPersonId") REFERENCES "people"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
