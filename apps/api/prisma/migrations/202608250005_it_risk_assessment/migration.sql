CREATE TYPE "RiskAssessmentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'TREATMENT', 'MONITORING', 'CLOSED', 'CANCELLED');
CREATE TYPE "RiskItemStatus" AS ENUM ('IDENTIFIED', 'ASSESSED', 'TREATMENT_PLANNED', 'TREATING', 'MONITORING', 'ACCEPTED', 'CLOSED');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "RiskTreatmentStrategy" AS ENUM ('AVOID', 'MITIGATE', 'TRANSFER', 'ACCEPT');
CREATE TYPE "RiskTreatmentStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "RiskControlStatus" AS ENUM ('PLANNED', 'PARTIAL', 'IMPLEMENTED', 'INEFFECTIVE', 'NOT_APPLICABLE');
CREATE TYPE "RiskReviewDecision" AS ENUM ('SUBMIT', 'RETURN_FOR_CHANGES', 'APPROVE', 'ACCEPT_RESIDUAL', 'CLOSE');
CREATE TYPE "RiskSource" AS ENUM ('MANUAL', 'INCIDENT', 'DISCOVERY', 'AUDIT', 'VENDOR');

CREATE TABLE "risk_assessments" (
  "id" UUID NOT NULL,
  "assessmentNo" VARCHAR(50) NOT NULL,
  "title" VARCHAR(250) NOT NULL,
  "description" TEXT,
  "scope" TEXT NOT NULL,
  "methodology" VARCHAR(80) NOT NULL DEFAULT 'ISO_27005_NIST_800_30',
  "status" "RiskAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "ownerId" UUID NOT NULL,
  "approverId" UUID,
  "departmentId" UUID,
  "startDate" DATE NOT NULL,
  "targetDate" DATE,
  "nextReviewAt" DATE,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "risk_items" (
  "id" UUID NOT NULL,
  "riskNo" VARCHAR(50) NOT NULL,
  "assessmentId" UUID NOT NULL,
  "title" VARCHAR(250) NOT NULL,
  "category" VARCHAR(100) NOT NULL,
  "scenario" TEXT NOT NULL,
  "threat" TEXT NOT NULL,
  "vulnerability" TEXT NOT NULL,
  "existingControls" TEXT,
  "source" "RiskSource" NOT NULL DEFAULT 'MANUAL',
  "status" "RiskItemStatus" NOT NULL DEFAULT 'IDENTIFIED',
  "likelihood" INTEGER NOT NULL,
  "impact" INTEGER NOT NULL,
  "inherentScore" INTEGER NOT NULL,
  "inherentLevel" "RiskLevel" NOT NULL,
  "residualLikelihood" INTEGER,
  "residualImpact" INTEGER,
  "residualScore" INTEGER,
  "residualLevel" "RiskLevel",
  "treatmentStrategy" "RiskTreatmentStrategy" NOT NULL DEFAULT 'MITIGATE',
  "acceptanceRationale" TEXT,
  "ownerId" UUID NOT NULL,
  "departmentId" UUID,
  "dueDate" DATE,
  "nextReviewAt" DATE,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "risk_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_items_likelihood_check" CHECK ("likelihood" BETWEEN 1 AND 5),
  CONSTRAINT "risk_items_impact_check" CHECK ("impact" BETWEEN 1 AND 5),
  CONSTRAINT "risk_items_inherent_score_check" CHECK ("inherentScore" BETWEEN 1 AND 25),
  CONSTRAINT "risk_items_residual_likelihood_check" CHECK ("residualLikelihood" IS NULL OR "residualLikelihood" BETWEEN 1 AND 5),
  CONSTRAINT "risk_items_residual_impact_check" CHECK ("residualImpact" IS NULL OR "residualImpact" BETWEEN 1 AND 5),
  CONSTRAINT "risk_items_residual_score_check" CHECK ("residualScore" IS NULL OR "residualScore" BETWEEN 1 AND 25)
);

CREATE TABLE "risk_assets" (
  "riskId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "risk_assets_pkey" PRIMARY KEY ("riskId", "assetId")
);

CREATE TABLE "risk_incidents" (
  "riskId" UUID NOT NULL,
  "incidentId" UUID NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "risk_incidents_pkey" PRIMARY KEY ("riskId", "incidentId")
);

CREATE TABLE "risk_controls" (
  "id" UUID NOT NULL,
  "riskId" UUID NOT NULL,
  "controlCode" VARCHAR(80),
  "title" VARCHAR(250) NOT NULL,
  "description" TEXT,
  "framework" VARCHAR(100),
  "status" "RiskControlStatus" NOT NULL DEFAULT 'PLANNED',
  "effectiveness" INTEGER,
  "evidence" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "risk_controls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_controls_effectiveness_check" CHECK ("effectiveness" IS NULL OR "effectiveness" BETWEEN 0 AND 100)
);

CREATE TABLE "risk_treatment_actions" (
  "id" UUID NOT NULL,
  "riskId" UUID NOT NULL,
  "title" VARCHAR(250) NOT NULL,
  "description" TEXT,
  "status" "RiskTreatmentStatus" NOT NULL DEFAULT 'PLANNED',
  "assigneeId" UUID NOT NULL,
  "dueDate" DATE NOT NULL,
  "completedAt" TIMESTAMP(3),
  "progress" INTEGER NOT NULL DEFAULT 0,
  "outcome" TEXT,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "risk_treatment_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_treatment_progress_check" CHECK ("progress" BETWEEN 0 AND 100)
);

CREATE TABLE "risk_reviews" (
  "id" UUID NOT NULL,
  "assessmentId" UUID,
  "riskId" UUID,
  "decision" "RiskReviewDecision" NOT NULL,
  "note" TEXT NOT NULL,
  "reviewedBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "risk_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_reviews_target_check" CHECK (("assessmentId" IS NOT NULL) OR ("riskId" IS NOT NULL))
);

CREATE UNIQUE INDEX "risk_assessments_assessmentNo_key" ON "risk_assessments"("assessmentNo");
CREATE INDEX "risk_assessments_status_targetDate_idx" ON "risk_assessments"("status", "targetDate");
CREATE INDEX "risk_assessments_ownerId_status_idx" ON "risk_assessments"("ownerId", "status");
CREATE INDEX "risk_assessments_departmentId_status_idx" ON "risk_assessments"("departmentId", "status");
CREATE UNIQUE INDEX "risk_items_riskNo_key" ON "risk_items"("riskNo");
CREATE INDEX "risk_items_assessmentId_status_idx" ON "risk_items"("assessmentId", "status");
CREATE INDEX "risk_items_inherentLevel_residualLevel_idx" ON "risk_items"("inherentLevel", "residualLevel");
CREATE INDEX "risk_items_ownerId_dueDate_idx" ON "risk_items"("ownerId", "dueDate");
CREATE INDEX "risk_items_departmentId_status_idx" ON "risk_items"("departmentId", "status");
CREATE INDEX "risk_assets_assetId_idx" ON "risk_assets"("assetId");
CREATE INDEX "risk_incidents_incidentId_idx" ON "risk_incidents"("incidentId");
CREATE INDEX "risk_controls_riskId_status_idx" ON "risk_controls"("riskId", "status");
CREATE INDEX "risk_treatment_actions_riskId_status_idx" ON "risk_treatment_actions"("riskId", "status");
CREATE INDEX "risk_treatment_actions_assigneeId_dueDate_status_idx" ON "risk_treatment_actions"("assigneeId", "dueDate", "status");
CREATE INDEX "risk_reviews_assessmentId_createdAt_idx" ON "risk_reviews"("assessmentId", "createdAt");
CREATE INDEX "risk_reviews_riskId_createdAt_idx" ON "risk_reviews"("riskId", "createdAt");

ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_items" ADD CONSTRAINT "risk_items_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_items" ADD CONSTRAINT "risk_items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_items" ADD CONSTRAINT "risk_items_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_items" ADD CONSTRAINT "risk_items_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_assets" ADD CONSTRAINT "risk_assets_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risk_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_assets" ADD CONSTRAINT "risk_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_incidents" ADD CONSTRAINT "risk_incidents_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risk_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_incidents" ADD CONSTRAINT "risk_incidents_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risk_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_treatment_actions" ADD CONSTRAINT "risk_treatment_actions_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risk_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_treatment_actions" ADD CONSTRAINT "risk_treatment_actions_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_treatment_actions" ADD CONSTRAINT "risk_treatment_actions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "risk_reviews" ADD CONSTRAINT "risk_reviews_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_reviews" ADD CONSTRAINT "risk_reviews_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risk_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_reviews" ADD CONSTRAINT "risk_reviews_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
