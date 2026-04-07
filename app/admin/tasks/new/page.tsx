import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { createTask } from "@/app/actions/tasks"
import { TaskForm } from "@/components/admin/TaskForm"
import Link from "next/link"

export default async function NewTaskPage() {
    const session = await auth()
    const orgId = session?.user?.organizationId

    if (!orgId) {
        redirect('/dashboard')
    }

    const [users, groups] = await Promise.all([
        prisma.user.findMany({
            where: { organizationId: orgId },
            select: { id: true, name: true, email: true },
            orderBy: { email: 'asc' },
        }),
        prisma.userGroup.findMany({
            where: { organizationId: orgId },
            select: { id: true, name: true, _count: { select: { users: true } } },
            orderBy: { name: 'asc' },
        }),
    ])

    return (
        <div className="max-w-2xl mx-auto">
            <Link href="/admin/tasks" className="text-sm text-gray-400 hover:text-white mb-6 inline-block">
                &larr; Back to Tasks
            </Link>

            <h1 className="text-2xl font-bold text-white mb-6">Create New Task</h1>

            <TaskForm
                users={users}
                groups={groups}
                action={createTask}
                mode="create"
            />
        </div>
    )
}
