-- CreateIndex
CREATE INDEX "Prompt_organizationId_isActive_isGlobal_idx" ON "Prompt"("organizationId", "isActive", "isGlobal");

-- CreateIndex
CREATE INDEX "Prompt_organizationId_isActive_categoryId_idx" ON "Prompt"("organizationId", "isActive", "categoryId");
