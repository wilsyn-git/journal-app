import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const newData = {
    "deviant": [
        "What desire did I think about that I haven't shared with sam yet?",
        "what fantasy crossed my mind today that felt especially strong?",
        "What moment made me think of sam today?",
        "Is there something sam did recently that unexpectedly turned me on?",
        "What is something I wish sam would take more control over or with?",
        "What rule feels difficult to adhere to when I'm excited or aroused?",
        "What makes me feel 'owned'?",
        "What scenario do I imagine when I feel submissive?",
        "What scenario do I imagine when I feel connected?",
        "Is there a physical sensation I crave from sam at the moment?",
        "What am I currently anticipating from sam?",
        "What is something I crave but might be too shy to admit normally?",
        "What makes me feel powerful as a sub, even during intimacy?",
        "What kind of restraint excites me most right now?",
        "Is there something that made you feel seen today?",
        "What is something I'd like permission to do?",
        "What is something I would like help with?",
        "What is one way I supported those I love today?",
        "What is something that makes me blush thinking about?",
        "What is one way I supported sam today?",
        "What emotion did I feel most today?",
        "Did I communicate well today?",
        "How did I care for my body today?",
        "How did I care for my mind today?",
        "What fear or insecurity did I feel tdoay?",
        "What challenged my patience today?",
        "What challenged my self-control today?",
        "How did I show respect today?",
        "What is something I want sam to know today?",
        "How did I handle frustration today?",
        "When did I feel most submissive today?",
        "When did I feel least submissive today?",
        "What motivates my submission?",
        "How did I seek structure today?",
        "What is something about my relationships do I need clarity on?",
        "What does giving up control feel like?",
        "What is something small that made me feel cared for today?",
        "What rules or rituals feel meaningful to me?",
        "What traits help me trust someone enough to be vulnerable with them?",
        "Are there any emotional needs that currently aren't being met?",
        "How does giving up control help me?",
        "How do you react to praise: internally or externally?",
        "How do you internall react to correction praise?",
        "How do you react to correction praise?",
        "What was a moment today where i felt seen?",
        "What does ownership symbolize for me emotionally?",
        "What sensation today has felt good or maybe overwhelming?",
        "What responsibilities come with feeling or being submissive?",
        "What do i need from someone who i give up control to?",
        "What expectations do i have from myself as a submissive?",
        "Do you need a release or a moment where you give up control?",
        "How do i define consent?",
        "What does accountability look like in a D/s relationship?",
        "Is there an aspect of my kink that i want to explore?",
        "What insecurities do i feel today?",
        "What does command or authority mean to me in a healthy way?",
        "What do i consider a red flag?",
        "What do i consider a green flag?",
        "How do i handle jealousy or frustration in a reltionship?",
        "Is there room for playfulness in kink?",
        "What role does structure play in your feeling comfortable or taken care of?",
        "How do i feel about being observed, evaluated, or guided by someone you trust?",
        "Tell me about a fantasy you have:"
    ],
    "general": [
        "List 3 things, people, places, or situations that you are grateful for in your day",
        "Who did you appreciate today?",
        "What made you happy today?",
        "What did you accomplish today?",
        "Why are you proud of yourself today?",
        "If you could, what woudl you have done differently today?",
        "Tell me something you learned about yourself today?",
        "What bothered you today?",
        "What do you need to remember for tomorrow?",
        "What is something you need to let go of from today?",
        "List of handful of obligations you feel",
        "What is something you're optimistic about?",
        "Did anyone impact you today? if so, how?",
        "Is there anything you wish you would have accomplished today?",
        "Is there anything you wish you would have said today?",
        "Is there something you should give yourself more credit for?",
        "What made you smile today?",
        "I miss _______",
        "I love _______",
        "What is something that made you smile today?",
        "Tell me why you are hopeful today?",
        "What do you need most right now?",
        "What inspired you today",
        "What challenged you today",
        "What surprised you today",
        "What made you smile today",
        "What are you grateful for right now",
        "What drained your energy today",
        "What energized you today",
        "What did you learn about yourself",
        "What did you learn about someone else",
        "What moment felt the most meaningful today",
        "What moment felt insignificant but stuck with you",
        "What is one thing you want to remember from today",
        "What is one thing you want to forget from today",
        "What felt like progress",
        "What felt like a setback",
        "What did you avoid doing today",
        "What did you handle well today",
        "What would you redo if you could",
        "What conversation felt unfinished",
        "What conversation mattered today",
        "What do you wish you said",
        "What do you wish you hadnt said",
        "What habit went well today",
        "What habit struggled today",
        "What healthy choice did you make",
        "What unhealthy choice did you make",
        "What did your body need more of today",
        "What did your mind need more of today",
        "What did your heart need more of today",
        "What did you notice about your environment",
        "What stayed the same",
        "What routine helped you today",
        "What routine got in your way",
        "What did you create today",
        "What did you consume today that influenced you",
        "What are you proud of today",
        "What are you disappointed in today",
        "What did you procrastinate on",
        "What did you focus well on",
        "What did you waste time on",
        "What did you enjoy doing more than expected",
        "What did you enjoy doing less than expected",
        "What comforted you today",
        "What frustrated you today",
        "What inspired curiosity",
        "What made you laugh",
        "What made you feel connected",
        "What made you feel disconnected",
        "What did you let go of today",
        "What did you hold onto too tightly",
        "What small detail felt important",
        "What reminder did you need today",
        "What gave you confidence",
        "What risk did you take",
        "What risk did you avoid",
        "What kindness did you give",
        "What kindness did you receive",
        "What motivated you today",
        "What slowed you down today",
        "What was your favorite moment",
        "What was your least favorite moment",
        "What made you feel safe",
        "What made you feel uneasy",
        "What expectation did you meet",
        "What expectation did you release",
        "What sparked creativity",
        "What sparked reflection",
        "What decision felt easy",
        "What decision felt hard",
        "What helped you stay present",
        "What distracted you the most",
        "What thought kept returning",
        "What thought faded away",
        "What did you forgive yourself for",
        "What did you forgive someone else for",
        "What did you apologize for today",
        "What did you celebrate today",
        "What would you change about today",
        "What would you repeat from today",
        "What routine do you want to improve",
        "What connection do you want to deepen",
        "What do you want to simplify",
        "What are you curious about right now?",
        "What truth felt clear today"
    ]
};

async function main() {
    console.log('🔄 Importing Prompts...');

    // 1. Get default org
    const org = await prisma.organization.findFirst({ where: { code: 'DEFAULT' } });
    if (!org) throw new Error('Default organization not found');

    // 2. Clear existing (Order matters due to relations)
    console.log('🧹 Clearing existing prompts...');
    await prisma.journalEntry.deleteMany({}); // Must clear entries first
    await prisma.prompt.deleteMany({});
    await prisma.promptCategory.deleteMany({});

    // 3. Import
    for (const [categoryName, prompts] of Object.entries(newData)) {
        console.log(`📂 Creating category: ${categoryName}`);
        const cat = await prisma.promptCategory.create({
            data: {
                name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1), // Capitalize
                organizationId: org.id
            }
        });

        console.log(`   📝 Adding ${prompts.length} prompts...`);
        // Batch create or loop
        for (const pContent of prompts) {
            await prisma.prompt.create({
                data: {
                    content: pContent,
                    type: 'TEXT',
                    organizationId: org.id,
                    categoryId: cat.id,
                    isGlobal: false // IMPORTANT: Do not force these on everyone
                }
            });
        }
    }

    console.log('✅ Import Complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
