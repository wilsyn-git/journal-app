
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { updateUserProfiles } from "@/app/lib/admin-actions"

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

                <hr className="border-white/10 my-8" />

                <h2 className="text-xl font-bold text-white mb-6">Assigned Focus Areas</h2>

                <form action={updateUserProfiles.bind(null, user.id)}>
                    <div className="space-y-4 mb-8">
                        {availableProfiles.map(p => (
                            <label key={p.id} className="flex items-start gap-3 p-4 rounded-lg bg-black/20 border border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                                <input
                                    type="checkbox"
                                    name="profiles"
                                    value={p.id}
                                    defaultChecked={userProfileIds.has(p.id)}
                                    className="mt-1 w-5 h-5 accent-primary"
                                />
                                <div>
                                    <span className="block font-bold text-gray-200">{p.name}</span>
                                    <span className="text-sm text-gray-500">{p.description}</span>
                                </div>
                            </label>
                        ))}

                        {availableProfiles.length === 0 && (
                            <p className="text-gray-500 italic">No profiles defined in this organization.</p>
                        )}
                    </div>

                    <div className="flex justify-end gap-4">
                        <Link href="/admin/users" className="px-6 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
                            Cancel
                        </Link>
                        <button type="submit" className="px-6 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primary/90">
                            Save Changes
                        </button>
                    </div>
                </form>
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


