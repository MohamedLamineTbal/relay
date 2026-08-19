ALTER TABLE "WebhookDeliveryAttempt" DROP CONSTRAINT "WebhookDeliveryAttempt_replayRequestedByUserId_fkey";
DROP INDEX "WebhookDeliveryAttempt_replayRequestedByUserId_idx";
ALTER TABLE "WebhookDeliveryAttempt" ADD COLUMN "replayRequestedByEmail" TEXT;
UPDATE "WebhookDeliveryAttempt" AS attempt
SET "replayRequestedByEmail" = requester."email"
FROM "User" AS requester
WHERE attempt."replayRequestedByUserId" = requester."id";
