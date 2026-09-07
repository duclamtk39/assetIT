-- CreateEnum
CREATE TYPE "SoaStatus" AS ENUM ('DRAFT', 'ISSUED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SoaDecision" AS ENUM ('APPLICABLE', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "ControlImplementation" AS ENUM ('NOT_STARTED', 'PLANNED', 'PARTIAL', 'IMPLEMENTED');

-- CreateEnum
CREATE TYPE "ComplianceDocumentType" AS ENUM ('POLICY', 'PROCEDURE', 'REGULATION', 'GUIDELINE', 'FORM', 'RECORD');

-- CreateEnum
CREATE TYPE "ComplianceDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'SUPERSEDED', 'WITHDRAWN');

-- DropIndex
DROP INDEX "assets_archivedAssetTag_idx";

-- DropIndex
DROP INDEX "assets_archivedBarcode_idx";

-- DropIndex
DROP INDEX "assets_currentCustodianId_idx";

-- AlterTable
ALTER TABLE "application_settings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "people" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "complianceAccess" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vendors" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "soa_versions" (
    "id" UUID NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "status" "SoaStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" TEXT NOT NULL,
    "note" TEXT,
    "issuedAt" DATE,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "soa_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soa_entries" (
    "id" UUID NOT NULL,
    "soaVersionId" UUID NOT NULL,
    "controlCode" VARCHAR(12) NOT NULL,
    "decision" "SoaDecision" NOT NULL DEFAULT 'APPLICABLE',
    "justification" TEXT NOT NULL,
    "implementation" "ControlImplementation" NOT NULL DEFAULT 'NOT_STARTED',
    "implementationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "soa_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_documents" (
    "id" UUID NOT NULL,
    "documentCode" VARCHAR(60) NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "type" "ComplianceDocumentType" NOT NULL,
    "status" "ComplianceDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" VARCHAR(20) NOT NULL,
    "summary" TEXT,
    "ownerId" UUID NOT NULL,
    "departmentId" UUID,
    "issuedAt" DATE,
    "effectiveFrom" DATE,
    "nextReviewAt" DATE,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "supersedesId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_document_files" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "storagePath" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksumSha256" VARCHAR(64) NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_document_controls" (
    "documentId" UUID NOT NULL,
    "controlCode" VARCHAR(12) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_document_controls_pkey" PRIMARY KEY ("documentId","controlCode")
);

-- CreateIndex
CREATE UNIQUE INDEX "soa_versions_version_key" ON "soa_versions"("version");

-- CreateIndex
CREATE INDEX "soa_versions_status_idx" ON "soa_versions"("status");

-- CreateIndex
CREATE INDEX "soa_entries_controlCode_idx" ON "soa_entries"("controlCode");

-- CreateIndex
CREATE UNIQUE INDEX "soa_entries_soaVersionId_controlCode_key" ON "soa_entries"("soaVersionId", "controlCode");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_documents_documentCode_key" ON "compliance_documents"("documentCode");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_documents_supersedesId_key" ON "compliance_documents"("supersedesId");

-- CreateIndex
CREATE INDEX "compliance_documents_status_nextReviewAt_idx" ON "compliance_documents"("status", "nextReviewAt");

-- CreateIndex
CREATE INDEX "compliance_documents_type_status_idx" ON "compliance_documents"("type", "status");

-- CreateIndex
CREATE INDEX "compliance_document_files_documentId_idx" ON "compliance_document_files"("documentId");

-- CreateIndex
CREATE INDEX "compliance_document_controls_controlCode_idx" ON "compliance_document_controls"("controlCode");

-- AddForeignKey
ALTER TABLE "soa_versions" ADD CONSTRAINT "soa_versions_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soa_versions" ADD CONSTRAINT "soa_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soa_entries" ADD CONSTRAINT "soa_entries_soaVersionId_fkey" FOREIGN KEY ("soaVersionId") REFERENCES "soa_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_documents" ADD CONSTRAINT "compliance_documents_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "compliance_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_document_files" ADD CONSTRAINT "compliance_document_files_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "compliance_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_document_files" ADD CONSTRAINT "compliance_document_files_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_document_controls" ADD CONSTRAINT "compliance_document_controls_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "compliance_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "digital_entitlements_externalProvider_externalTenantId_external" RENAME TO "digital_entitlements_externalProvider_externalTenantId_exte_key";
