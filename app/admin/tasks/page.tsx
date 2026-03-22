
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { PRIORITY, PRIORITY_LABELS, PRIORITY_COLORS, ASSIGNMENT_MODES } from "@/lib/taskConstants"
import { getUserTimezone, getTodayForUser } from "@/lib/timezone"
import type { PriorityValue } from "@/lib/taskConstants"

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function AdminTasksPage({ searchParams }: Props) {
    const session = await auth();

    if (!session?.user || (session.user as any).role !== 'ADMIN') {
        redirect("/dashboard")
    }

    const orgId = (session?.user as any)?.organizationId;
    const params = await searchParams;
    const tab = typeof params.tab === 'string' ? params.tab : 'active';
    const isArchived = tab === 'archived';

    const timezone = await getUserTimezone();
    const todayStr = getTodayForUser(timezone);

    const tasks = await prisma.task.findMany({
        where: { organizationId: orgId, archivedAt: isArchived ? { not: null } : null },
        include: {
            assignments: { select: { completedAt: true } },
            createdBy: { select: { name: true } }
        },
        orderBy: isArchived
            ? [{ archivedAt: 'desc' }]
            : [{ priority: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }]
    })

    // Fetch group names for tasks assigned to groups
    const groupIds = tasks
        .filter(t => t.assignmentMode === ASSIGNMENT_MODES.GROUP && t.groupId)
        .map(t => t.groupId!)
    const groups = groupIds.length > 0
        ? await prisma.userGroup.findMany({
            where: { id: { in: groupIds } },
            select: { id: true, name: true }
        })
        : []
    const groupMap = new Map(groups.map(g => [g.id, g.name]))

    // Post-query sort for active tab: partition overdue tasks to top
    let sortedTasks = tasks
    if (!isArchived) {
        const overdue: typeof tasks = []
        const notOverdue: typeof tasks = []
        for (const task of tasks) {
            if (task.dueDate) {
                const dueDateStr = task.dueDate.toLocaleDateString('en-CA', { timeZone: timezone })
                if (dueDateStr < todayStr) {
                    overdue.push(task)
                    continue
                }
            }
            notOverdue.push(task)
        }
        sortedTasks = [...overdue, ...notOverdue]
    }

    function isOverdue(task: typeof tasks[number]) {
        if (!task.dueDate || isArchived) return false
        const dueDateStr = task.dueDate.toLocaleDateString('en-CA', { timeZone: timezone })
        return dueDateStr < todayStr
    }

    function getAssignmentLabel(task: typeof tasks[number]) {
        const count = task.assignments.length
        if (task.assignmentMode === ASSIGNMENT_MODES.USER) {
            // Single user - show first assignment user name or count
            if (count === 1) {
                return `${count} user`
            }
            return `${count} users`
        }
        if (task.assignmentMode === ASSIGNMENT_MODES.GROUP) {
            const groupName = task.groupId ? groupMap.get(task.groupId) : null
            return groupName ? `${groupName} (${count} users)` : `Group (${count} users)`
        }
        return `All users (${count} users)`
    }

    function getCompletionLabel(task: typeof tasks[number]) {
        const total = task.assignments.length
        if (total === 0) return null
        const completed = task.assignments.filter(a => a.completedAt !== null).length
        return `${completed} of ${total} done`
    }

    function getPriorityBadgeClass(priority: PriorityValue) {
        switch (priority) {
            case PRIORITY.URGENT: return 'bg-red-500/20 text-red-400'
            case PRIORITY.NORMAL: return 'bg-primary/20 text-primary'
            case PRIORITY.LOW: return 'bg-zinc-600/20 text-gray-400'
            default: return 'bg-zinc-600/20 text-gray-400'
        }
    }

    function getBorderColor(task: typeof tasks[number]) {
        if (isOverdue(task)) return 'bg-red-500'
        const priority = task.priority as PriorityValue
        return PRIORITY_COLORS[priority]?.bg ?? 'bg-zinc-600'
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Tasks</h1>
                    <p className="text-gray-400 text-sm mt-1">Assign and track tasks for your users</p>
                </div>
                <Link
                    href="/admin/tasks/new"
                    className="text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors text-center"
                >
                    + New Task
                </Link>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
                <Link
                    href="/admin/tasks"
                    className={`px-4 py-2 rounded-md text-sm transition-colors ${
                        !isArchived
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Active
                </Link>
                <Link
                    href="/admin/tasks?tab=archived"
                    className={`px-4 py-2 rounded-md text-sm transition-colors ${
                        isArchived
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Archived
                </Link>
            </div>

            {/* Task List */}
            {sortedTasks.length === 0 ? (
                <div className="glass-card border border-white/10 rounded-xl p-12 text-center">
                    <p className="text-gray-400">
                        {isArchived
                            ? 'No archived tasks.'
                            : 'No tasks yet. Create your first task to get started.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {sortedTasks.map(task => {
                        const overdue = isOverdue(task)
                        const priority = task.priority as PriorityValue
                        const completionLabel = getCompletionLabel(task)

                        return (
                            <Link
                                key={task.id}
                                href={`/admin/tasks/${task.id}`}
                                className={`
                                    block glass-card border rounded-xl overflow-hidden transition-colors hover:border-white/20
                                    ${overdue
                                        ? 'border-red-500/20 bg-red-500/5'
                                        : 'border-white/10'}
                                `}
                            >
                                <div className="flex">
                                    {/* Priority border */}
                                    <div className={`w-1 shrink-0 ${getBorderColor(task)}`} />

                                    {/* Content */}
                                    <div className="flex-1 p-4 min-w-0">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h3 className="text-white font-medium truncate">{task.title}</h3>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-gray-400">
                                                    {task.dueDate && (
                                                        <span className={overdue ? 'text-red-400' : ''}>
                                                            Due {task.dueDate.toLocaleDateString('en-US', { timeZone: timezone, month: 'short', day: 'numeric' })}
                                                        </span>
                                                    )}
                                                    <span>{getAssignmentLabel(task)}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {completionLabel && (
                                                    <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded">
                                                        {completionLabel}
                                                    </span>
                                                )}
                                                <span className={`text-xs px-2 py-1 rounded ${getPriorityBadgeClass(priority)}`}>
                                                    {PRIORITY_LABELS[priority] ?? 'Normal'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
