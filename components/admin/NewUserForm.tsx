'use client'

import { useActionState, useEffect, useState } from "react"
import { createUser } from "@/app/lib/admin-actions"

export function NewUserForm() {
    const [isOpen, setIsOpen] = useState(false);
    const [state, action, isPending] = useActionState(createUser, undefined);

    useEffect(() => {
        if (state?.success) {
            setIsOpen(false);
        }
    }, [state]);

    if (!isOpen) {
        return (
            <div className="mb-8">
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-primary text-white px-4 py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors text-sm"
                >
                    + Create User
                </button>
            </div>
        )
    }

    return (
        <div className="glass-card p-6 rounded-xl border border-white/10 mb-12 animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">New User</h2>
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <form action={action} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
                        <input
                            name="name"
                            type="text"
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
                            placeholder="user@example.com"
                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                    <input
                        name="password"
                        type="text" // Visible for admin creation convenience? Or password type?
                        // Let's use text so admin can see what they are typing to tell the user. 
                        // Or password with a toggle. Let's stick to text for admin convenience "Copy this password".
                        required
                        placeholder="Initial Password"
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">Make sure to copy this password to share with the user.</p>
                </div>

                {state?.error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-200 text-sm rounded-lg">
                        {state.error}
                    </div>
                )}

                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="flex-1 bg-white/5 text-white py-2 rounded-lg font-medium hover:bg-white/10 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isPending}
                        className="flex-1 bg-primary text-white py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        {isPending ? 'Creating...' : 'Create Account'}
                    </button>
                </div>
            </form>
        </div>
    )
}
