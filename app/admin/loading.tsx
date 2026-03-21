export default function AdminLoading() {
    return (
        <div>
            {/* Title */}
            <div className="h-8 w-40 bg-white/10 rounded animate-pulse mb-8" />

            {/* Core Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-6 rounded-xl border border-white/10 space-y-3">
                        <div className="h-3 w-24 bg-white/5 rounded animate-pulse" />
                        <div className="flex items-baseline gap-2 mt-2">
                            <div className="h-10 w-20 bg-white/10 rounded animate-pulse" />
                            <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Engagement Section */}
            <div className="h-6 w-32 bg-white/10 rounded animate-pulse mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-6 rounded-xl border border-white/10 space-y-3">
                        <div className="h-3 w-28 bg-white/5 rounded animate-pulse" />
                        <div className="h-10 w-16 bg-white/10 rounded animate-pulse" />
                        <div className="h-3 w-48 bg-white/5 rounded animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    )
}
