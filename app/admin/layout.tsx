import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import { prisma } from "@/lib/prisma"
import { countPendingAcknowledgements } from "@/lib/taskAcknowledgements"

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect("/dashboard")
    }

    const pendingAcknowledgements = await countPendingAcknowledgements(prisma, session.user.organizationId)

    return (
        <div className="flex flex-col md:flex-row h-screen bg-background text-foreground">
            {/* Sidebar (Handles its own responsive rendering) */}
            <AdminSidebar pendingAcknowledgements={pendingAcknowledgements} />

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
                {children}
            </main>
        </div>
    )
}
