-- An asset is either sitting in a warehouse or in somebody's hands, never both.
-- Recalling a held asset must go through a return so the assignment is closed and the
-- handover condition is recorded; a plain transfer may not put it back into stock.
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_custody_excludes_warehouse"
  CHECK ("warehouseId" IS NULL OR "currentCustodianId" IS NULL);
