import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

export async function createUserFixture(prisma: PrismaClient) {
  const org = await prisma.organization.create({
    data: { name: 'Test Org', code: `org-${randomUUID()}` },
  })
  const user = await prisma.user.create({
    data: {
      email: `user-${randomUUID()}@test.local`,
      password: 'not-a-real-hash',
      organizationId: org.id,
    },
  })
  const prompt = await prisma.prompt.create({
    data: { content: 'Test prompt', organizationId: org.id },
  })
  const secondPrompt = await prisma.prompt.create({
    data: { content: 'Second test prompt', organizationId: org.id },
  })
  return { org, user, prompt, secondPrompt }
}
