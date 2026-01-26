
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"
import { notFound } from "next/navigation"
import { addUserToGroup, removeUserFromGroup, updateGroupProfiles } from "@/app/lib/admin-actions"
import { UserGroupEditor } from "@/components/admin/UserGroupEditor"

type Props = {
    params: Promise<{ id: string }>
}

export default async function GroupDetailPage({ params }: Props) {
    const session = await auth();
    const orgId = session?.user?.organizationId;
    const { id } = await params;

    const group = await prisma.userGroup.findUnique({
        where: { id },
        include: {
            users: true,
            profiles: true
        }
    });

    if (!group) notFound();

    const allProfiles = await prisma.profile.findMany({
        where: { organizationId: orgId }
    });

    const allUsers = await prisma.user.findMany({
        where: { organizationId: orgId },
        select: { id: true, email: true },
        orderBy: { email: 'asc' }
    });

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-8">
                <Link href="/admin/groups" className="text-sm text-gray-400 hover:text-white mb-2 inline-block">&larr; Back to Groups</Link>
                <UserGroupEditor group={{ id: group.id, name: group.name, description: group.description }} />
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                {/* Profiles Management */}
                <div className="glass-card p-6 border border-white/10 rounded-xl">
                    <h2 className="text-xl font-bold text-white mb-4">Assigned Profiles</h2>
                    <p className="text-sm text-gray-400 mb-6">Users in this group will inherit these profiles.</p>

                    <form action={async (formData) => {
                        "use server"
                        await updateGroupProfiles(group.id, formData)
                    }}>
                        <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                            {allProfiles.map(profile => {
                                const isChecked = group.profiles.some(p => p.id === profile.id);
                                return (
                                    <label key={profile.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5 cursor-pointer hover:bg-white/10">
                                        <input
                                            type="checkbox"
                                            name="profiles"
                                            value={profile.id}
                                            defaultChecked={isChecked}
                                            className="w-5 h-5 accent-primary"
                                        />
                                        <div>
                                            <div className="font-medium text-white">{profile.name}</div>
                                            <div className="text-xs text-gray-400">{profile.description}</div>
                                        </div>
                                    </label>
                                )
                            })}
                        </div>
                        <button className="w-full bg-primary text-white py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors">
                            Update Assigned Profiles
                        </button>
                    </form>
                </div>

                {/* Members Management */}
                <div className="glass-card p-6 border border-white/10 rounded-xl h-fit">
                    <h2 className="text-xl font-bold text-white mb-4">Members</h2>

                    <form action={async (formData) => {
                        "use server"
                        await addUserToGroup(group.id, formData)
                    }} className="flex gap-2 mb-6">
                        <select
                            name="email"
                            required
                            defaultValue=""
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg p-2 text-white focus:ring-2 focus:ring-primary/50 outline-none text-sm appearance-none cursor-pointer"
                        >
                            <option value="" disabled>Select User</option>
                            {allUsers
                                .filter(u => !group.users.some(gu => gu.id === u.id) && u.email)
                                .map(user => (
                                    <option key={user.id} value={user.email}>
                                        {user.email}
                                    </option>
                                ))
                            }
                        </select>
                        <button className="bg-white/10 text-white px-4 rounded-lg font-medium hover:bg-white/20 transition-colors text-sm">
                            Add
                        </button>
                    </form>

                    <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                        {group.users.length === 0 ? (
                            <p className="text-gray-500 text-sm text-center py-4">No members yet.</p>
                        ) : (
                            group.users.map(user => (
                                <div key={user.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-bold">
                                            {user.email[0].toUpperCase()}
                                        </div>
                                        <div className="text-sm text-white">{user.email}</div>
                                    </div>
                                    <form action={async () => {
                                        "use server"
                                        await removeUserFromGroup(group.id, user.id)
                                    }}>
                                        <button className="text-xs text-gray-500 hover:text-red-400 p-1">
                                            Remove
                                        </button>
                                    </form>
                                    <button className="text-xs text-gray-500 hover:text-red-400 p-1">
                                        Remove
                                    </button>
                                </form>
                                </div>
                    ))
                        )}
                </div>
            </div>
        </div>
        </div >
    )
}
