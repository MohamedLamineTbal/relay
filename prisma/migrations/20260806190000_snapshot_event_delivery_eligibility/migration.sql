ALTER TABLE "PaymentEvent"
  ADD COLUMN "outboundDestinationId" INTEGER,
  ADD COLUMN "outboundDestinationUrl" TEXT,
  ADD COLUMN "outboundEncryptedSigningSecret" TEXT;
