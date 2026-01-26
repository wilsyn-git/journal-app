'use client'

import { useState } from 'react'
import { deletePromptCategory } from '@/app/lib/admin-actions'
import { useToast } from '@/components/providers/ToastProvider'

type Props = {
    categoryId: string
    categoryName: string
}

export function DeleteCategoryButton({ categoryId, categoryName }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const { addToast } = useToast()

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDeleting(true)

        const res = await deletePromptCategory(categoryId)

        if (res.success) {
            setIsOpen(false) // Close modal immediately
            // Show global toast that persists
            addToast('success', (
                <div>
                    <strong className="block mb-1">Deleted {res.details.categoryName}</strong>
                    <ul className="text-xs opacity-90 space-y-0.5">
                        <li>🗑️ {res.details.promptsDeleted} Prompts removed</li>
                        <li>🧹 {res.details.rulesDeleted} Profile Rules updated</li>
                    </ul>
                </div>
            ), 5000)
        } else {
            setIsDeleting(false)
            // Show error in toast or keep modal? Toast is fine.
            addToast('error', res.error || "Failed to delete")
            setIsOpen(false)
        }
    }

    const handleOpen = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsOpen(true)
    }

    const handleClose = (e?: React.MouseEvent) => {
        e?.preventDefault()
        e?.stopPropagation()
        setIsOpen(false)
    }

    return (
        <>
            <button
                onClick={handleOpen}
                className="p-1.5 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Delete Category"
            >
                🗑️
            </button>

            {isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in cursor-default"
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                    }}
                >
                    <div className="bg-[#09090b] border border-white/10 rounded-xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-white mb-2">Delete Category?</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            Are you sure you want to delete <span className="text-white font-medium">{categoryName}</span>?
                            <br /><br />
                            This will remove all prompts in this category and cleanup any user profiles relying on it.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                            >
                                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
