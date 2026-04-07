import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"
import { notFound } from "next/navigation"
import { archiveTask, unarchiveTask } from "@/app/actions/tasks"
import { PRIORITY_LABELS, PRIORITY_COLORS, type PriorityValue } from "@/lib/taskConstants"
import { getUserTimezone, getTodayForUser } from "@/lib/timezone"

type Props = {
    params: Promise<{ id: string }>
}

export default async function TaskDetailPage({ params }: Props) {
    const session = await auth()
    const orgId = session?.user?.organizationId
    if (!orgId) {
        notFound()
    }

    const { id } = await params

    const task = await prisma.task.findUnique({
        where: { id },
        include: {
            assignments: {
                include: { user: { select: { id: true, name: true, email: true } } },
            },
        },
    })

    if (!task || task.organizationId !== orgId) notFound()

    const timezone = await getUserTimezone()
    const todayStr = getTodayForUser(timezone)

    const priority = task.priority as PriorityValue
    const priorityLabel = PRIORITY_LABELS[priority] ?? 'Normal'
    const priorityColor = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS[1]

    // Sort assignments: completed first (by completedAt desc), then pending, then overdue
    const isOverdue = (a: typeof task.assignments[number]) =>
        task.dueDate &&
        new Date(task.dueDate).toLocaleDateString("en-CA", { timeZone: timezone }) < todayStr &&
        !a.completedAt

    const sortedAssignments = [...task.assignments].sort((a, b) => {
        const aCompleted = !!a.completedAt
        const bCompleted = !!b.completedAt
        const aOverdue = isOverdue(a)
        const bOverdue = isOverdue(b)

        if (aCompleted && !bCompleted) return -1
        if (!aCompleted && bCompleted) return 1
        if (aCompleted && bCompleted) {
            return new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
        }
        if (aOverdue && !bOverdue) return 1
        if (!aOverdue && bOverdue) return -1
        return 0
    })

    const completed = task.assignments.filter((a) => a.completedAt).length
    const total = task.assignments.length

    const isArchived = !!task.archivedAt

    return (
        <div className="max-w-3xl mx-auto">
            {/* Back link */}
            <Link
                href="/admin/tasks"
                className="text-sm text-gray-400 hover:text-white mb-6 inline-flex items-center gap-1"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Back to Tasks
            </Link>

            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl font-bold text-white">{task.title}</h1>
                        <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${priorityColor.border} ${priorityColor.text}`}
                        >
                            {priorityLabel}
                        </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
                        {task.dueDate && (
                            <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                        )}
                        <span>
                            {total} assignment{total !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href={`/admin/tasks/${id}/edit`}
                        className="px-4 py-2 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 transition-colors text-sm"
                    >
                        Edit
                    </Link>
                    <form
                        action={async () => {
                            'use server'
                            if (isArchived) {
                                await unarchiveTask(task.id)
                            } else {
                                await archiveTask(task.id)
                            }
                        }}
                    >
                        <button
                            type="submit"
                            className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                                isArchived
                                    ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                                    : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                            }`}
                        >
                            {isArchived ? 'Unarchive' : 'Archive'}
                        </button>
                    </form>
                </div>
            </div>

            {/* Description */}
            {task.description && (
                <div className="glass-card p-6 rounded-xl border border-white/10 mb-6">
                    <h2 className="text-sm font-medium text-gray-400 mb-2">Description</h2>
                    <p className="text-gray-200 whitespace-pre-wrap">{task.description}</p>
                </div>
            )}

            {/* Progress bar */}
            {total > 0 && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-medium text-gray-400">Progress</h2>
                        <span className="text-sm text-gray-400">
                            {completed} of {total}
                        </span>
                    </div>
                    <div
                        role="progressbar"
                        aria-valuenow={completed}
                        aria-valuemin={0}
                        aria-valuemax={total}
                        className="w-full h-2 bg-white/10 rounded-full overflow-hidden"
                    >
                        <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: total > 0 ? `${(completed / total) * 100}%` : '0%' }}
                        />
                    </div>
                </div>
            )}

            {/* Assignment list */}
            {total > 0 && (
                <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/10">
                        <h2 className="text-sm font-medium text-gray-400">Assignments</h2>
                    </div>
                    <div className="divide-y divide-white/5">
                        {sortedAssignments.map((assignment) => {
                            const overdue = isOverdue(assignment)
                            const isCompleted = !!assignment.completedAt
                            const name = assignment.user.name || assignment.user.email
                            const initial = name.charAt(0).toUpperCase()

                            let avatarColor = 'bg-gray-600'
                            if (isCompleted) avatarColor = 'bg-green-600'
                            else if (overdue) avatarColor = 'bg-red-600'

                            return (
                                <div key={assignment.id}>
                                    <div className="flex items-center justify-between px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white text-sm font-medium`}
                                            >
                                                {initial}
                                            </div>
                                            <div>
                                                <p className="text-white text-sm font-medium">{assignment.user.name || assignment.user.email}</p>
                                                {assignment.user.name && (
                                                    <p className="text-gray-500 text-xs">{assignment.user.email}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            {isCompleted ? (
                                                <span className="inline-flex items-center gap-1 text-green-400 text-sm">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                    </svg>
                                                    Completed {new Date(assignment.completedAt!).toLocaleDateString()}
                                                </span>
                                            ) : overdue ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">
                                                    Overdue
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 text-gray-400 border border-white/10">
                                                    Pending
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Completion notes */}
                                    {isCompleted && assignment.notes && (
                                        <div className="px-6 pb-4 pl-[4.25rem]">
                                            <div className="border-l-2 border-primary pl-3 text-sm text-gray-300">
                                                {assignment.notes}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
