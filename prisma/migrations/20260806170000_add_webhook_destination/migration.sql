CREATE TABLE "WebhookDestination" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "encryptedSigningSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    CONSTRAINT "WebhookDestination_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookDestination_workspaceId_key" ON "WebhookDestination"("workspaceId");
ALTER TABLE "WebhookDestination" ADD CONSTRAINT "WebhookDestination_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
