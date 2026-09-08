-- CreateEnum
CREATE TYPE "NetworkProbeMethod" AS ENUM ('ICMP', 'TCP_PORT', 'BOTH');

-- CreateEnum
CREATE TYPE "NetworkDeviceStatus" AS ENUM ('UNKNOWN', 'UP', 'DOWN', 'PAUSED');

-- CreateEnum
CREATE TYPE "NetworkScanStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NetworkAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "network_subnets" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "cidr" VARCHAR(43) NOT NULL,
    "vlanId" INTEGER,
    "description" VARCHAR(500),
    "locationId" UUID,
    "departmentId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "probeMethod" "NetworkProbeMethod" NOT NULL DEFAULT 'BOTH',
    "tcpPorts" INTEGER[] DEFAULT ARRAY[445, 3389, 80, 443, 22, 554, 9100]::INTEGER[],
    "scanIntervalMinutes" INTEGER NOT NULL DEFAULT 360,
    "checkIntervalSeconds" INTEGER NOT NULL DEFAULT 120,
    "failureThreshold" INTEGER NOT NULL DEFAULT 3,
    "lastScanAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_subnets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_devices" (
    "id" UUID NOT NULL,
    "subnetId" UUID NOT NULL,
    "ipAddress" VARCHAR(45) NOT NULL,
    "macAddress" VARCHAR(17),
    "hostname" VARCHAR(255),
    "vendor" VARCHAR(120),
    "label" VARCHAR(200),
    "note" VARCHAR(1000),
    "assetId" UUID,
    "monitored" BOOLEAN NOT NULL DEFAULT true,
    "status" "NetworkDeviceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "openPorts" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "responseTimeMs" INTEGER,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "linkedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_events" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "fromStatus" "NetworkDeviceStatus" NOT NULL,
    "toStatus" "NetworkDeviceStatus" NOT NULL,
    "responseTimeMs" INTEGER,
    "detail" VARCHAR(500),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_samples" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "checks" INTEGER NOT NULL DEFAULT 0,
    "successes" INTEGER NOT NULL DEFAULT 0,
    "avgResponseMs" INTEGER,
    "maxResponseMs" INTEGER,

    CONSTRAINT "network_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_scans" (
    "id" UUID NOT NULL,
    "subnetId" UUID NOT NULL,
    "status" "NetworkScanStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "hostsProbed" INTEGER NOT NULL DEFAULT 0,
    "hostsAnswered" INTEGER NOT NULL DEFAULT 0,
    "devicesAdded" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(1000),
    "triggeredBy" UUID,

    CONSTRAINT "network_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_alerts" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "status" "NetworkAlertStatus" NOT NULL DEFAULT 'OPEN',
    "downSince" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" UUID,
    "note" VARCHAR(1000),
    "incidentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "network_subnets_cidr_key" ON "network_subnets"("cidr");

-- CreateIndex
CREATE INDEX "network_subnets_enabled_lastScanAt_idx" ON "network_subnets"("enabled", "lastScanAt");

-- CreateIndex
CREATE INDEX "network_devices_status_monitored_idx" ON "network_devices"("status", "monitored");

-- CreateIndex
CREATE INDEX "network_devices_macAddress_idx" ON "network_devices"("macAddress");

-- CreateIndex
CREATE INDEX "network_devices_assetId_idx" ON "network_devices"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "network_devices_subnetId_ipAddress_key" ON "network_devices"("subnetId", "ipAddress");

-- CreateIndex
CREATE INDEX "network_events_deviceId_occurredAt_idx" ON "network_events"("deviceId", "occurredAt");

-- CreateIndex
CREATE INDEX "network_events_occurredAt_idx" ON "network_events"("occurredAt");

-- CreateIndex
CREATE INDEX "network_samples_bucketStart_idx" ON "network_samples"("bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "network_samples_deviceId_bucketStart_key" ON "network_samples"("deviceId", "bucketStart");

-- CreateIndex
CREATE INDEX "network_scans_subnetId_startedAt_idx" ON "network_scans"("subnetId", "startedAt");

-- CreateIndex
CREATE INDEX "network_alerts_status_downSince_idx" ON "network_alerts"("status", "downSince");

-- CreateIndex
CREATE INDEX "network_alerts_deviceId_status_idx" ON "network_alerts"("deviceId", "status");

-- AddForeignKey
ALTER TABLE "network_subnets" ADD CONSTRAINT "network_subnets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_subnets" ADD CONSTRAINT "network_subnets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_subnets" ADD CONSTRAINT "network_subnets_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_devices" ADD CONSTRAINT "network_devices_subnetId_fkey" FOREIGN KEY ("subnetId") REFERENCES "network_subnets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_devices" ADD CONSTRAINT "network_devices_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_devices" ADD CONSTRAINT "network_devices_linkedBy_fkey" FOREIGN KEY ("linkedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_events" ADD CONSTRAINT "network_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "network_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_samples" ADD CONSTRAINT "network_samples_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "network_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_scans" ADD CONSTRAINT "network_scans_subnetId_fkey" FOREIGN KEY ("subnetId") REFERENCES "network_subnets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_scans" ADD CONSTRAINT "network_scans_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_alerts" ADD CONSTRAINT "network_alerts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "network_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_alerts" ADD CONSTRAINT "network_alerts_acknowledgedBy_fkey" FOREIGN KEY ("acknowledgedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_alerts" ADD CONSTRAINT "network_alerts_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

