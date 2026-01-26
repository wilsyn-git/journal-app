
import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()

async function main() {
    console.log('Starting import...')

    // Path to the file
    const filePath = '/Users/sam/Downloads/newstuff.json';

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(rawData); // Record<string, string[]>

    // Get default org (assuming one exists from seed)
    const org = await prisma.organization.findFirst();
    if (!org) {
        console.error('No organization found.');
        return;
    }

    for (const [categoryName, prompts] of Object.entries(data)) {
        console.log(`Processing category: ${categoryName}`);

        // 1. Create or Find Category
        const category = await prisma.promptCategory.upsert({
            where: {
                organizationId_name: {
                    organizationId: org.id,
                    name: categoryName
                }
            },
            update: {},
            create: {
                name: categoryName,
                organizationId: org.id
            }
        });

        // 2. Create Prompts
        const promptList = prompts as string[];
        let count = 0;

        for (const content of promptList) {
            // Check for duplicates?
            const existing = await prisma.prompt.findFirst({
                where: {
                    organizationId: org.id,
                    content: content
                }
            });

            if (!existing) {
                await prisma.prompt.create({
                    data: {
                        content,
                        organizationId: org.id,
                        categoryId: category.id,      // Relation
                        categoryString: categoryName, // Legacy/Fallback
                        isActive: true,
                        isGlobal: false // Default to false for imported bulk prompts? Or maybe conditional?
                        // "deviant" and "general" -> probably false unless specified. 
                        // The walkthrough implies "General" might be global, but usually lists are pool-based.
                    }
                });
                count++;
            }
        }
        console.log(`  Added ${count} new prompts to ${categoryName}.`);
    }

    console.log('Import complete.');
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
