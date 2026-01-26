
import { createGroup } from "@/app/lib/admin-actions"
import Link from "next/link"

export default function NewGroupPage() {
    return (
        <div className="max-w-2xl mx-auto">
            <Link href="/admin/groups" className="text-sm text-gray-400 hover:text-white mb-6 inline-block">&larr; Back to Groups</Link>

            <div className="glass-card p-8 border border-white/10 rounded-xl">
                <h1 className="text-2xl font-bold text-white mb-6">Create New Group</h1>

                <form action={async (formData) => {
                    "use server"
                    await createGroup(formData)
                }} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Group Name</label>
                        <input
                            name="name"
                            required
                            placeholder="e.g. Sales Team"
                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
                        <textarea
                            name="description"
                            rows={3}
                            placeholder="Optional description of this group..."
                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition-colors"
                    >
                        Create Group
                    </button>
                </form>
            </div>
        </div>
    )
}
