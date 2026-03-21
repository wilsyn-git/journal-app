import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-white px-4">
      <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center">
        <div className="text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40 mb-2">
          404
        </div>
        <h2 className="text-2xl font-semibold mb-2">Page Not Found</h2>
        <p className="text-muted-foreground mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-full bg-primary font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(139,92,246,0.7)] hover:scale-105 transition-all duration-300"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
