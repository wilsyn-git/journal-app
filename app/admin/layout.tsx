import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/admin/AdminSidebar"

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()

    // @ts-expect-error - session.user.role is not strictly typed yet without module augmentation
    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect("/dashboard")
    }

    return (
        <div className="flex h-screen bg-background text-foreground">
            {/* Sidebar */}
            <AdminSidebar />

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-8">
                {children}
            </main>
        </div>
    )
}
