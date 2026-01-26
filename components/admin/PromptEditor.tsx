'use client'

import { createPrompt, updatePrompt } from "@/app/lib/admin-actions"
import { useState } from "react"

type Prompt = {
    id?: string
    content: string
    type: string
    options?: string | null
    categoryId?: string | null
}

type Category = {
    id: string
    name: string
}

export function PromptEditor({ prompt, categories, categoryId, mode = 'create' }: { prompt?: Prompt, categories?: Category[], categoryId?: string, mode?: 'create' | 'edit' }) {
    const [type, setType] = useState(prompt?.type || 'TEXT');

    // Parse options if editing
    let defaultOptions = '';
    if (prompt?.options) {
        try {
            const parsed = JSON.parse(prompt.options);
            if (Array.isArray(parsed)) defaultOptions = parsed.join(', ');
        } catch (e) { }
    }

    return (
        <form action={mode === 'create' ? createPrompt : updatePrompt.bind(null, prompt?.id!)} className="space-y-6 glass-card p-8 rounded-xl border border-white/10">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Prompt Question</label>
                <textarea
                    name="content"
                    rows={2}
                    required
                    defaultValue={prompt?.content}
                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                    placeholder="e.g. How did you sleep?"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                    <select
                        name="type"
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                    >
                        <option value="TEXT">Text Answer</option>
                        <option value="RADIO">Radio Choices</option>
                        <option value="CHECKBOX">Checkboxes</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Options (for Radio/Checkbox)</label>
                    <input
                        name="options"
                        type="text"
                        defaultValue={defaultOptions}
                        placeholder={type === 'TEXT' ? "Not applicable" : "Default: Yes, No"}
                        disabled={type === 'TEXT'}
                        className={`w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary/50 outline-none ${type === 'TEXT' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                    {(type === 'RADIO' || type === 'CHECKBOX') && (
                        <p className="text-xs text-gray-500 mt-1">Leave blank for &quot;Yes, No&quot;</p>
                    )}
                </div>
            </div>

            {/* Hidden Context Field */}
            <input type="hidden" name="categoryId" value={prompt?.categoryId || categoryId || ''} />

            <div className="pt-4 border-t border-white/10">
                {categoryId && categories && (
                    <p className="text-sm text-gray-400">
                        Category: <span className="text-white font-medium">{categories.find(c => c.id === categoryId)?.name}</span>
                    </p>
                )}
            </div>

            <div className="pt-4">
                <button
                    type="submit"
                    className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition-transform hover:scale-[1.01]"
                >
                    {mode === 'create' ? 'Create Prompt' : 'Update Prompt'}
                </button>
            </div>
        </form>
    )
}
