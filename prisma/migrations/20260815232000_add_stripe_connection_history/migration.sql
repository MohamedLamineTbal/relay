-- Keep every Stripe account that has served a workspace so late provider
-- events from replaced accounts can still be attributed safely.
CREATE TYPE "StripeConnectionState" AS ENUM (
    'ACTIVE',
    'REPLACEMENT_PENDING',
    'REPLACED',
    'ABANDONED'
);

CREATE TABLE "StripeConnection" (
    "id" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "state" "StripeConnectionState" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "StripeConnection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentRequest"
ADD COLUMN "stripeConnectionId" TEXT;

CREATE UNIQUE INDEX "StripeConnection_providerAccountId_key"
ON "StripeConnection"("providerAccountId");

CREATE INDEX "StripeConnection_workspaceId_state_createdAt_idx"
ON "StripeConnection"("workspaceId", "state", "createdAt");

CREATE INDEX "PaymentRequest_stripeConnectionId_idx"
ON "PaymentRequest"("stripeConnectionId");

ALTER TABLE "StripeConnection"
ADD CONSTRAINT "StripeConnection_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentRequest"
ADD CONSTRAINT "PaymentRequest_stripeConnectionId_fkey"
FOREIGN KEY ("stripeConnectionId") REFERENCES "StripeConnection"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "StripeConnection" (
    "id",
    "providerAccountId",
    "state",
    "createdAt",
    "activatedAt",
    "workspaceId"
)
SELECT
    'legacy_' || md5("stripeAccountId"),
    "stripeAccountId",
    'ACTIVE'::"StripeConnectionState",
    "createdAt",
    "createdAt",
    "id"
FROM "Workspace"
WHERE "stripeAccountId" IS NOT NULL;

UPDATE "PaymentRequest" AS payment
SET "stripeConnectionId" = connection."id"
FROM "StripeConnection" AS connection
WHERE connection."workspaceId" = payment."workspaceId"
  AND connection."state" = 'ACTIVE'::"StripeConnectionState";
