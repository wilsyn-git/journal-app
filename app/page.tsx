import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-background text-foreground selection:bg-primary/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/20 blur-[120px] animate-pulse" />
      </div>

      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8">

        {/* Navigation / Header */}
        <header className="absolute top-0 w-full p-6 flex justify-between items-center max-w-7xl mx-auto">
          <div className="text-xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
            Journal<span className="text-primary">.ai</span>
          </div>
          <nav>
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
            >
              Log in
            </Link>
          </nav>
        </header>

        {/* Hero Section */}
        <section className="text-center max-w-4xl mx-auto mt-20 sm:mt-0 animate-[fade-in_1s_ease-out]">
          <div className="inline-block mb-4 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm">
            <span className="text-xs font-medium bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
              New: AI-Powered Insights
            </span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
            Your Mind, <br />
            <span className="text-white">De-cluttered.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Capture your thoughts, find clarity, and track your personal growth with a journaling experience designed for focus.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/dashboard"
              className="px-8 py-4 rounded-full bg-primary font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(139,92,246,0.7)] hover:scale-105 transition-all duration-300"
            >
              Start Daily Journal
            </Link>
            <Link
              href="/about"
              className="px-8 py-4 rounded-full glass-panel font-medium text-white/90 hover:bg-white/10 transition-all duration-300"
            >
              Learn More
            </Link>
          </div>
        </section>

        {/* Feature Cards */}
        <section className="mt-24 w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6 px-4 pb-20 animate-[slide-up_1s_ease-out_0.5s_both]">
          {/* Card 1 */}
          <div className="glass-card p-8 rounded-2xl flex flex-col gap-4 group">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
              <span className="text-2xl">✨</span>
            </div>
            <h3 className="text-xl font-semibold text-white">Daily Prompts</h3>
            <p className="text-muted-foreground leading-relaxed">
              Receive curated prompts every morning tailored to your personal growth journey.
            </p>
          </div>

          {/* Card 2 */}
          <div className="glass-card p-8 rounded-2xl flex flex-col gap-4 group">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
              <span className="text-2xl">🔒</span>
            </div>
            <h3 className="text-xl font-semibold text-white">Secure Storage</h3>
            <p className="text-muted-foreground leading-relaxed">
              Your thoughts are private using end-to-end encryption. Only you have the key.
            </p>
          </div>

          {/* Card 3 */}
          <div className="glass-card p-8 rounded-2xl flex flex-col gap-4 group">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-xl font-semibold text-white">Growth Analytics</h3>
            <p className="text-muted-foreground leading-relaxed">
              Visualize your mood trends and consistency streaks over time.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="absolute bottom-4 text-center text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Journal.ai. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
