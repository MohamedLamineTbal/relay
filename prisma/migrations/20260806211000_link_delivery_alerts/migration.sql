ALTER TABLE "Alert"
  ADD COLUMN "deliveryAttemptId" TEXT,
  ADD COLUMN "deliveryAttemptNumber" INTEGER;

CREATE INDEX "Alert_deliveryAttemptId_idx" ON "Alert"("deliveryAttemptId");
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_deliveryAttemptId_fkey" FOREIGN KEY ("deliveryAttemptId") REFERENCES "WebhookDeliveryAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
