
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
    // Create Default Prompts linked to Org
    const prompts = [
        { content: "What are you grateful for today?", type: "TEXT", isGlobal: true, category: "General" },
        { content: "How are you feeling?", type: "RADIO", options: JSON.stringify(["Happy", "Sad", "Anxious", "Neutral"]), isGlobal: true, category: "General" },
        { content: "Did you complete your habits?", type: "CHECKBOX", options: JSON.stringify(["Workout", "Read", "Meditate"]), isGlobal: true, category: "Tasks" }
    ]

    for (const p of prompts) {
        await prisma.prompt.create({
            data: {
                ...p,
                organizationId: org.id
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
    // Note: isGlobal: false means it won't be picked up by general logic unless via Rule or if we change logic. 
    // Actually, simply having category "Anxiety" is enough if the rule picks from "Anxiety".
    await prisma.prompt.create({
        data: {
            content: "What is triggering your anxiety right now?",
            type: "TEXT",
            organizationId: org.id,
            isGlobal: false,
            category: "Anxiety"
        }
    })

    // ADD RULES
    await prisma.profileRule.create({
        data: {
            profileId: anxietyProfile.id,
            category: "Anxiety",
            minCount: 1,
            maxCount: 2
        }
    })

    console.log({ admin, org });
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
