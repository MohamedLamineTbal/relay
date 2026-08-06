ALTER TABLE "WebhookDeliveryAttempt"
  ADD COLUMN "replayedFromAttemptId" TEXT,
  ADD COLUMN "replayRequestedAt" TIMESTAMP(3),
  ADD COLUMN "replayRequestedByUserId" INTEGER;

CREATE INDEX "WebhookDeliveryAttempt_replayedFromAttemptId_idx" ON "WebhookDeliveryAttempt"("replayedFromAttemptId");
CREATE INDEX "WebhookDeliveryAttempt_replayRequestedByUserId_idx" ON "WebhookDeliveryAttempt"("replayRequestedByUserId");

ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_replayedFromAttemptId_fkey" FOREIGN KEY ("replayedFromAttemptId") REFERENCES "WebhookDeliveryAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_replayRequestedByUserId_fkey" FOREIGN KEY ("replayRequestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
