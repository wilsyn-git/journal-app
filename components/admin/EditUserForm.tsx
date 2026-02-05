'use client'

import { updateUser } from "@/app/lib/admin-actions"
import { useActionState } from "react"

export function EditUserForm({ user }: { user: { id: string, name: string | null, email: string, excludeFromStats: boolean } }) {
    const [state, action, isPending] = useActionState(updateUser.bind(null, user.id), undefined);

    return (
        <form action={action} className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
                    <input
                        name="name"
                        type="text"
                        defaultValue={user.name || ''}
                        placeholder="e.g. John Doe"
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                    <input
                        name="email"
                        type="email"
                        required
                        defaultValue={user.email}
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                            name="excludeFromStats"
                            type="checkbox"
                            defaultChecked={user.excludeFromStats}
                            className="w-4 h-4 rounded border-white/10 bg-black/20 text-primary focus:ring-primary/50"
                        />
                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Exclude from Statistics (e.g. Test User)</span>
                    </label>
                </div>
            </div>

            {state?.error && (
                <div className="text-red-400 text-sm">{state.error}</div>
            )}

            {state?.success && (
                <div className="text-green-400 text-sm">User updated successfully.</div>
            )}

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isPending}
                    className="bg-white/10 text-white px-4 py-2 rounded-lg font-medium hover:bg-white/20 transition-colors disabled:opacity-50"
                >
                    {isPending ? 'Saving...' : 'Update Details'}
                </button>
            </div>
        </form>
    )
}
