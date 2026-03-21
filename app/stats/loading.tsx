export default function StatsLoading() {
    return (
        <div className="flex min-h-screen bg-background text-foreground">
            {/* Sidebar Skeleton */}
            <div className="w-64 border-r border-white/10 hidden md:flex flex-col bg-background/50">
                <div className="p-6 border-b border-white/10">
                    <div className="h-6 w-32 bg-white/10 rounded animate-pulse" />
                </div>
                <div className="p-4 flex-1">
                    <div className="h-10 w-full bg-white/5 rounded-lg animate-pulse" />
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-4xl mx-auto">
                    {/* Title */}
                    <div className="flex justify-between items-end mb-8">
                        <div className="space-y-2">
                            <div className="h-9 w-64 bg-white/10 rounded animate-pulse" />
                            <div className="h-4 w-48 bg-white/5 rounded animate-pulse" />
                        </div>
                        <div className="text-right space-y-1">
                            <div className="h-8 w-12 bg-white/10 rounded animate-pulse ml-auto" />
                            <div className="h-3 w-20 bg-white/5 rounded animate-pulse" />
                        </div>
                    </div>

                    {/* Big Numbers Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="p-6 rounded-xl border border-white/10 space-y-2">
                                <div className="h-8 w-16 bg-white/10 rounded animate-pulse" />
                                <div className="h-3 w-20 bg-white/5 rounded animate-pulse" />
                            </div>
                        ))}
                    </div>

                    {/* Heatmap Section */}
                    <div className="mb-12">
                        <div className="h-6 w-40 bg-white/10 rounded animate-pulse mb-4" />
                        <div className="p-6 rounded-xl border border-white/10">
                            <div className="h-28 w-full bg-white/5 rounded animate-pulse" />
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                        {Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="p-6 rounded-xl border border-white/10 space-y-4">
                                <div className="h-6 w-40 bg-white/10 rounded animate-pulse" />
                                <div className="h-48 w-full bg-white/5 rounded animate-pulse" />
                            </div>
                        ))}
                    </div>

                    {/* Achievements */}
                    <div className="mb-12">
                        <div className="h-6 w-32 bg-white/10 rounded animate-pulse mb-4" />
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-20 rounded-xl border border-white/10 bg-white/5 animate-pulse" />
                            ))}
                        </div>
                    </div>

                    {/* Habit Consistency */}
                    <div className="h-7 w-44 bg-white/10 rounded animate-pulse mb-6" />
                    <div className="space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="p-4 rounded-xl border border-white/10 flex justify-between items-center">
                                <div className="space-y-2 flex-1">
                                    <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
                                    <div className="h-3 w-28 bg-white/5 rounded animate-pulse" />
                                </div>
                                <div className="flex gap-8">
                                    <div className="space-y-1 text-right">
                                        <div className="h-6 w-8 bg-white/10 rounded animate-pulse ml-auto" />
                                        <div className="h-2 w-10 bg-white/5 rounded animate-pulse" />
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <div className="h-6 w-8 bg-white/10 rounded animate-pulse ml-auto" />
                                        <div className="h-2 w-10 bg-white/5 rounded animate-pulse" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
