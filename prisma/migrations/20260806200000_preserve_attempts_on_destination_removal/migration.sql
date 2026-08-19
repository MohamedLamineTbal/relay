ALTER TABLE "WebhookDeliveryAttempt" DROP CONSTRAINT "WebhookDeliveryAttempt_destinationId_fkey";
ALTER TABLE "WebhookDeliveryAttempt" ALTER COLUMN "destinationId" DROP NOT NULL;
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "WebhookDestination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
