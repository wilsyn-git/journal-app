import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

/**
 * Creates a test user with:
 * - 2 streak freezes in inventory
 * - A streak of ~20 consecutive journal days ending 2 days ago
 * - Yesterday missed (gap day)
 * - Today: no entry yet (user just returned)
 *
 * This allows testing the streak freeze banner and recovery flow.
 */
async function main() {
    const password = await bcrypt.hash('testfreeze123', 10)

    // Find the default org
    const org = await prisma.organization.findFirst({
        where: { code: 'default' },
    })
    if (!org) throw new Error('Default organization not found. Run prisma seed first.')

    // Find a prompt to create entries against
    const prompt = await prisma.prompt.findFirst({
        where: { organizationId: org.id, type: 'TEXT' },
    })
    if (!prompt) throw new Error('No TEXT prompt found. Run prisma seed first.')

    // Create or update the test user
    const user = await prisma.user.upsert({
        where: { email: 'freezetest@example.com' },
        update: { password, organizationId: org.id },
        create: {
            email: 'freezetest@example.com',
            name: 'Freeze Tester',
            password,
            role: 'USER',
            organizationId: org.id,
            timezone: 'America/New_York',
        },
    })

    console.log(`User: ${user.email} (${user.id})`)

    // Clean up any existing test data for this user
    await prisma.journalEntry.deleteMany({ where: { userId: user.id } })
    await prisma.userInventory.deleteMany({ where: { userId: user.id } })
    await prisma.streakFreezeUsage.deleteMany({ where: { userId: user.id } })

    // Create journal entries for 20 consecutive days ending 2 days ago
    const now = new Date()
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const today = new Date(todayStr + 'T12:00:00Z')

    // 2 days ago is the last journal day
    const lastJournalDay = new Date(today.getTime() - 2 * 24 * 3600 * 1000)

    const entries = []
    for (let i = 0; i < 20; i++) {
        const entryDate = new Date(lastJournalDay.getTime() - i * 24 * 3600 * 1000)
        // Set time to noon for the entry
        entryDate.setUTCHours(17, 0, 0, 0) // 5pm UTC = noon EST

        entries.push({
            userId: user.id,
            promptId: prompt.id,
            answer: `Test journal entry for day ${20 - i} of my streak. Feeling good about consistency.`,
            date: entryDate,
            createdAt: entryDate,
            updatedAt: entryDate,
        })
    }

    // Bulk create entries
    for (const entry of entries) {
        await prisma.journalEntry.create({ data: entry })
    }
    console.log(`Created ${entries.length} journal entries (20-day streak ending 2 days ago)`)

    // Create inventory with 2 freezes
    await prisma.userInventory.create({
        data: {
            userId: user.id,
            itemType: 'STREAK_FREEZE',
            quantity: 2,
            metadata: JSON.stringify({ earningCounter: 6 }),
        },
    })
    console.log('Created inventory: 2 streak freezes, earning counter at 6/14')

    // Assign user to a profile/group so they see prompts
    const profile = await prisma.profile.findFirst({
        where: { organizationId: org.id },
    })
    if (profile) {
        await prisma.profile.update({
            where: { id: profile.id },
            data: { users: { connect: { id: user.id } } },
        })
        console.log(`Assigned to profile: ${profile.name}`)
    }

    const group = await prisma.userGroup.findFirst({
        where: { organizationId: org.id },
    })
    if (group) {
        await prisma.userGroup.update({
            where: { id: group.id },
            data: { users: { connect: { id: user.id } } },
        })
        console.log(`Assigned to group: ${group.name}`)
    }

    console.log('\n--- Test Scenario Ready ---')
    console.log(`Login: freezetest@example.com / testfreeze123`)
    console.log(`Expected: Dashboard shows freeze banner for 1 missed day (yesterday)`)
    console.log(`Expected: Streak badge shows ~20 with freeze count of 2`)
    console.log(`Expected: Calendar shows 20 consecutive green days ending 2 days ago`)
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
