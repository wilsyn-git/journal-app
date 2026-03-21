export default function DashboardLoading() {
    return (
        <div className="flex w-full h-screen bg-background text-foreground overflow-hidden">
            {/* Sidebar Skeleton */}
            <aside className="hidden md:flex w-64 flex-col border-r border-white/10 bg-black/20">
                {/* Logo Area */}
                <div className="p-6 border-b border-white/10">
                    <div className="h-6 w-32 bg-white/10 rounded animate-pulse" />
                </div>

                {/* Nav Links */}
                <div className="flex-1 p-4 space-y-3">
                    <div className="h-10 w-full bg-white/5 rounded-lg animate-pulse" />
                    <div className="h-10 w-full bg-white/5 rounded-lg animate-pulse" />

                    {/* Calendar Skeleton */}
                    <div className="mt-6 space-y-2">
                        <div className="h-5 w-24 bg-white/10 rounded animate-pulse" />
                        <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: 35 }).map((_, i) => (
                                <div key={i} className="h-6 w-6 bg-white/5 rounded animate-pulse" />
                            ))}
                        </div>
                    </div>
                </div>

                {/* User Area */}
                <div className="p-4 border-t border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
                        <div className="space-y-1">
                            <div className="h-3 w-20 bg-white/10 rounded animate-pulse" />
                            <div className="h-2 w-14 bg-white/5 rounded animate-pulse" />
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col w-full h-full overflow-hidden">
                {/* Mobile Header */}
                <header className="md:hidden border-b border-white/10 p-4 flex justify-between items-center">
                    <div className="h-6 w-32 bg-white/10 rounded animate-pulse" />
                    <div className="h-6 w-16 bg-white/5 rounded animate-pulse" />
                </header>

                {/* Desktop Header / Stats Bar */}
                <div className="hidden md:flex flex-col p-6 px-10 border-b border-white/5 gap-4">
                    <div className="flex justify-between items-center">
                        <div className="h-4 w-28 bg-white/5 rounded animate-pulse" />
                        <div className="h-6 w-20 bg-white/5 rounded-full animate-pulse" />
                    </div>
                    {/* Heatmap Skeleton */}
                    <div className="h-16 w-full bg-white/5 rounded animate-pulse" />
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-10">
                    <div className="max-w-7xl mx-auto w-full space-y-6">
                        {/* Journal Prompt Skeletons */}
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="space-y-3">
                                <div className="h-5 w-48 bg-white/10 rounded animate-pulse" />
                                <div className="h-32 w-full bg-white/5 rounded-xl animate-pulse" />
                            </div>
                        ))}
                        {/* Submit Button Skeleton */}
                        <div className="h-10 w-32 bg-white/10 rounded-lg animate-pulse mt-4" />
                    </div>
                </div>
            </main>
        </div>
    )
}
