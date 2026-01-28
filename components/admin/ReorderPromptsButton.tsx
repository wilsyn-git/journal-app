'use client'

import { useState } from 'react'
import { ReorderPromptsDialog } from './ReorderPromptsDialog'

type Props = {
    categoryId: string
    categoryName: string
    prompts: any[]
}

export function ReorderPromptsButton({ categoryId, categoryName, prompts }: Props) {
    const [isOpen, setIsOpen] = useState(false)

    // Only show button if there are prompts to reorder
    if (!prompts || prompts.length < 2) return null

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="text-xs bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white px-3 py-1.5 rounded transition-colors flex items-center gap-2 border border-white/10"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" /><line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" /></svg>
                Reorder
            </button>

            {isOpen && (
                <ReorderPromptsDialog
                    categoryId={categoryId}
                    categoryName={categoryName}
                    prompts={prompts}
                    onOpenChange={setIsOpen}
                />
            )}
        </>
    )
}
