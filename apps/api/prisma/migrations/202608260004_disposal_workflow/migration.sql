CREATE TYPE "DisposalType" AS ENUM ('SALE', 'DONATION', 'RETURN_TO_VENDOR', 'RECYCLE', 'DESTRUCTION', 'OTHER');
CREATE TYPE "DisposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'IN_EXECUTION', 'COMPLETED', 'CANCELLED');
CREATE TYPE "DataSanitizationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'VERIFIED', 'FAILED');
CREATE TYPE "DisposalEvidenceType" AS ENUM ('APPROVAL_DOCUMENT', 'DATA_ERASURE_CERTIFICATE', 'DESTRUCTION_CERTIFICATE', 'SALE_CONTRACT', 'HANDOVER_MINUTES', 'PHOTO', 'OTHER');

CREATE TABLE "disposal_cases" (
  "id" UUID NOT NULL,
  "disposalNo" VARCHAR(50) NOT NULL,
  "title" VARCHAR(250) NOT NULL,
  "type" "DisposalType" NOT NULL,
  "status" "DisposalStatus" NOT NULL DEFAULT 'DRAFT',
  "reason" TEXT NOT NULL,
  "policyReference" VARCHAR(1000) NOT NULL,
  "recipient" VARCHAR(250),
  "vendorReference" VARCHAR(250),
  "estimatedProceeds" DECIMAL(18,2),
  "actualProceeds" DECIMAL(18,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "requestedBy" UUID NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "approvedBy" UUID,
  "approvedAt" TIMESTAMP(3),
  "approvalNote" TEXT,
  "rejectionReason" TEXT,
  "executedBy" UUID,
  "executionStartedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "completionNote" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "disposal_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "disposal_items" (
  "id" UUID NOT NULL,
  "disposalId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "conditionAssessment" VARCHAR(2000) NOT NULL,
  "requiresDataSanitization" BOOLEAN NOT NULL DEFAULT false,
  "sanitizationStatus" "DataSanitizationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "sanitizationMethod" VARCHAR(1000),
  "sanitizedBy" UUID,
  "sanitizedAt" TIMESTAMP(3),
  "assetSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "disposal_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "disposal_evidence" (
  "id" UUID NOT NULL,
  "disposalId" UUID NOT NULL,
  "type" "DisposalEvidenceType" NOT NULL,
  "title" VARCHAR(250) NOT NULL,
  "documentNo" VARCHAR(150),
  "documentDate" DATE,
  "storagePath" VARCHAR(2000) NOT NULL,
  "checksumSha256" VARCHAR(64),
  "note" TEXT,
  "uploadedBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "disposal_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "disposal_activities" (
  "id" UUID NOT NULL,
  "disposalId" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "note" TEXT,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "disposal_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "disposal_cases_disposalNo_key" ON "disposal_cases"("disposalNo");
CREATE INDEX "disposal_cases_status_createdAt_idx" ON "disposal_cases"("status", "createdAt");
CREATE INDEX "disposal_cases_type_status_idx" ON "disposal_cases"("type", "status");
CREATE UNIQUE INDEX "disposal_items_disposalId_assetId_key" ON "disposal_items"("disposalId", "assetId");
CREATE INDEX "disposal_items_assetId_createdAt_idx" ON "disposal_items"("assetId", "createdAt");
CREATE INDEX "disposal_evidence_disposalId_type_idx" ON "disposal_evidence"("disposalId", "type");
CREATE INDEX "disposal_activities_disposalId_createdAt_idx" ON "disposal_activities"("disposalId", "createdAt");

ALTER TABLE "disposal_cases" ADD CONSTRAINT "disposal_cases_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disposal_cases" ADD CONSTRAINT "disposal_cases_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disposal_cases" ADD CONSTRAINT "disposal_cases_executedBy_fkey" FOREIGN KEY ("executedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disposal_items" ADD CONSTRAINT "disposal_items_disposalId_fkey" FOREIGN KEY ("disposalId") REFERENCES "disposal_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disposal_items" ADD CONSTRAINT "disposal_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disposal_items" ADD CONSTRAINT "disposal_items_sanitizedBy_fkey" FOREIGN KEY ("sanitizedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disposal_evidence" ADD CONSTRAINT "disposal_evidence_disposalId_fkey" FOREIGN KEY ("disposalId") REFERENCES "disposal_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disposal_evidence" ADD CONSTRAINT "disposal_evidence_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disposal_activities" ADD CONSTRAINT "disposal_activities_disposalId_fkey" FOREIGN KEY ("disposalId") REFERENCES "disposal_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disposal_activities" ADD CONSTRAINT "disposal_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
