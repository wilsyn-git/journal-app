
import { prisma } from "@/lib/prisma"

async function main() {
    const profiles = await prisma.profile.findMany({
        include: { rules: true }
    })
    console.log(JSON.stringify(profiles, null, 2))
}

main()
