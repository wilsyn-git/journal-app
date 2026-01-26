/*
  Warnings:

  - You are about to drop the `_ProfileToPrompt` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "_ProfileToPrompt_B_index";

-- DropIndex
DROP INDEX "_ProfileToPrompt_AB_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_ProfileToPrompt";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ProfileRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "minCount" INTEGER NOT NULL DEFAULT 1,
    "maxCount" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfileRule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Prompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "options" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'default-org-id',
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL DEFAULT 'General',
    CONSTRAINT "Prompt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Prompt" ("content", "createdAt", "id", "isActive", "isGlobal", "options", "organizationId", "type", "updatedAt") SELECT "content", "createdAt", "id", "isActive", "isGlobal", "options", "organizationId", "type", "updatedAt" FROM "Prompt";
DROP TABLE "Prompt";
ALTER TABLE "new_Prompt" RENAME TO "Prompt";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
