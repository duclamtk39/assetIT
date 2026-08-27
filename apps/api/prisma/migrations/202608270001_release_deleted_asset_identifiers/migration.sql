-- Preserve identifiers of soft-deleted assets while releasing active unique keys.
ALTER TABLE "assets"
  ADD COLUMN "archivedAssetTag" VARCHAR(100),
  ADD COLUMN "archivedBarcode" VARCHAR(150),
  ADD COLUMN "archivedSerialNumber" VARCHAR(150),
  ADD COLUMN "archivedSystemUuid" VARCHAR(100);

UPDATE "assets"
SET
  "archivedAssetTag" = "assetTag",
  "archivedBarcode" = "barcode",
  "archivedSerialNumber" = "serialNumber",
  "archivedSystemUuid" = "systemUuid",
  "assetTag" = 'DELETED-' || "id"::text,
  "barcode" = 'DELETED-' || "id"::text,
  "serialNumber" = NULL,
  "systemUuid" = NULL
WHERE "deletedAt" IS NOT NULL;

CREATE INDEX "assets_archivedAssetTag_idx" ON "assets"("archivedAssetTag");
CREATE INDEX "assets_archivedBarcode_idx" ON "assets"("archivedBarcode");
