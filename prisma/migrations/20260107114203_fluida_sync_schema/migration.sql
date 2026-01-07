-- CreateTable
CREATE TABLE "Stamping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fluidaId" TEXT NOT NULL,
    "companyId" TEXT,
    "contractId" TEXT,
    "userId" TEXT,
    "stampingAt" TIMESTAMP(3) NOT NULL,
    "dayKey" TEXT,
    "direction" TEXT,
    "deviceId" TEXT,
    "deviceType" TEXT,
    "subsidiaryId" TEXT,
    "note" TEXT,
    "raw" JSONB,
    "daySummaryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stamping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampingDaySummary" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT,
    "contractId" TEXT,
    "day" TIMESTAMP(3) NOT NULL,
    "costCenterId" TEXT,
    "shiftPlanId" TEXT,
    "plannedShift" TEXT,
    "plannedLocation" TEXT,
    "minutesWorked" INTEGER,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StampingDaySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampingChangeLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stampingId" TEXT NOT NULL,
    "fluidaId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "diff" JSONB NOT NULL,
    "changedFields" TEXT[],

    CONSTRAINT "StampingChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampingSyncState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "windowDays" INTEGER NOT NULL DEFAULT 14,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StampingSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampingSyncLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT,
    "status" TEXT NOT NULL,
    "rangeFrom" TIMESTAMP(3) NOT NULL,
    "rangeTo" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsFetched" INTEGER NOT NULL DEFAULT 0,
    "recordsInserted" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "StampingSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FluidaIntegrationSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,
    "apiKeyHeader" TEXT NOT NULL,
    "companyId" TEXT,
    "encryptedData" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FluidaIntegrationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stamping_organizationId_companyId_stampingAt_idx" ON "Stamping"("organizationId", "companyId", "stampingAt");

-- CreateIndex
CREATE INDEX "Stamping_organizationId_contractId_stampingAt_idx" ON "Stamping"("organizationId", "contractId", "stampingAt");

-- CreateIndex
CREATE INDEX "Stamping_organizationId_dayKey_idx" ON "Stamping"("organizationId", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "Stamping_organizationId_fluidaId_key" ON "Stamping"("organizationId", "fluidaId");

-- CreateIndex
CREATE UNIQUE INDEX "StampingDaySummary_organizationId_companyId_contractId_day_key" ON "StampingDaySummary"("organizationId", "companyId", "contractId", "day");

-- CreateIndex
CREATE INDEX "StampingChangeLog_organizationId_stampingId_idx" ON "StampingChangeLog"("organizationId", "stampingId");

-- CreateIndex
CREATE INDEX "StampingChangeLog_organizationId_fluidaId_idx" ON "StampingChangeLog"("organizationId", "fluidaId");

-- CreateIndex
CREATE UNIQUE INDEX "StampingSyncState_organizationId_key" ON "StampingSyncState"("organizationId");

-- CreateIndex
CREATE INDEX "StampingSyncLog_organizationId_startedAt_idx" ON "StampingSyncLog"("organizationId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FluidaIntegrationSettings_organizationId_key" ON "FluidaIntegrationSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "Stamping" ADD CONSTRAINT "Stamping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stamping" ADD CONSTRAINT "Stamping_daySummaryId_fkey" FOREIGN KEY ("daySummaryId") REFERENCES "StampingDaySummary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampingDaySummary" ADD CONSTRAINT "StampingDaySummary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampingChangeLog" ADD CONSTRAINT "StampingChangeLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampingChangeLog" ADD CONSTRAINT "StampingChangeLog_stampingId_fkey" FOREIGN KEY ("stampingId") REFERENCES "Stamping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampingSyncState" ADD CONSTRAINT "StampingSyncState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampingSyncLog" ADD CONSTRAINT "StampingSyncLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FluidaIntegrationSettings" ADD CONSTRAINT "FluidaIntegrationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
