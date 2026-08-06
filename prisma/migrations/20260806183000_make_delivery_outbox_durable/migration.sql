ALTER TYPE "WebhookDeliveryOutcome" ADD VALUE 'PENDING' BEFORE 'DELIVERED';
ALTER TABLE "WebhookDeliveryAttempt"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "eventType" TEXT,
  ADD COLUMN "paymentPublicId" TEXT,
  ADD COLUMN "paymentStatus" "PaymentRequestStatus",
  ADD COLUMN "payload" TEXT,
  ADD COLUMN "encryptedSigningSecret" TEXT,
  ALTER COLUMN "attemptedAt" DROP NOT NULL,
  ALTER COLUMN "attemptedAt" DROP DEFAULT;
UPDATE "WebhookDeliveryAttempt" AS attempt SET
  "eventType" = 'payment.' || lower(event."resultingStatus"::text),
  "paymentPublicId" = payment."publicId",
  "paymentStatus" = event."resultingStatus",
  "payload" = '{}',
  "encryptedSigningSecret" = destination."encryptedSigningSecret"
FROM "PaymentEvent" AS event, "PaymentRequest" AS payment, "WebhookDestination" AS destination
WHERE attempt."paymentEventId" = event."id"
  AND event."paymentRequestId" = payment."id"
  AND attempt."destinationId" = destination."id";
ALTER TABLE "WebhookDeliveryAttempt"
  ALTER COLUMN "eventType" SET NOT NULL,
  ALTER COLUMN "paymentPublicId" SET NOT NULL,
  ALTER COLUMN "paymentStatus" SET NOT NULL,
  ALTER COLUMN "payload" SET NOT NULL,
  ALTER COLUMN "encryptedSigningSecret" SET NOT NULL;
CREATE UNIQUE INDEX "WebhookDeliveryAttempt_paymentEventId_attemptNumber_key" ON "WebhookDeliveryAttempt"("paymentEventId", "attemptNumber");
