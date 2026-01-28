'use client'

import { useRef, useState } from 'react'
import { importPrompts } from '@/app/lib/admin-actions'

export function PromptImporter() {
    const inputRef = useRef<HTMLInputElement>(null)
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        setStatus('loading')
        setMessage('')

        const formData = new FormData()
        formData.append('file', file)

        const result = await importPrompts(formData)

        if (result.error) {
            setStatus('error')
            setMessage(result.error)
            setTimeout(() => {
                setStatus('idle')
                setMessage('')
            }, 5000)
        } else {
            setStatus('success')
            // Don't auto-hide if we have details, let the user read it.
            // But we need to store details in state if we want to render them complexly.
            // For now, let's format the message string nicely if details exist.

            if ((result as any).details) {
                const d = (result as any).details
                // Determine if strict JSON-serializable object needs casting or if we can use it.
                // admin-actions is server code, so it returns plain JSON.
                setMessage(
                    `Parsed ${d.detectedCategories} Categories, ${d.detectedPrompts} Prompts.\n` +
                    `✅ Added ${d.createdCategories} Cat, ${d.createdPrompts} Prompts.\n` +
                    `⏭️ Skipped ${d.skippedCategories} Cat, ${d.skippedPrompts} Prompts.`
                )
            } else {
                setMessage(result.message || 'Import successful')
                setTimeout(() => {
                    setStatus('idle')
                    setMessage('')
                }, 3000)
            }

            if (inputRef.current) inputRef.current.value = ''
        }
    }

    return (
        <div className="relative group">
            <input
                type="file"
                accept=".json"
                ref={inputRef}
                className="hidden"
                onChange={handleFile}
            />

            <button
                onClick={() => inputRef.current?.click()}
                disabled={status === 'loading'}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/10"
            >
                {status === 'loading' ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                )}
                Import JSON
            </button>

            {/* Status Popover */}
            {(status === 'error' || status === 'success') && (
                <div className={`absolute top-full right-0 mt-2 p-4 rounded-xl shadow-2xl z-50 w-64 backdrop-blur-md border animate-in fade-in zoom-in-95 ${status === 'error'
                    ? 'bg-red-950/90 text-red-200 border-red-500/30'
                    : 'bg-green-950/90 text-green-200 border-green-500/30'
                    }`}>
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold flex items-center gap-2">
                            {status === 'error' ? '❌ Error' : '✅ Report'}
                        </h4>
                        <button onClick={() => setStatus('idle')} className="text-xs hover:text-white opacity-60 hover:opacity-100">✕</button>
                    </div>
                    <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed opacity-90">
                        {message}
                    </pre>
                </div>
            )}
        </div>
    )
}
