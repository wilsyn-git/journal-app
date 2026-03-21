"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white px-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-10 max-w-md w-full text-center">
          <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-neutral-400 mb-8">
            A critical error occurred. Please try again.
          </p>
          <button
            onClick={() => reset()}
            className="px-6 py-3 rounded-full bg-[#7c3aed] font-semibold text-white hover:opacity-90 transition-opacity duration-300"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
