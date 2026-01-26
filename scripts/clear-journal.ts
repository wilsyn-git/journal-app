import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🗑️  Clearing Journal Entries (Stats will reset)...')

    // Delete all journal entries
    const { count } = await prisma.journalEntry.deleteMany({})

    console.log(`✅ Deleted ${count} journal entries.`)
    console.log('   Users, Prompts, and Profiles remain untouched.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
