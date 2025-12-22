-- CreateTable
CREATE TABLE "TableSetting" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "tableKey" TEXT NOT NULL,
    "columnOrder" TEXT[],
    "columnVisibility" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TableSetting_userId_tableKey_key" ON "TableSetting"("userId", "tableKey");
