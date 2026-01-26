'use client'

import { useState } from 'react'
import { createPromptCategory } from '@/app/lib/admin-actions'

export function NewCategoryForm() {
    const [isAdding, setIsAdding] = useState(false)

    if (!isAdding) {
        return (
            <button
                onClick={() => setIsAdding(true)}
                className="text-xs bg-primary/20 text-primary hover:bg-primary hover:text-white px-2 py-1 rounded transition-colors"
            >
                + Add
            </button>
        )
    }

    return (
        <form
            action={async (formData) => {
                await createPromptCategory(formData);
                setIsAdding(false);
            }}
            className="absolute top-12 left-2 right-2 p-3 bg-black/90 border border-white/20 rounded-lg shadow-xl z-10 animate-in fade-in zoom-in-95 duration-200"
        >
            <div className="flex flex-col gap-2">
                <input
                    name="name"
                    autoFocus
                    placeholder="Category Name"
                    className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsAdding(false);
                    }}
                />
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => setIsAdding(false)}
                        className="text-xs text-gray-400 hover:text-white px-2 py-1"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="text-xs bg-primary text-white px-3 py-1 rounded hover:bg-primary/90"
                    >
                        Create
                    </button>
                </div>
            </div>
        </form>
    )
}
