"use client";

import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-white px-4">
      <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center text-primary mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground mb-8">
          An unexpected error occurred while loading the dashboard.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-6 py-3 rounded-full bg-primary font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(139,92,246,0.7)] hover:scale-105 transition-all duration-300"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-full border border-white/10 bg-white/5 font-medium text-white/90 hover:bg-white/10 transition-all duration-300"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
