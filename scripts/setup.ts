import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('password123', 10);

    // 1. Create Organization
    const org = await prisma.organization.upsert({
        where: { code: 'DEFAULT' },
        update: {},
        create: {
            name: 'Default Org',
            code: 'DEFAULT',
        },
    });

    // 2. Create Admin
    await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: { password: hashedPassword, role: 'ADMIN', organizationId: org.id, name: 'Sam' },
        create: {
            email: 'admin@example.com',
            name: 'Sam',
            password: hashedPassword,
            role: 'ADMIN',
            organizationId: org.id,
        },
    });

    // 3. Create Users
    await prisma.user.upsert({
        where: { email: 'marie@example.com' },
        update: { password: hashedPassword, role: 'USER', organizationId: org.id, name: 'Marie' },
        create: {
            email: 'marie@example.com',
            name: 'Marie',
            password: hashedPassword,
            role: 'USER',
            organizationId: org.id,
        },
    });

    await prisma.user.upsert({
        where: { email: 'becca@example.com' },
        update: { password: hashedPassword, role: 'USER', organizationId: org.id, name: 'Becca' },
        create: {
            email: 'becca@example.com',
            name: 'Becca',
            password: hashedPassword,
            role: 'USER',
            organizationId: org.id,
        },
    });

    // 4. Create User Groups
    const grpEngineering = await prisma.userGroup.create({
        data: { name: 'Engineering', organizationId: org.id }
    });
    const grpFamily = await prisma.userGroup.create({
        data: { name: 'Family', organizationId: org.id }
    });

    // Assign Users to Groups
    // Admin -> Engineering
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
    if (adminUser) {
        await prisma.user.update({
            where: { id: adminUser.id },
            data: { groups: { connect: { id: grpEngineering.id } } }
        });
    }

    // Marie -> Family
    const marieUser = await prisma.user.findUnique({ where: { email: 'marie@example.com' } });
    if (marieUser) {
        await prisma.user.update({
            where: { id: marieUser.id },
            data: { groups: { connect: { id: grpFamily.id } } }
        });
    }

    // 5. Create Prompt Categories
    const generalCat = await prisma.promptCategory.upsert({
        where: { organizationId_name: { organizationId: org.id, name: 'General' } },
        update: {},
        create: {
            name: 'General',
            organizationId: org.id
        }
    });

    // 5. Create Prompts
    const prompts = [
        { content: "What is on your mind?", type: "TEXT", categoryId: generalCat.id },
        { content: "What did you create today", type: "TEXT", categoryId: generalCat.id },
        { content: "What did you hold onto too tightly", type: "TEXT", categoryId: generalCat.id },
        { content: "What made you feel connected", type: "TEXT", categoryId: generalCat.id },
    ];

    for (const p of prompts) {
        await prisma.prompt.create({
            data: {
                content: p.content,
                type: p.type,
                organizationId: org.id,
                categoryId: p.categoryId
            }
        })
    }

    console.log('✅ Database seeded successfully');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
