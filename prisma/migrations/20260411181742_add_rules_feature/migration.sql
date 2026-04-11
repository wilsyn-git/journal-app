-- CreateTable
CREATE TABLE "RuleType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resetMode" TEXT NOT NULL,
    "resetDay" INTEGER,
    "resetIntervalDays" INTEGER,
    "resetIntervalStart" DATETIME,
    "organizationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RuleType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ruleTypeId" TEXT NOT NULL,
    "assignmentMode" TEXT NOT NULL DEFAULT 'USER',
    "groupId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Rule_ruleTypeId_fkey" FOREIGN KEY ("ruleTypeId") REFERENCES "RuleType" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Rule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Rule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RuleAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RuleAssignment_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RuleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RuleCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleAssignmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RuleCompletion_ruleAssignmentId_fkey" FOREIGN KEY ("ruleAssignmentId") REFERENCES "RuleAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RuleCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RuleCompletion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RuleType_organizationId_name_key" ON "RuleType"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Rule_ruleTypeId_sortOrder_idx" ON "Rule"("ruleTypeId", "sortOrder");

-- CreateIndex
CREATE INDEX "Rule_organizationId_idx" ON "Rule"("organizationId");

-- CreateIndex
CREATE INDEX "RuleAssignment_userId_idx" ON "RuleAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleAssignment_ruleId_userId_key" ON "RuleAssignment"("ruleId", "userId");

-- CreateIndex
CREATE INDEX "RuleCompletion_userId_ruleId_idx" ON "RuleCompletion"("userId", "ruleId");

-- CreateIndex
CREATE INDEX "RuleCompletion_ruleId_periodKey_idx" ON "RuleCompletion"("ruleId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "RuleCompletion_ruleAssignmentId_periodKey_key" ON "RuleCompletion"("ruleAssignmentId", "periodKey");
