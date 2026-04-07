'use client'

import { createPrompt, updatePrompt } from "@/app/actions/prompts"
import { useState } from "react"
import { PROMPT_TYPES } from '@/lib/promptConstants'
import { useRouter } from "next/navigation"

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
    const router = useRouter();
    const [type, setType] = useState(prompt?.type || PROMPT_TYPES.TEXT);

    // Parse options if editing
    let defaultOptions = '';
    let rangeMinLabel = 'Low';
    let rangeMaxLabel = 'High';

    if (prompt?.options) {
        try {
            const parsed = JSON.parse(prompt.options);
            if (Array.isArray(parsed)) {
                if (prompt.type === PROMPT_TYPES.RANGE && parsed.length >= 2) {
                    rangeMinLabel = parsed[0];
                    rangeMaxLabel = parsed[1];
                } else {
                    defaultOptions = parsed.join(', ');
                }
            }
        } catch (e) { }
    }

    return (
        <form action={async (formData) => {
            // Pre-process options for RANGE before submitting
            if (type === PROMPT_TYPES.RANGE) {
                const min = formData.get('rangeMinLabel') as string || 'Low';
                const max = formData.get('rangeMaxLabel') as string || 'High';
                formData.set('options', JSON.stringify([min, max]));
                formData.delete('rangeMinLabel');
                formData.delete('rangeMaxLabel');
            }

            let result;
            if (mode === 'create') {
                result = await createPrompt(formData)
            } else {
                if (prompt?.id) result = await updatePrompt(prompt.id, formData)
            }

            if (result && 'success' in result && result.success) {
                // Redirect back to list
                const catId = formData.get('categoryId') as string;
                if (catId) {
                    router.push(`/admin/prompts?cat=${catId}`);
                } else {
                    router.push('/admin/prompts');
                }
            }
        }} className="space-y-6 glass-card p-8 rounded-xl border border-white/10">
            <div>
                <label htmlFor="prompt-content" className="block text-sm font-medium text-gray-300 mb-2">Prompt Question</label>
                <textarea
                    id="prompt-content"
                    name="content"
                    rows={2}
                    required
                    defaultValue={prompt?.content}
                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none"
                    placeholder="e.g. How did you sleep?"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="prompt-type" className="block text-sm font-medium text-gray-300 mb-2">Type</label>
                    <select
                        id="prompt-type"
                        name="type"
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none"
                    >
                        <option value="TEXT">Text Answer</option>
                        <option value="RADIO">Radio Choices</option>
                        <option value="CHECKBOX">Checkboxes</option>
                        <option value="RANGE">Slider</option>
                    </select>
                </div>

                {/* Dynamic Options Field based on Type */}
                {type === PROMPT_TYPES.RANGE ? (
                    <div className="space-y-2">
                        <label htmlFor="prompt-range-min" className="block text-sm font-medium text-gray-300">Slider Labels</label>
                        <div className="flex gap-2">
                            <input
                                id="prompt-range-min"
                                name="rangeMinLabel"
                                type="text"
                                defaultValue={rangeMinLabel}
                                placeholder="Low (Left)"
                                className="w-1/2 bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none"
                            />
                            <input
                                name="rangeMaxLabel"
                                type="text"
                                defaultValue={rangeMaxLabel}
                                placeholder="High (Right)"
                                className="w-1/2 bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none"
                            />
                        </div>
                        <p className="text-xs text-gray-400">Labels for the low and high ends of the slider.</p>
                        {mode === 'edit' && <p className="text-xs text-amber-500">Warning: Changing labels does not update historical data.</p>}
                    </div>
                ) : (
                    <div>
                        <label htmlFor="prompt-options" className="block text-sm font-medium text-gray-300 mb-2">Options (for Radio/Checkbox)</label>
                        <input
                            id="prompt-options"
                            name="options"
                            type="text"
                            defaultValue={defaultOptions}
                            placeholder={type === PROMPT_TYPES.TEXT ? "Not applicable" : "Default: Yes, No"}
                            disabled={type === PROMPT_TYPES.TEXT}
                            className={`w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none ${type === PROMPT_TYPES.TEXT ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        {(type === PROMPT_TYPES.RADIO || type === PROMPT_TYPES.CHECKBOX) && (
                            <p className="text-xs text-gray-400 mt-1">Leave blank for &quot;Yes, No&quot;. Comma separated.</p>
                        )}
                    </div>
                )}
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
