-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMembership" (
    "id" SERIAL NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembership_userId_key" ON "WorkspaceMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembership_userId_workspaceId_key" ON "WorkspaceMembership"("userId", "workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
