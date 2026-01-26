'use client'

import { useState } from 'react'
import { resetPassword } from '@/app/actions/forgot-password'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
    const { token } = useParams()
    const router = useRouter()

    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setStatus('loading')

        const formData = new FormData(e.currentTarget)
        const password = formData.get('newPassword') as string
        const confirm = formData.get('confirmPassword') as string

        if (password !== confirm) {
            setStatus('error')
            setMessage("Passwords do not match")
            return
        }

        // Add token to form data
        formData.append('token', token as string)

        const result = await resetPassword(formData)

        if (result.error) {
            setStatus('error')
            setMessage(result.error)
        } else {
            setStatus('success')
            setTimeout(() => router.push('/login'), 3000)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="w-full max-w-md space-y-8 glass-card p-10 rounded-2xl border border-white/10">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-white mb-2">New Password</h1>
                    <p className="text-gray-400">Choose a strong password for your account.</p>
                </div>

                {status === 'success' ? (
                    <div className="text-center py-8 animate-in fade-in zoom-in duration-300">
                        <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                            ✓
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">Password Reset!</h3>
                        <p className="text-gray-400 mb-6">Redirecting to login...</p>
                        <Link href="/login" className="text-primary hover:text-white transition-colors font-medium">
                            Go to Login
                        </Link>
                    </div>
                ) : (
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                New Password
                            </label>
                            <input
                                name="newPassword"
                                type="password"
                                required
                                minLength={6}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                placeholder="••••••••"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Confirm Password
                            </label>
                            <input
                                name="confirmPassword"
                                type="password"
                                required
                                minLength={6}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                placeholder="••••••••"
                            />
                        </div>

                        {status === 'error' && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm text-center">
                                {message}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {status === 'loading' ? 'Resetting...' : 'Reset Password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
