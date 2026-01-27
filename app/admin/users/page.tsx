
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"

import { NewUserForm } from "@/components/admin/NewUserForm"
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog"
import { DeleteUserDialog } from "@/components/admin/DeleteUserDialog"

export default async function AdminUsersPage() {
    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            _count: {
                select: { entries: true }
            }
        }
    })

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-white">Users</h1>
                {/* Placeholder for future if needed, but form handles its own button state */}
            </div>

            <NewUserForm />

            <div className="glass-card overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-white/5 uppercase font-medium text-xs">
                        <tr>
                            <th className="px-6 py-4 text-white">User</th>
                            <th className="px-6 py-4 text-white">Role</th>
                            <th className="px-6 py-4 text-white">Joined</th>
                            <th className="px-6 py-4 text-white">Last Login</th>
                            <th className="px-6 py-4 text-white">Entries</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {users.map(user => (
                            <tr key={user.id} className="hover:bg-white/5 transition-colors group">
                                <td className="px-6 py-4">
                                    <Link href={`/admin/users/${user.id}`} className="block text-blue-400 group-hover:text-blue-300 font-medium">
                                        <div className="flex flex-col">
                                            <span className="text-white">{user.name || '—'}</span>
                                            <span className="text-xs text-gray-500">{user.email}</span>
                                        </div>
                                    </Link>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${user.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4">{new Date(user.createdAt).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-gray-400">
                                    {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : '—'}
                                </td>
                                <td className="px-6 py-4">{user._count.entries}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-3">
                                        <ChangePasswordDialog
                                            targetUserId={user.id}
                                            trigger={
                                                <button className="text-xs text-gray-400 hover:text-white underline decoration-gray-600 hover:decoration-white transition-colors">
                                                    Reset Password
                                                </button>
                                            }
                                        />
                                        <DeleteUserDialog
                                            userId={user.id}
                                            userName={user.name || user.email}
                                            trigger={
                                                <button className="text-xs text-red-400 hover:text-red-300 transition-colors bg-red-500/10 px-2 py-1 rounded">
                                                    Delete
                                                </button>
                                            }
                                        />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
