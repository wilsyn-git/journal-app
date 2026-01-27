// Minimal layout that primarily handles background and sizing
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { ActivityTracker } from "@/components/ActivityTracker"


export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()
    if (!session) redirect("/login")

    return (
        <div className="min-h-screen bg-background text-foreground flex overflow-hidden">
            {/* Background Gradients */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
                <div className="absolute bottom-[10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-accent/10 blur-[100px]" />
            </div>

            {/* Children contains the Sidebar+Main content from page.tsx */}
            {children}
            <ActivityTracker />
        </div>
    )
}
