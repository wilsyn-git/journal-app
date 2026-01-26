
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"
import { deleteProfile } from "@/app/lib/admin-actions"

export default async function AdminProfilesPage() {
    const session = await auth();
    const orgId = session?.user?.organizationId;

    const profiles = await prisma.profile.findMany({
        where: { organizationId: orgId },
        include: { _count: { select: { rules: true } } }
    });

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-white">Profiles</h1>
                <Link
                    href="/admin/profiles/new"
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                    + New Profile
                </Link>
            </div>

            <div className="grid gap-4">
                {profiles.map(profile => (
                    <div key={profile.id} className="glass-card p-6 border border-white/10 rounded-xl flex justify-between items-center">
                        <div>
                            <Link href={`/admin/profiles/${profile.id}`} className="hover:text-primary transition-colors">
                                <h3 className="text-xl font-bold text-white mb-1">{profile.name}</h3>
                            </Link>
                            <p className="text-gray-400 text-sm mb-2">{profile.description}</p>
                            <div className="flex gap-4 text-xs text-gray-500">
                                <span>{profile._count.rules} Rules</span>
                            </div>
                        </div>

                        <form action={deleteProfile.bind(null, profile.id)}>
                            <button className="cursor-pointer text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded border border-red-500/20 hover:bg-red-500/10 transition-colors">
                                Delete
                            </button>
                        </form>
                    </div>
                ))}

                {profiles.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        No profiles found. Create one to segment your users.
                    </div>
                )}
            </div>
        </div>
    )
}
