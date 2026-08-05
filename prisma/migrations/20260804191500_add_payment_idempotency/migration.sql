-- AlterTable
ALTER TABLE "PaymentRequest"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "workspaceId" TEXT;

-- Backfill existing payment-request ownership from the customer relation.
UPDATE "PaymentRequest" AS payment
SET "workspaceId" = customer."workspaceId"
FROM "Customer" AS customer
WHERE payment."customerId" = customer."id";

ALTER TABLE "PaymentRequest"
ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_workspaceId_idempotencyKey_key"
ON "PaymentRequest"("workspaceId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "PaymentRequest"
ADD CONSTRAINT "PaymentRequest_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
