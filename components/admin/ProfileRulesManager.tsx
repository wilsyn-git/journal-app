'use client'

import { useState } from 'react'
import { addProfileRule, deleteProfileRule, updateProfileRule, moveProfileRule } from '@/app/lib/admin-actions'

type Category = {
    id: string;
    name: string;
}

type Rule = {
    id: string;
    categoryString: string | null;
    categoryId: string | null;
    minCount: number;
    maxCount: number;
    includeAll: boolean;
    categoryPrompt?: { name: string } | null;
}

export function ProfileRulesManager({
    profileId,
    initialRules,
    categories
}: {
    profileId: string,
    initialRules: Rule[],
    categories: Category[]
}) {
    const [isAdding, setIsAdding] = useState(false)
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Optimistic UI could be handled here, but server actions with revalidatePath usually suffcie for admin panels.

    // We'll use a controlled form approach for better UX on "Include All" toggle?
    // Or just simple JS toggle if we want to avoid complex state management for every rule row.
    // For the "Add" form, we can use local state.
    const [addIncludeAll, setAddIncludeAll] = useState(false);

    // For editing, we might need to rely on the `rule` prop or local state if we want instant feedback.
    // Since we map over rules, we can use a component per rule or just uncontrolled inputs with some CSS/JS?
    // Let's make a small helper component for the form fields to reuse logic?
    // Or just inline it for now.

    return (
        <div className="glass-card p-6 border border-white/10 rounded-xl">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Generation Rules</h2>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="text-primary hover:text-white transition-colors bg-primary/20 p-2 rounded-lg"
                    title="Add new rule"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
            </div>

            {/* Add Form */}
            {isAdding && (
                <form
                    action={async (formData) => {
                        const includeAll = formData.get('includeAll') === 'on';
                        if (!includeAll) {
                            const min = parseInt(formData.get('minCount') as string);
                            const max = parseInt(formData.get('maxCount') as string);

                            if (min > max) {
                                setError("Min count cannot be greater than Max count");
                                return;
                            }
                        }

                        const result = await addProfileRule(profileId, formData);
                        if (result?.error) {
                            setError(result.error);
                        } else {
                            setError(null);
                            setIsAdding(false);
                            setAddIncludeAll(false);
                        }
                    }}
                    className="mb-6 bg-white/5 p-4 rounded-lg border border-primary/30 animate-in slide-in-from-top-2 duration-200"
                >
                    <h3 className="text-sm font-bold text-white mb-3">New Rule</h3>

                    {error && (
                        <div className="mb-3 bg-red-500/10 border border-red-500/50 text-red-200 p-2 rounded text-xs flex justify-between items-center">
                            <span>{error}</span>
                            <button type="button" onClick={() => setError(null)}>✕</button>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Category</label>
                            <select
                                name="categoryId"
                                required
                                className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            >
                                <option value="">Select Category</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    /* Wait, if I pass name, I can verify migration strategy. 
                                       But schema uses relations. I should pass ID.
                                       If I pass ID, `createPrompt` logic needs to handle it.
                                    */
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                name="includeAll"
                                id="add_includeAll"
                                checked={addIncludeAll}
                                onChange={(e) => setAddIncludeAll(e.target.checked)}
                                className="accent-primary"
                            />
                            <label htmlFor="add_includeAll" className="text-sm text-white">Include All Prompts</label>
                        </div>

                        {!addIncludeAll && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Min</label>
                                    <input name="minCount" type="number" min="1" max="10" defaultValue="1" className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm text-white" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Max</label>
                                    <input name="maxCount" type="number" min="1" max="10" defaultValue="3" className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm text-white" />
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                type="button"
                                onClick={() => { setIsAdding(false); setError(null); setAddIncludeAll(false); }}
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
            )}

            {/* List */}
            <div className="space-y-3">
                {initialRules.length === 0 && !isAdding && (
                    <p className="text-gray-500 text-sm text-center py-4">No rules defined.</p>
                )}

                {initialRules.map(rule => {
                    const isEditing = editingRuleId === rule.id;
                    const categoryName = rule.categoryPrompt?.name || rule.categoryString || 'Unknown';
                    const categoryId = rule.categoryId || ''; // Use ID for select value

                    if (isEditing) {
                        return <EditRuleForm key={rule.id} rule={rule} profileId={profileId} categories={categories} onCancel={() => { setEditingRuleId(null); setError(null); }} />
                    }

                    return (
                        <div key={rule.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 group hover:border-white/10 transition-colors">
                            <div>
                                <div className="font-bold text-purple-400">{categoryName}</div>
                                <div className="text-xs text-gray-400">
                                    {rule.includeAll ? (
                                        <span className="text-green-400">Include All</span>
                                    ) : (
                                        rule.minCount === rule.maxCount
                                            ? `${rule.minCount} prompts`
                                            : `${rule.minCount} - ${rule.maxCount} prompts`
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="flex flex-col gap-0.5 mr-2">
                                    <form action={async () => await moveProfileRule(rule.id, profileId, 'UP')}>
                                        <button
                                            className="p-1 text-gray-500 hover:text-white hover:bg-white/10 rounded flex items-center justify-center h-4 w-6"
                                            title="Move Up"
                                        >
                                            <span className="text-[10px]">▲</span>
                                        </button>
                                    </form>
                                    <form action={async () => await moveProfileRule(rule.id, profileId, 'DOWN')}>
                                        <button
                                            className="p-1 text-gray-500 hover:text-white hover:bg-white/10 rounded flex items-center justify-center h-4 w-6"
                                            title="Move Down"
                                        >
                                            <span className="text-[10px]">▼</span>
                                        </button>
                                    </form>
                                </div>
                                <button
                                    onClick={() => setEditingRuleId(rule.id)}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded"
                                    title="Edit"
                                >
                                    ✏️
                                </button>
                                <form action={async () => await deleteProfileRule(rule.id, profileId)}>
                                    <button
                                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded"
                                        title="Delete"
                                    >
                                        ✕
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function EditRuleForm({ rule, profileId, categories, onCancel }: { rule: Rule, profileId: string, categories: Category[], onCancel: () => void }) {
    const [includeAll, setIncludeAll] = useState(rule.includeAll ?? false);
    const [error, setError] = useState<string | null>(null);

    return (
        <form
            action={async (formData) => {
                const includeAllCheck = formData.get('includeAll') === 'on';
                if (!includeAllCheck) {
                    const min = parseInt(formData.get('minCount') as string);
                    const max = parseInt(formData.get('maxCount') as string);

                    if (min > max) {
                        setError("Min count cannot be greater than Max count");
                        return;
                    }
                }

                await updateProfileRule(rule.id, profileId, formData);
                onCancel();
            }}
            className="bg-white/5 p-4 rounded-lg border border-primary/30"
        >
            {error && (
                <div className="mb-3 bg-red-500/10 border border-red-500/50 text-red-200 p-2 rounded text-xs flex justify-between items-center">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError(null)}>✕</button>
                </div>
            )}

            <div className="space-y-3">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Category</label>
                    <select
                        name="categoryId"
                        required
                        defaultValue={rule.categoryId || ''}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                    >
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        name="includeAll"
                        id={`edit_includeAll_${rule.id}`}
                        checked={includeAll}
                        onChange={(e) => setIncludeAll(e.target.checked)}
                        className="accent-primary"
                    />
                    <label htmlFor={`edit_includeAll_${rule.id}`} className="text-sm text-white">Include All Prompts</label>
                </div>

                {!includeAll && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Min</label>
                            <input name="minCount" type="number" min="1" max="10" defaultValue={rule.minCount} className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm text-white" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Max</label>
                            <input name="maxCount" type="number" min="1" max="10" defaultValue={rule.maxCount} className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-sm text-white" />
                        </div>
                    </div>
                )}
                <div className="flex justify-end gap-2 mt-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-xs text-gray-400 hover:text-white px-2 py-1"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="text-xs bg-primary text-white px-3 py-1 rounded hover:bg-primary/90"
                    >
                        Save
                    </button>
                </div>
            </div>
        </form>
    )
}
