/*
  Warnings:

  - You are about to drop the column `category` on the `ProfileRule` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `Prompt` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "PromptCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromptCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProfileRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryString" TEXT,
    "minCount" INTEGER NOT NULL DEFAULT 1,
    "maxCount" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfileRule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfileRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PromptCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProfileRule" ("id", "maxCount", "minCount", "profileId", "updatedAt") SELECT "id", "maxCount", "minCount", "profileId", "updatedAt" FROM "ProfileRule";
DROP TABLE "ProfileRule";
ALTER TABLE "new_ProfileRule" RENAME TO "ProfileRule";
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
    "categoryId" TEXT,
    "categoryString" TEXT NOT NULL DEFAULT 'General',
    CONSTRAINT "Prompt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Prompt_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PromptCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Prompt" ("content", "createdAt", "id", "isActive", "isGlobal", "options", "organizationId", "type", "updatedAt") SELECT "content", "createdAt", "id", "isActive", "isGlobal", "options", "organizationId", "type", "updatedAt" FROM "Prompt";
DROP TABLE "Prompt";
ALTER TABLE "new_Prompt" RENAME TO "Prompt";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PromptCategory_organizationId_name_key" ON "PromptCategory"("organizationId", "name");
