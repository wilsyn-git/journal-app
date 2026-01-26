import { prisma } from "@/lib/prisma"

async function main() {
    console.log("Checking DB State...")
    const users = await prisma.user.findMany({ select: { email: true, role: true, organizationId: true } })
    console.log("Users:", JSON.stringify(users, null, 2))

    const orgs = await prisma.organization.findMany()
    console.log("Orgs:", JSON.stringify(orgs, null, 2))
}

main()
