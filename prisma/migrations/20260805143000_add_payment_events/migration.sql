-- AlterEnum
ALTER TYPE "PaymentRequestStatus" ADD VALUE 'FAILED';
ALTER TYPE "PaymentRequestStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "PaymentRequestStatus" ADD VALUE 'REFUNDED';

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" SERIAL NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "resultingStatus" "PaymentRequestStatus",
    "providerCheckoutSessionId" TEXT,
    "providerPaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "paymentRequestId" INTEGER,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_workspaceId_idx" ON "PaymentEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentRequestId_occurredAt_idx" ON "PaymentEvent"("paymentRequestId", "occurredAt");

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
