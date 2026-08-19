-- AlterTable
ALTER TABLE "PaymentRequest"
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'usd',
ADD COLUMN "checkoutUrl" TEXT,
ADD COLUMN "providerCheckoutSessionId" TEXT,
ADD COLUMN "providerPaymentIntentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_providerCheckoutSessionId_key"
ON "PaymentRequest"("providerCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_providerPaymentIntentId_key"
ON "PaymentRequest"("providerPaymentIntentId");
