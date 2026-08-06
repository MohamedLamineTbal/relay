CREATE TYPE "WebhookDeliveryOutcome" AS ENUM ('DELIVERED', 'FAILED');
CREATE TABLE "WebhookDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome" "WebhookDeliveryOutcome" NOT NULL,
  "responseStatus" INTEGER,
  "failureSummary" TEXT,
  "workspaceId" TEXT NOT NULL,
  "destinationId" INTEGER NOT NULL,
  "paymentEventId" INTEGER NOT NULL,
  CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WebhookDeliveryAttempt_workspaceId_attemptedAt_idx" ON "WebhookDeliveryAttempt"("workspaceId", "attemptedAt");
CREATE INDEX "WebhookDeliveryAttempt_paymentEventId_idx" ON "WebhookDeliveryAttempt"("paymentEventId");
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "WebhookDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_paymentEventId_fkey" FOREIGN KEY ("paymentEventId") REFERENCES "PaymentEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
