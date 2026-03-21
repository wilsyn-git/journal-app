export default function SettingsLoading() {
    return (
        <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
            {/* Sidebar Skeleton */}
            <div className="w-64 border-r border-white/10 bg-black/20 flex flex-col p-4">
                <div className="h-6 w-32 bg-white/10 rounded animate-pulse mb-8" />
                <div className="h-10 w-full bg-white/5 rounded-lg animate-pulse" />
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-2xl mx-auto">
                    {/* Title */}
                    <div className="h-8 w-32 bg-white/10 rounded animate-pulse mb-8" />

                    {/* Profile Section */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8 space-y-6">
                        <div className="h-6 w-20 bg-white/10 rounded animate-pulse" />

                        {/* Avatar */}
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-white/10 animate-pulse" />
                            <div className="h-8 w-28 bg-white/5 rounded-lg animate-pulse" />
                        </div>

                        {/* Form Fields */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
                                <div className="h-10 w-full bg-white/5 rounded-lg animate-pulse" />
                            </div>
                            <div className="space-y-2">
                                <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
                                <div className="h-10 w-full bg-white/5 rounded-lg animate-pulse" />
                            </div>
                            <div className="space-y-2">
                                <div className="h-4 w-10 bg-white/10 rounded animate-pulse" />
                                <div className="h-24 w-full bg-white/5 rounded-lg animate-pulse" />
                            </div>
                        </div>

                        {/* Save Button */}
                        <div className="h-10 w-28 bg-white/10 rounded-lg animate-pulse" />
                    </div>

                    {/* Security Section */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8">
                        <div className="h-6 w-20 bg-white/10 rounded animate-pulse mb-4" />
                        <div className="flex items-center justify-between">
                            <div className="space-y-2">
                                <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
                                <div className="h-3 w-56 bg-white/5 rounded animate-pulse" />
                            </div>
                            <div className="h-9 w-36 bg-white/10 rounded-lg animate-pulse" />
                        </div>
                    </div>

                    {/* Account Info Section */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                        <div className="h-6 w-44 bg-white/10 rounded animate-pulse mb-4" />
                        <div className="space-y-2">
                            <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
                            <div className="h-3 w-64 bg-white/5 rounded animate-pulse" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
