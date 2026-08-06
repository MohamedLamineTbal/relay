CREATE TYPE "AlertType" AS ENUM ('PAYMENT_PROCESSING_FAILED', 'WEBHOOK_DELIVERY_FAILED');
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED');

CREATE TABLE "Alert" (
  "id" TEXT NOT NULL,
  "type" "AlertType" NOT NULL,
  "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
  "deduplicationKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedByUserId" INTEGER,
  "acknowledgedByEmail" TEXT,
  "workspaceId" TEXT NOT NULL,
  "paymentRequestId" INTEGER,
  "paymentPublicId" TEXT,
  CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Alert_deduplicationKey_key" ON "Alert"("deduplicationKey");
CREATE INDEX "Alert_workspaceId_status_createdAt_idx" ON "Alert"("workspaceId", "status", "createdAt");
CREATE INDEX "Alert_paymentRequestId_idx" ON "Alert"("paymentRequestId");

ALTER TABLE "Alert" ADD CONSTRAINT "Alert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
