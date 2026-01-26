'use client'

import { useState } from 'react'
import { updateProfile } from '@/app/lib/admin-actions'

export function ProfileEditor({ profile }: { profile: { id: string, name: string, description: string | null } }) {
    const [isEditing, setIsEditing] = useState(false)
    const [name, setName] = useState(profile.name)
    const [description, setDescription] = useState(profile.description || '')

    const handleSave = async () => {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', description);
        await updateProfile(profile.id, formData);
        setIsEditing(false);
    }

    if (!isEditing) {
        return (
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-white">{profile.name}</h1>
                    <button
                        onClick={() => setIsEditing(true)}
                        className="text-gray-500 hover:text-white transition-colors"
                        title="Edit Details"
                    >
                        ✏️
                    </button>
                    <span className="text-gray-500 text-lg font-normal">Rules</span>
                </div>
                <p className="text-gray-400">{profile.description}</p>
            </div>
        )
    }

    return (
        <div className="bg-white/5 p-4 rounded-lg border border-primary/30 max-w-xl animate-in fade-in duration-200">
            <div className="space-y-4">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Name</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-lg text-white font-bold focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => setIsEditing(false)}
                        className="text-sm text-gray-400 hover:text-white px-3 py-1.5"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="text-sm bg-primary text-white px-4 py-1.5 rounded hover:bg-primary/90 font-medium"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    )
}
