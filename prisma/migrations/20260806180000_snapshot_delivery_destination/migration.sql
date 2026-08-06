ALTER TABLE "WebhookDeliveryAttempt" ADD COLUMN "destinationUrl" TEXT;
UPDATE "WebhookDeliveryAttempt" AS attempt
SET "destinationUrl" = destination."url"
FROM "WebhookDestination" AS destination
WHERE attempt."destinationId" = destination."id";
ALTER TABLE "WebhookDeliveryAttempt" ALTER COLUMN "destinationUrl" SET NOT NULL;
