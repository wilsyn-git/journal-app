
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"
import { createGroup, deleteGroup } from "@/app/lib/admin-actions"

export default async function AdminGroupsPage() {
    const session = await auth();
    const orgId = session?.user?.organizationId;

    const groups = await prisma.userGroup.findMany({
        where: { organizationId: orgId },
        include: { _count: { select: { users: true, profiles: true } } }
    });

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-white">User Groups</h1>
                <Link
                    href="/admin/groups/new"
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                    + New Group
                </Link>
            </div>

            <div className="grid gap-4">
                {groups.map(group => (
                    <div key={group.id} className="glass-card p-6 border border-white/10 rounded-xl flex justify-between items-center">
                        <div>
                            <Link href={`/admin/groups/${group.id}`} className="hover:text-primary transition-colors">
                                <h3 className="text-xl font-bold text-white mb-1">{group.name}</h3>
                            </Link>
                            <p className="text-gray-400 text-sm mb-2">{group.description}</p>
                            <div className="flex gap-4 text-xs text-gray-500">
                                <span>{group._count.users} Users</span>
                                <span>{group._count.profiles} Profiles</span>
                            </div>
                        </div>

                        <form action={deleteGroup.bind(null, group.id)}>
                            <button className="cursor-pointer text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded border border-red-500/20 hover:bg-red-500/10 transition-colors">
                                Delete
                            </button>
                        </form>
                    </div>
                ))}

                {groups.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        No groups found. Create one to organize your users.
                    </div>
                )}
            </div>
        </div>
    )
}
