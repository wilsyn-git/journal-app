import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"
import { notFound } from "next/navigation"
import { TaskForm } from "@/components/admin/TaskForm"
import { updateTask } from "@/app/actions/tasks"

type Props = {
    params: Promise<{ id: string }>
}

export default async function EditTaskPage({ params }: Props) {
    const session = await auth()
    const orgId = session?.user?.organizationId
    if (!session?.user || session.user.role !== 'ADMIN' || !orgId) {
        notFound()
    }

    const { id } = await params

    const task = await prisma.task.findUnique({
        where: { id },
    })

    if (!task || task.organizationId !== orgId) notFound()

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

    async function handleUpdate(formData: FormData) {
        'use server'
        return updateTask(task!.id, formData)
    }

    return (
        <div className="max-w-2xl mx-auto">
            <Link href={`/admin/tasks/${id}`} className="text-sm text-gray-400 hover:text-white mb-6 inline-flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Back to Task
            </Link>

            <h1 className="text-2xl font-bold text-white mb-6">Edit Task</h1>

            <TaskForm
                mode="edit"
                initialData={task}
                users={users}
                groups={groups}
                action={handleUpdate}
            />
        </div>
    )
}
