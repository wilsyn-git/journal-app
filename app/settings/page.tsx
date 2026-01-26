import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ProfileForm } from "./ProfileForm"
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog"

export default async function SettingsPage() {
    const session = await auth()
    if (!session?.user?.email) redirect('/')

    // Resolve User ID & Org logic
    // We'll fetch the user with organization relation in one go later, or just fetch active org first if needed.
    // Better to just fetch Main Active Org for generic settings page if user not fully loaded, 
    // BUT we are authenticated.

    // Let's resolve user first to be safe
    let currentUserId = session.user.id
    if (!currentUserId) {
        const u = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
        if (!u) redirect('/')
        currentUserId = u.id
    }

    const userWithOrg = await prisma.user.findUnique({
        where: { id: currentUserId },
        include: { organization: true }
    })
    const org = userWithOrg?.organization

    // 2. Fetch User Data
    const user = await prisma.user.findUnique({
        where: { id: currentUserId },
        include: {
            avatars: {
                where: { isActive: true },
                take: 1
            },
            groups: true
        }
    })

    if (!user) redirect('/')

    const activeAvatar = user.avatars[0]?.url

    return (
        <div className="flex h-screen bg-[#09090b] text-white font-sans overflow-hidden">
            {/* Simple Sidebar/Nav Back */}
            <div className="w-64 border-r border-white/10 bg-black/20 flex flex-col p-4">
                <Link href="/dashboard" className="text-xl font-bold tracking-tighter text-white mb-8 flex items-center gap-2">
                    {org?.logoUrl && <img src={org.logoUrl} alt="Logo" className="w-6 h-6 object-contain" />}
                    <span>{org?.siteName || "Journal.ai"}</span>
                </Link>
                <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                    <span>←</span> Back to Dashboard
                </Link>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-2xl mx-auto">
                    <h1 className="text-3xl font-bold mb-8">Settings</h1>

                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8">
                        <h2 className="text-xl font-semibold mb-6">Profile</h2>

                        <ProfileForm
                            userId={currentUserId}
                            activeAvatar={activeAvatar}
                            initialName={user.name}
                            initialEmail={user.email}
                            initialBio={user.bio}
                        />
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8">
                        <h2 className="text-xl font-semibold mb-4 text-gray-200">Security</h2>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium">Password</h3>
                                <p className="text-sm text-gray-400 mt-1">Update your password to keep your account secure.</p>
                            </div>
                            <ChangePasswordDialog
                                trigger={
                                    <button className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors">
                                        Change Password
                                    </button>
                                }
                            />
                        </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                        <h2 className="text-xl font-semibold mb-4 text-gray-200">Account Information</h2>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium">Account ID</h3>
                                <p className="text-sm text-gray-500 font-mono mt-1">{user.id}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
