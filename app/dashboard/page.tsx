
import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { getEntriesByDate, getJournalHistory, getEffectiveProfileIds, getActivePrompts } from "@/app/lib/data"
import { revalidatePath } from "next/cache"
import { DailyJournalForm } from "@/components/DailyJournalForm"
import { PastJournalView } from "@/components/PastJournalView"
import { CalendarSidebar } from "@/components/CalendarSidebar"
import { StreakBadge } from "@/components/StreakBadge"
import { getUserStats } from "@/app/lib/analytics"
import { AdminUserSelector } from "@/components/AdminUserSelector"
import { getUserTimezone, getTodayForUser } from "@/lib/timezone"
import { ContributionHeatmap } from "@/components/ContributionHeatmap"

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

import { DashboardShell } from "@/components/DashboardShell"

// ... imports remain same ...

export default async function DashboardPage({ searchParams }: Props) {
    const session = await auth()
    if (!session) redirect("/login")

    // ... (User resolution logic same as before) ...
    let currentUserId = session.user?.id
    if (!currentUserId && session.user?.email) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } })
        if (user) {
            currentUserId = user.id
        }
    }
    if (!currentUserId) redirect("/login");

    const isAdmin = session.user?.role === 'ADMIN';
    const params = await searchParams;
    const viewUserId = typeof params.viewUserId === 'string' ? params.viewUserId : null;

    const targetUserId = (isAdmin && viewUserId) ? viewUserId : currentUserId;
    const isViewingSelf = targetUserId === currentUserId;

    let targetUserEmail = session.user?.email || '';
    if (!isViewingSelf) {
        const u = await prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true } })
        targetUserEmail = u?.email || 'Unknown User';
    }

    const historyDates = await getJournalHistory(targetUserId);
    const userStats = await getUserStats(targetUserId);

    let allUsers: { id: string, email: string, name: string | null }[] = [];
    if (isAdmin) {
        allUsers = await prisma.user.findMany({ select: { id: true, email: true, name: true }, orderBy: { email: 'asc' } });
    }

    // Check effective profiles to determine if user has ANY configuration
    const profileIds = await getEffectiveProfileIds(targetUserId);
    const hasConfiguration = profileIds.length > 0;

    const timezone = await getUserTimezone()
    const today = getTodayForUser(timezone)

    // Ensure we fetch the user's specific organization branding
    const userWithOrg = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { organization: true }
    })
    const brandingOrg = userWithOrg?.organization

    const dateParam = typeof params.date === 'string' ? params.date : null;
    const isPast = dateParam && dateParam !== today;
    const targetDate = isPast ? dateParam! : today;

    // Fetch active prompts for the target date to ensure correct display order
    // (This ensures consistency with how they were generated)
    // We need the orgId for this.
    const targetUserOrg = await prisma.user.findUnique({ where: { id: targetUserId }, select: { organizationId: true } });
    const targetProfileIds = await getEffectiveProfileIds(targetUserId);

    const activePrompts = await getActivePrompts(
        targetUserId,
        targetUserOrg?.organizationId || session?.user?.organizationId || '', // Fallback to current session org if unsure
        targetProfileIds,
        targetDate
    );

    const orderedPromptIds = activePrompts.map(p => p.id);

    let ContentComponent;

    if (!hasConfiguration && isViewingSelf && !isAdmin) {
        // Case: User logs in but Admin hasn't assigned them to a group yet.
        ContentComponent = (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4 animate-in fade-in duration-500">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-2">
                    <span className="text-3xl">⏳</span>
                </div>
                <h2 className="text-2xl font-bold text-white">Account Pending Setup</h2>
                <p className="text-gray-400 max-w-md">
                    Welcome to Journal App! Your account has been created, but an administrator needs to assign you to a group before you can start journaling.
                </p>
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-200 mt-4">
                    <p>Please check back later or contact your organization admin.</p>
                </div>
                <form action={async () => {
                    'use server'
                    revalidatePath('/dashboard')
                }}>
                    <button className="mt-4 text-sm text-primary hover:text-white transition-colors underline decoration-primary/30">
                        Check again
                    </button>
                </form>
            </div>
        )
    } else if (isPast || (!isViewingSelf)) {
        // Fetch Entries
        const rawEntries = await getEntriesByDate(targetUserId, targetDate);

        // Sort entries by the active prompt order
        const entries = rawEntries.sort((a, b) => {
            const indexA = orderedPromptIds.indexOf(a.promptId);
            const indexB = orderedPromptIds.indexOf(b.promptId);
            // If -1 (not found in current rule set), push to end
            const safeA = indexA === -1 ? 9999 : indexA;
            const safeB = indexB === -1 ? 9999 : indexB;
            return safeA - safeB;
        });

        if (entries.length > 0 || isPast) {
            ContentComponent = <PastJournalView entries={entries as any} date={targetDate} isAdmin={isAdmin} />
        } else {
            ContentComponent = <div className="text-muted-foreground p-10">User has not journaled today.</div>
        }
    } else {
        ContentComponent = <DailyJournalForm />
    }

    // Fetch fresh user data for sidebar
    const currentUser = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: {
            name: true,
            email: true,
            groups: { select: { name: true } },
            avatars: { where: { isActive: true }, take: 1, select: { url: true } }
        }
    });

    const userLabel = isAdmin
        ? 'Admin'
        : (currentUser?.groups?.[0]?.name || 'No Group');

    const avatarUrl = currentUser?.avatars?.[0]?.url;

    // Sidebar Content (Server Rendered Part)
    const SidebarContent = (
        <>
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <Link href="/dashboard" className="text-xl font-bold tracking-tighter text-white flex items-center gap-2">
                    {brandingOrg?.logoUrl && <img src={brandingOrg.logoUrl} alt="Logo" className="w-6 h-6 object-contain" />}
                    <span>{brandingOrg?.siteName || "Journal.ai"}</span>
                </Link>
                <Link href="/settings" className="text-gray-400 hover:text-white transition-colors">
                    <span className="sr-only">Settings</span>
                    ⚙️
                </Link>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {isAdmin && (
                    <div className="mb-6 border-b border-white/10 pb-4">
                        <AdminUserSelector
                            users={allUsers.map(u => ({ ...u, name: u.name || u.email }))}
                            currentUserId={currentUserId}
                        />
                        <div className="grid grid-cols-2 gap-2 px-4 mt-2">
                            <Link href="/admin" className="text-xs text-center p-2 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30">
                                Admin
                            </Link>
                            <Link href="/stats" className="text-xs text-center p-2 rounded bg-white/5 text-gray-300 hover:bg-white/10">
                                Stats
                            </Link>
                        </div>
                    </div>
                )}

                {isViewingSelf && (
                    <div className="mb-6 px-2 space-y-2">
                        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white hover:bg-white/5 transition-colors">
                            <span className="text-lg">✏️</span>
                            <span className="font-medium">Write Today</span>
                        </Link>
                        <Link href="/stats" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white hover:bg-white/5 transition-colors">
                            <span className="text-lg">📊</span>
                            <span className="font-medium">My Stats</span>
                        </Link>
                    </div>
                )}

                <CalendarSidebar completedDates={historyDates} />
            </div>

            <div className="p-4 border-t border-white/10 bg-black/20">
                <Link href="/settings" className="flex items-center gap-4 justify-between group cursor-pointer">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-xs font-bold text-white overflow-hidden border border-white/10">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                (currentUser?.name?.[0] || currentUser?.email?.[0] || '?').toUpperCase()
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-medium text-white max-w-[100px] truncate group-hover:text-primary transition-colors">
                                {currentUser?.name || currentUser?.email?.split('@')[0]}
                            </span>
                            <span className="text-[10px] text-gray-400">{userLabel}</span>
                        </div>
                    </div>
                </Link>
                <form action={async () => {
                    "use server"
                    await signOut({ redirectTo: "/" })
                }} className="mt-3">
                    <button className="w-full text-left text-xs text-red-400 hover:text-red-300 transition-colors px-1">
                        Sign Out
                    </button>
                </form>
            </div>
        </>
    );

    return (
        <DashboardShell sidebar={SidebarContent} streak={userStats.streak}>
            {/* Desktop Header / Stats Bar */}
            <div className="hidden md:flex flex-col p-6 px-10 border-b border-white/5 gap-4">
                <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-400">
                        {isViewingSelf ? 'Your Journal' : `Viewing: ${targetUserEmail}`}
                    </div>
                    <StreakBadge streak={userStats.streak} />
                </div>

                {/* Heatmap Section */}
                <div className="w-full">
                    <ContributionHeatmap data={userStats.heatmap} weeksHistory={12} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
                <div className="max-w-7xl mx-auto w-full">
                    {ContentComponent}
                </div>
            </div>
        </DashboardShell>
    )
}
