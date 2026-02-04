import { createGroup } from "@/app/lib/admin-actions"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

export default async function NewGroupPage() {
    const session = await auth();
    const orgId = session?.user?.organizationId;

    const profiles = await prisma.profile.findMany({ where: { organizationId: orgId } });
    const users = await prisma.user.findMany({
        where: { organizationId: orgId },
        select: { id: true, email: true },
        orderBy: { email: 'asc' }
    });

    return (
        <div className="max-w-2xl mx-auto">
            <Link href="/admin/groups" className="text-sm text-gray-400 hover:text-white mb-6 inline-block">&larr; Back to Groups</Link>

            <div className="glass-card p-8 border border-white/10 rounded-xl">
                <h1 className="text-2xl font-bold text-white mb-6">Create New Group</h1>

                <form action={async (formData) => {
                    "use server"
                    await createGroup(formData)
                }} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Group Name</label>
                        <input
                            name="name"
                            required
                            placeholder="e.g. Sales Team"
                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
                        <textarea
                            name="description"
                            rows={3}
                            placeholder="Optional description of this group..."
                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Assign Profile</label>
                        <select
                            name="profileId"
                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none appearance-none cursor-pointer"
                        >
                            <option value="">No Profile (Select later)</option>
                            {profiles.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Users in this group will inherit this profile.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Add Initial Members</label>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar border border-white/10 rounded-lg bg-black/20 p-2 space-y-1">
                            {users.map(user => (
                                <label key={user.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="initialUsers"
                                        value={user.email}
                                        className="accent-primary w-4 h-4"
                                    />
                                    <span className="text-sm text-gray-300">{user.email}</span>
                                </label>
                            ))}
                            {users.length === 0 && <p className="text-gray-500 text-sm p-2">No users found.</p>}
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition-colors mt-4"
                    >
                        Create Group
                    </button>
                </form>
            </div>
        </div>
    )
}
