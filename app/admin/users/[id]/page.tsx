
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"


import { EditUserForm } from "@/components/admin/EditUserForm"
import { DeleteUserDialog } from "@/components/admin/DeleteUserDialog"

type Props = {
    params: Promise<{ id: string }>
}

export default async function AdminUserDetailPage({ params }: Props) {
    const { id } = await params;
    const session = await auth();
    const orgId = session?.user?.organizationId;

    const user = await prisma.user.findUnique({
        where: { id },
        include: { profiles: true }
    });

    if (!user || user.organizationId !== orgId) {
        return <div className="p-8 text-red-400">User not found or access denied.</div>
    }

    const availableProfiles = await prisma.profile.findMany({
        where: { organizationId: orgId }
    });

    const userProfileIds = new Set(user.profiles.map(p => p.id));

    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-8">
                <Link href="/admin/users" className="text-sm text-gray-400 hover:text-white mb-2 inline-block">&larr; Back to Users</Link>
                <h1 className="text-3xl font-bold text-white">Edit User</h1>
            </div>

            <div className="glass-card p-8 rounded-xl border border-white/10">
                <h2 className="text-xl font-bold text-white mb-6">User Details</h2>
                <EditUserForm user={user} />
            </div>

            {/* Danger Zone */}
            <div className="mt-8 border border-red-500/10 bg-red-500/5 rounded-xl p-6">
                <h2 className="text-lg font-bold text-red-400 mb-2">Danger Zone</h2>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-gray-400">Permanently delete this user and all their data.</p>
                    </div>
                    <DeleteUserDialog userId={user.id} userName={user.name || user.email} />
                </div>
            </div>
        </div>
    )
}


