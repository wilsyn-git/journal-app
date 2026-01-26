
import { createProfile } from "@/app/lib/admin-actions"
import Link from "next/link"

export default function NewProfilePage() {
    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-8">
                <Link href="/admin/profiles" className="text-sm text-gray-400 hover:text-white mb-2 inline-block">&larr; Back to Profiles</Link>
                <h1 className="text-3xl font-bold text-white">New Profile</h1>
            </div>

            <form action={createProfile} className="space-y-6 glass-card p-8 rounded-xl border border-white/10">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Profile Name</label>
                    <input
                        name="name"
                        type="text"
                        required
                        placeholder="e.g. Anxiety Track, Leadership Group"
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                    <textarea
                        name="description"
                        rows={3}
                        placeholder="Brief description of this profile's purpose."
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                </div>

                <div className="pt-4">
                    <button
                        type="submit"
                        className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition-transform hover:scale-[1.01]"
                    >
                        Create Profile
                    </button>
                </div>
            </form>
        </div>
    )
}
