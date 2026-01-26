'use client'

import { useState } from 'react'
import { changePassword } from '@/app/actions/auth'

type Props = {
    trigger: React.ReactNode
    targetUserId?: string // If provided, acts as Admin Reset (no generic current password required)
}

export function ChangePasswordDialog({ trigger, targetUserId }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setError('')
        setSuccess('')
        setIsLoading(true)

        const formData = new FormData(e.currentTarget)
        const password = formData.get('newPassword') as string
        const confirm = formData.get('confirmPassword') as string

        if (password !== confirm) {
            setError("Passwords do not match")
            setIsLoading(false)
            return
        }

        if (targetUserId) {
            formData.append('targetUserId', targetUserId)
        }

        const result = await changePassword(formData)

        if (result.error) {
            setError(result.error)
        } else {
            setSuccess(targetUserId ? "Password reset successfully" : "Password changed successfully")
            // Clear form? Or just close.
            setTimeout(() => {
                setIsOpen(false)
                setSuccess('')
                setError('')
            }, 1500)
        }
        setIsLoading(false)
    }

    if (!isOpen) {
        return <div onClick={() => setIsOpen(true)}>{trigger}</div>
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#09090b] border border-white/10 rounded-xl p-6 max-w-md w-full shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={() => setIsOpen(false)}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white"
                >
                    ✕
                </button>

                <h2 className="text-xl font-bold text-white mb-2">
                    {targetUserId ? 'Reset User Password' : 'Change Password'}
                </h2>
                <p className="text-sm text-gray-400 mb-6">
                    {targetUserId
                        ? "Enter a new temporary password for this user."
                        : "Please enter your current password to verify your identity."}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!targetUserId && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Current Password</label>
                            <input
                                type="password"
                                name="currentPassword"
                                required
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="••••••••"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">New Password</label>
                        <input
                            type="password"
                            name="newPassword"
                            required
                            minLength={6}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="Min 6 characters"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Confirm New Password</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            required
                            minLength={6}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="Or else..."
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-200 text-sm flex items-center gap-2">
                            ✓ {success}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Saving...' : (targetUserId ? 'Reset Password' : 'Change Password')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
