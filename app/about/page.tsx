
import Link from "next/link"

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
            {/* Background Gradients */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[20%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-3xl mx-auto px-6 py-20">
                <Link href="/" className="text-sm text-gray-400 hover:text-white mb-8 inline-block">
                    &larr; Back Home
                </Link>

                <h1 className="text-4xl md:text-5xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                    About myJournal
                </h1>

                <div className="prose prose-invert prose-lg text-gray-300">
                    <p>
                        In a world full of noise, <strong>myJournal</strong> is your quiet corner.
                    </p>
                    <p>
                        Self-reflection shouldn't feel like a chore. It shouldn't be about writing pages of text that you never read again. It should be focused, actionable, and revealing.
                    </p>
                    <p>
                        We designed this platform to:
                    </p>
                    <ul>
                        <li><strong>Reduce Friction:</strong> Simple, guided prompts help you start writing immediately.</li>
                        <li><strong>Track Growth:</strong> See your consistency and evolution over time.</li>
                        <li><strong>Protect Privacy:</strong> Your thoughts are yours alone.</li>
                    </ul>
                    <p>
                        Every day, you'll receive a curated set of questions designed to help you process your emotions, plan your day, and practice gratitude.
                    </p>
                    <p className="mt-12 text-center text-white font-medium">
                        Start your journey to mental clarity today.
                    </p>
                </div>

                <div className="mt-12 flex justify-center">
                    <Link
                        href="/login"
                        className="px-8 py-4 rounded-full bg-primary font-semibold text-white shadow-lg hover:bg-primary/90 hover:scale-105 transition-all"
                    >
                        Get Started
                    </Link>
                </div>
            </div>
        </div>
    )
}
