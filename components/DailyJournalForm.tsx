
import { getActivePrompts, getEffectiveProfileIds, getEntriesByDate } from "@/app/lib/data"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { JournalEditor } from "./JournalEditor"

export async function DailyJournalForm() {
    const session = await auth();
    const currentUserId = session?.user?.id || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let organizationId = (session?.user as any)?.organizationId as string;

    // Fallback: Resolve Org ID if session is missing it
    if (session?.user?.email && !organizationId) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } })
        if (user) organizationId = user.organizationId;
    }

    const userProfileIds = await getEffectiveProfileIds(currentUserId);
    const prompts = await getActivePrompts(currentUserId, organizationId, userProfileIds);

    // Fetch existing answers for today
    const todayStr = new Date().toISOString().split('T')[0];
    let initialAnswers: Record<string, string> = {};

    if (currentUserId) {
        const existingEntries = await getEntriesByDate(currentUserId, todayStr);
        initialAnswers = existingEntries.reduce((acc, entry) => {
            acc[entry.promptId] = entry.answer;
            return acc;
        }, {} as Record<string, string>);
    }

    return (
        <JournalEditor prompts={prompts} initialAnswers={initialAnswers} />
    )
}
