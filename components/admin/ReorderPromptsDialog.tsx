'use client'

import { useState } from 'react'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { reorderPrompts } from '@/app/lib/admin-actions'

type Prompt = {
    id: string
    content: string
    sortOrder: number
}

function SortableItem({ id, content }: { id: string, content: string }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="bg-white/5 border border-white/10 p-3 rounded-lg mb-2 flex items-center gap-3 cursor-grab active:cursor-grabbing hover:bg-white/10">
            <span className="text-gray-500">⋮⋮</span>
            <span className="text-white text-sm truncate">{content}</span>
        </div>
    )
}

export function ReorderPromptsDialog({ categoryId, categoryName, prompts, onOpenChange }: { categoryId: string, categoryName: string, prompts: any[], onOpenChange: (open: boolean) => void }) {
    // Sort prompts initially by sortOrder or index
    const [items, setItems] = useState(prompts)
    const [isSaving, setIsSaving] = useState(false)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event

        if (active.id !== over?.id) {
            setItems((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id)
                const newIndex = items.findIndex((i) => i.id === over?.id)
                return arrayMove(items, oldIndex, newIndex)
            })
        }
    }

    async function handleSave() {
        setIsSaving(true)
        // Map new order to items
        const updates = items.map((item, index) => ({
            id: item.id,
            sortOrder: index
        }))

        await reorderPrompts(updates)
        setIsSaving(false)
        onOpenChange(false)
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#121212] border border-white/10 rounded-xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h3 className="font-bold text-white">Reorder: {categoryName}</h3>
                    <button onClick={() => onOpenChange(false)} className="text-gray-400 hover:text-white">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={items.map(i => i.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {items.map(item => (
                                <SortableItem key={item.id} id={item.id} content={item.content} />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>

                <div className="p-4 border-t border-white/10 bg-white/5 flex gap-3">
                    <button
                        onClick={() => onOpenChange(false)}
                        className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm"
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium flex justify-center items-center gap-2"
                    >
                        {isSaving ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span> : 'Save Order'}
                    </button>
                </div>
            </div>
        </div>
    )
}
