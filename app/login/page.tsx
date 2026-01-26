'use client';

import { useActionState } from 'react';
import { authenticate } from '@/app/lib/actions';
import Link from 'next/link';

export default function LoginPage() {
    const [errorMessage, dispatch, isPending] = useActionState(authenticate, undefined);

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-background relative overflow-hidden">
            {/* Background Gradients (Borrowed from Landing Page) */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/20 blur-[120px] animate-pulse" />
            </div>

            <div className="relative z-10 w-full max-w-md p-8 glass-card rounded-2xl shadow-2xl border border-white/10 backdrop-blur-xl">

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                        Welcome Back
                    </h1>
                    <p className="text-muted-foreground mt-2">Sign in to continue your journey</p>
                </div>

                <form action={dispatch} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-200 mb-2" htmlFor="email">
                            Email
                        </label>
                        <input
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            id="email"
                            type="email"
                            name="email"
                            placeholder="name@example.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-200 mb-2" htmlFor="password">
                            Password
                        </label>
                        <input
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            id="password"
                            type="password"
                            name="password"
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <Link href="/forgot-password" className="text-primary hover:text-white transition-colors">
                            Forgot Password?
                        </Link>
                    </div>

                    {errorMessage && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center">
                            {errorMessage}
                        </div>
                    )}

                    <button
                        className="w-full py-3.5 rounded-xl bg-primary font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:bg-primary/90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-disabled={isPending}
                    >
                        {isPending ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>
            </div>
        </div>
    );
}
