-- AlterTable
ALTER TABLE "PaymentRequest" ADD COLUMN     "emailMessage" TEXT,
ADD COLUMN     "sendEmailRequested" BOOLEAN NOT NULL DEFAULT false;
