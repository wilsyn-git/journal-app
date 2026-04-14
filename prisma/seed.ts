
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
    const password = await bcrypt.hash('password123', 10);

    // Create Default Organization
    const org = await prisma.organization.upsert({
        where: { code: 'default' },
        update: {},
        create: {
            name: 'Default Organization',
            code: 'default',
        }
    })

    // Create Admin
    const admin = await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {
            organizationId: org.id
        },
        create: {
            email: 'admin@example.com',
            password,
            role: 'ADMIN',
            organizationId: org.id
        },
    });

    // Create Default Prompts linked to Org
    // 1. Create Categories first
    const categories = ['General', 'Tasks', 'Anxiety'];
    const categoryMap: Record<string, string> = {};

    for (const catName of categories) {
        const c = await prisma.promptCategory.upsert({
            where: {
                organizationId_name: {
                    organizationId: org.id,
                    name: catName
                }
            },
            update: {},
            create: {
                name: catName,
                organizationId: org.id
            }
        });
        categoryMap[catName] = c.id;
    }

    // 2. Create Default Prompts linked to Org & Category
    const prompts = [
        { content: "What are you grateful for today?", type: "TEXT", isGlobal: true, categoryName: "General" },
        { content: "How are you feeling?", type: "RADIO", options: JSON.stringify(["Happy", "Sad", "Anxious", "Neutral"]), isGlobal: true, categoryName: "General" },
        { content: "Did you complete your habits?", type: "CHECKBOX", options: JSON.stringify(["Workout", "Read", "Meditate"]), isGlobal: true, categoryName: "Tasks" }
    ]

    for (const p of prompts) {
        // Separate categoryName from the rest of the object
        const { categoryName, ...promptData } = p;

        await prisma.prompt.create({
            data: {
                ...promptData,
                organizationId: org.id,
                categoryId: categoryMap[categoryName], // Link Relation
                categoryString: categoryName // Legacy String
            }
        })
    }

    // Create Profiles (Example)
    const anxietyProfile = await prisma.profile.create({
        data: {
            name: 'Anxiety Management',
            description: 'Focus on managing stress and anxiety.',
            organizationId: org.id
        }
    })

    // Create Targeted Prompt (Category: Anxiety)
    await prisma.prompt.create({
        data: {
            content: "What is triggering your anxiety right now?",
            type: "TEXT",
            organizationId: org.id,
            isGlobal: false,
            categoryId: categoryMap['Anxiety'],
            categoryString: 'Anxiety'
        }
    })

    // ADD RULES
    await prisma.profileRule.create({
        data: {
            profileId: anxietyProfile.id,
            categoryId: categoryMap['Anxiety'], // Link Relation
            // categoryString is deprecated but we can set it if needed (schema says optional)
            minCount: 1,
            maxCount: 2
        }
    })

    // Seed rule completions for past days (test data for calendar/rules visibility)
    const testAssignments = await prisma.ruleAssignment.findMany({
        where: { user: { email: 'admin@example.com' } },
        include: { rule: true },
    })

    if (testAssignments.length > 0) {
        const today = new Date()
        // Create completions for the past 7 days with varying patterns
        for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
            const date = new Date(today)
            date.setDate(date.getDate() - daysAgo)
            const dateStr = date.toISOString().split('T')[0]

            // Complete some rules (not all) to show partial vs full completion
            const rulesToComplete = daysAgo % 2 === 0
                ? testAssignments // even days: all complete
                : testAssignments.slice(0, Math.ceil(testAssignments.length / 2)) // odd days: partial

            for (const assignment of rulesToComplete) {
                await prisma.ruleCompletion.upsert({
                    where: {
                        ruleAssignmentId_periodKey: {
                            ruleAssignmentId: assignment.id,
                            periodKey: dateStr,
                        },
                    },
                    update: {},
                    create: {
                        ruleAssignmentId: assignment.id,
                        userId: assignment.userId,
                        ruleId: assignment.ruleId,
                        periodKey: dateStr,
                        completedAt: date,
                    },
                })
            }
        }
        console.log(`Seeded rule completions for ${testAssignments.length} assignments over 7 days.`)
    }

    console.log("Seeding completed successfully.");
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
