"use client";

import Link from "next/link";

// Rendered only if the root layout itself throws. Next prerenders /_global-error
// statically, so its framework scripts are un-nonced and blocked by our strict CSP
// (#58). Recovery therefore must NOT depend on JS hydration — a plain anchor does a
// full-page navigation that always works without scripts, instead of a reset() button.
export default function GlobalError() {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white px-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-10 max-w-md w-full text-center">
          <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-neutral-400 mb-8">
            A critical error occurred. Please try again.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-full bg-[#7c3aed] font-semibold text-white hover:opacity-90 transition-opacity duration-300"
          >
            Try again
          </Link>
        </div>
      </body>
    </html>
  );
}
