
import { prisma } from "@/lib/prisma"
import { getEffectiveProfileIds, getActivePrompts } from "@/app/lib/data"

const RECENCY_SUPPRESSION_DAYS = 4

function parseArgs(): { email: string; days: number } {
    const args = process.argv.slice(2)
    let email = ''
    let days = 14

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--email' && args[i + 1]) {
            email = args[i + 1]
            i++
        } else if (args[i] === '--days' && args[i + 1]) {
            days = parseInt(args[i + 1], 10)
            i++
        }
    }

    if (!email) {
        console.error('Usage: npx tsx scripts/simulatePrompts.ts --email <email> [--days <n>]')
        process.exit(1)
    }

    return { email, days }
}

async function main() {
    const { email, days } = parseArgs()

    // Look up user by email
    const user = await prisma.user.findFirst({
        where: { email },
        select: { id: true, organizationId: true, name: true }
    })

    if (!user) {
        console.error(`User not found: ${email}`)
        process.exit(1)
    }

    if (!user.organizationId) {
        console.error(`User ${email} has no organization`)
        process.exit(1)
    }

    const profileIds = await getEffectiveProfileIds(user.id)

    // Look up includeAll category prompt IDs to exclude from repeat tracking
    const includeAllRules = await prisma.profileRule.findMany({
        where: { profileId: { in: profileIds }, includeAll: true },
        select: { categoryId: true, categoryString: true }
    })
    const includeAllPrompts = includeAllRules.length > 0
        ? await prisma.prompt.findMany({
            where: {
                organizationId: user.organizationId!,
                isActive: true,
                OR: [
                    ...includeAllRules.filter(r => r.categoryId).map(r => ({ categoryId: r.categoryId! })),
                    ...includeAllRules.filter(r => r.categoryString).map(r => ({ categoryString: r.categoryString! })),
                ]
            },
            select: { id: true }
        })
        : []
    const includeAllPromptIds = new Set(includeAllPrompts.map(p => p.id))

    console.log(`\nSimulating prompts for: ${user.name || email}`)
    console.log(`Profiles: ${profileIds.length}`)
    console.log(`Days: ${days}`)
    console.log(`Recency suppression window: ${RECENCY_SUPPRESSION_DAYS} days\n`)
    console.log('-'.repeat(100))

    const today = new Date()
    // Track prompt selections: day index -> set of prompt IDs
    const daySelections: Map<number, Set<string>> = new Map()
    // Track prompt ID -> title for display
    const promptTitles: Map<string, string> = new Map()

    let totalPrompts = 0
    let repeatCount = 0
    const allSeenPromptIds = new Set<string>()

    for (let d = 0; d < days; d++) {
        const simDate = new Date(today)
        simDate.setDate(simDate.getDate() + d)
        const dateStr = simDate.toISOString().split('T')[0]

        // Build in-memory recency set from simulation's own prior outputs
        const inMemoryRecentSet = new Set<string>()
        for (let prev = 1; prev <= RECENCY_SUPPRESSION_DAYS; prev++) {
            const prevDay = d - prev
            if (prevDay >= 0 && daySelections.has(prevDay)) {
                daySelections.get(prevDay)!.forEach(id => inMemoryRecentSet.add(id))
            }
        }

        const prompts = await getActivePrompts(
            user.id,
            user.organizationId,
            profileIds,
            dateStr,
            inMemoryRecentSet
        )

        // Track this day's selections (exclude global and includeAll from recency)
        const todayIds = new Set<string>()
        const todayTrackableIds = new Set<string>()
        prompts.forEach(p => {
            todayIds.add(p.id)
            if (!p.isGlobal && !includeAllPromptIds.has(p.id)) {
                todayTrackableIds.add(p.id)
            }
            promptTitles.set(p.id, p.content || p.id)
            allSeenPromptIds.add(p.id)
        })
        daySelections.set(d, todayTrackableIds)
        totalPrompts += prompts.length

        // Check for repeats within suppression window (non-global only)
        const dayRepeats: string[] = []
        for (const id of todayTrackableIds) {
            if (inMemoryRecentSet.has(id)) {
                dayRepeats.push(id)
                repeatCount++
            }
        }

        // Format output row
        const promptDisplay = prompts.map(p => {
            const label = (p.content || p.id).substring(0, 50)
            const isRepeat = dayRepeats.includes(p.id)
            const isIncludeAll = includeAllPromptIds.has(p.id)
            const prefix = p.isGlobal ? '[G] ' : isIncludeAll ? '[A] ' : isRepeat ? ' *  ' : '    '
            return `${prefix}${label}`
        }).join(' | ')

        console.log(`${dateStr}  [${String(prompts.length).padStart(2)}]  ${promptDisplay}`)
    }

    console.log('-'.repeat(100))
    console.log(`\nSummary:`)
    console.log(`  Total days simulated: ${days}`)
    console.log(`  Total prompts shown: ${totalPrompts}`)
    console.log(`  Unique prompts seen: ${allSeenPromptIds.size}`)
    console.log(`  Repeats within ${RECENCY_SUPPRESSION_DAYS}-day window: ${repeatCount}`)

    // Calculate utilization: we'd need total pool size, approximate from unique seen
    const utilizationPct = days > 0
        ? ((allSeenPromptIds.size / totalPrompts) * 100).toFixed(1)
        : '0'
    console.log(`  Utilization (unique/total): ${utilizationPct}%`)

    await prisma.$disconnect()

    if (repeatCount > 0) {
        console.log(`\nFAIL: ${repeatCount} repeat(s) found within suppression window`)
        process.exit(1)
    } else {
        console.log(`\nPASS: No repeats within suppression window`)
        process.exit(0)
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
