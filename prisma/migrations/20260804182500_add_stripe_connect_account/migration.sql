ALTER TABLE "Workspace" ADD COLUMN "stripeAccountId" TEXT;

CREATE UNIQUE INDEX "Workspace_stripeAccountId_key"
ON "Workspace"("stripeAccountId");
