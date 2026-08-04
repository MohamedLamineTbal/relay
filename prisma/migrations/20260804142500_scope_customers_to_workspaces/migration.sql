-- Create a workspace and owner membership for any users that predate workspaces.
INSERT INTO "Workspace" ("id", "name", "createdAt")
SELECT 'legacy-workspace-' || "User"."id", "User"."email", CURRENT_TIMESTAMP
FROM "User"
LEFT JOIN "WorkspaceMembership"
  ON "WorkspaceMembership"."userId" = "User"."id"
WHERE "WorkspaceMembership"."id" IS NULL;

INSERT INTO "WorkspaceMembership" ("role", "userId", "workspaceId", "createdAt")
SELECT 'OWNER', "User"."id", 'legacy-workspace-' || "User"."id", CURRENT_TIMESTAMP
FROM "User"
LEFT JOIN "WorkspaceMembership"
  ON "WorkspaceMembership"."userId" = "User"."id"
WHERE "WorkspaceMembership"."id" IS NULL;

-- Move customer ownership from users to their workspaces.
ALTER TABLE "Customer" ADD COLUMN "workspaceId" TEXT;

UPDATE "Customer"
SET "workspaceId" = "WorkspaceMembership"."workspaceId"
FROM "WorkspaceMembership"
WHERE "Customer"."userId" = "WorkspaceMembership"."userId";

ALTER TABLE "Customer" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_userId_fkey";
ALTER TABLE "Customer" DROP COLUMN "userId";

CREATE INDEX "Customer_workspaceId_idx" ON "Customer"("workspaceId");

ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
