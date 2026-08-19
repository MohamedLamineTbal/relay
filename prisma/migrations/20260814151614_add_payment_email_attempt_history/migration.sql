-- CreateEnum
CREATE TYPE "PaymentEmailAttemptOutcome" AS ENUM ('SENT', 'TRANSIENT_FAILURE', 'PERMANENT_FAILURE');

-- DropIndex
DROP INDEX "PaymentEmailDelivery_status_createdAt_idx";

-- AlterTable
ALTER TABLE "PaymentEmailDelivery" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "PaymentEmailAttempt" (
    "id" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "outcome" "PaymentEmailAttemptOutcome" NOT NULL,
    "providerMessageId" TEXT,
    "failureCode" TEXT,
    "failureSummary" TEXT,
    "deliveryId" TEXT NOT NULL,

    CONSTRAINT "PaymentEmailAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentEmailAttempt_deliveryId_attemptedAt_idx" ON "PaymentEmailAttempt"("deliveryId", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEmailAttempt_deliveryId_attemptNumber_key" ON "PaymentEmailAttempt"("deliveryId", "attemptNumber");

-- CreateIndex
CREATE INDEX "PaymentEmailDelivery_status_nextAttemptAt_idx" ON "PaymentEmailDelivery"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "PaymentEmailAttempt" ADD CONSTRAINT "PaymentEmailAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "PaymentEmailDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
