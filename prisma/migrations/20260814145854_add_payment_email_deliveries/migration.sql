-- CreateEnum
CREATE TYPE "PaymentEmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "PaymentEmailDelivery" (
    "id" TEXT NOT NULL,
    "status" "PaymentEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "recipientEmail" TEXT NOT NULL,
    "ownerMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "failureSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "requestedByUserId" INTEGER NOT NULL,
    "requestedByEmail" TEXT NOT NULL,
    "paymentRequestId" INTEGER NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "PaymentEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEmailDelivery_idempotencyKey_key" ON "PaymentEmailDelivery"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentEmailDelivery_workspaceId_createdAt_idx" ON "PaymentEmailDelivery"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentEmailDelivery_paymentRequestId_createdAt_idx" ON "PaymentEmailDelivery"("paymentRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentEmailDelivery_status_createdAt_idx" ON "PaymentEmailDelivery"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentEmailDelivery" ADD CONSTRAINT "PaymentEmailDelivery_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEmailDelivery" ADD CONSTRAINT "PaymentEmailDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
