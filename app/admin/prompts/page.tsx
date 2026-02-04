
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { togglePrompt, deletePrompt, deletePromptCategory } from "@/app/lib/admin-actions"
import { auth } from "@/auth"
import { NewCategoryForm } from "@/components/admin/NewCategoryForm"
import { PromptImporter } from "@/components/admin/PromptImporter"
import { DeleteCategoryButton } from "@/components/admin/DeleteCategoryButton"
import { ReorderPromptsButton } from "@/components/admin/ReorderPromptsButton"

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function AdminPromptsPage({ searchParams }: Props) {
    const session = await auth();
    const orgId = session?.user?.organizationId;
    const params = await searchParams;
    const selectedCategoryId = typeof params.cat === 'string' ? params.cat : null;

    // Fetch Categories
    const categories = await prisma.promptCategory.findMany({
        where: { organizationId: orgId },
        include: { _count: { select: { prompts: true } } },
        orderBy: { name: 'asc' }
    });

    // Fetch Prompts for selected category
    let prompts: any[] = [];
    if (selectedCategoryId) {
        prompts = await prisma.prompt.findMany({
            where: {
                organizationId: orgId,
                categoryId: selectedCategoryId
            },
            orderBy: [
                { sortOrder: 'asc' },
                { createdAt: 'desc' }
            ]
        });
    }

    return (
        <div className="flex flex-col md:flex-row h-auto md:h-[calc(100vh-100px)] gap-6">
            {/* Left Pane: Categories */}
            <div className="w-full md:w-1/3 flex flex-col glass-card border border-white/10 rounded-xl overflow-hidden relative min-h-[300px] md:min-h-0">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h2 className="text-lg font-bold text-white">Categories</h2>
                    <div className="flex items-center gap-2">
                        <PromptImporter />
                        <NewCategoryForm />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {categories.map(cat => (
                        <Link
                            key={cat.id}
                            href={`/admin/prompts?cat=${cat.id}`}
                            className={`
                                block p-3 rounded-lg transition-colors flex justify-between items-center group
                                ${selectedCategoryId === cat.id ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/5 border border-transparent'}
                            `}
                        >
                            <span className="text-sm font-medium text-white group-hover:text-blue-200 transition-colors">{cat.name}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 bg-black/20 px-2 py-0.5 rounded-full">{cat._count.prompts}</span>
                                <DeleteCategoryButton categoryId={cat.id} categoryName={cat.name} />
                            </div>
                        </Link>
                    ))}
                    {categories.length === 0 && (
                        <p className="text-gray-500 text-sm p-4 text-center">No categories.</p>
                    )}
                </div>
            </div>

            {/* Right Pane: Prompts */}
            <div className="w-full md:flex-1 flex flex-col glass-card border border-white/10 rounded-xl overflow-hidden min-h-[500px] md:min-h-0">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h2 className="text-lg font-bold text-white">
                        {selectedCategoryId
                            ? categories.find(c => c.id === selectedCategoryId)?.name
                            : 'Select a Category'}
                    </h2>
                    {selectedCategoryId && (
                        <div className="flex items-center gap-2">
                            <ReorderPromptsButton
                                categoryId={selectedCategoryId}
                                categoryName={categories.find(c => c.id === selectedCategoryId)?.name || 'Category'}
                                prompts={prompts}
                            />
                            <Link
                                href={`/admin/prompts/new?cat=${selectedCategoryId}`}
                                className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                + Add Prompt
                            </Link>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                    {!selectedCategoryId ? (
                        <div className="h-full flex items-center justify-center text-gray-500">
                            Select a category to view prompts.
                        </div>
                    ) : (
                        <>
                            {prompts.map(prompt => (
                                <div key={prompt.id} className="p-4 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors group">
                                    <div className="flex justify-between items-start gap-4">
                                        <div>
                                            <p className="text-white font-medium">{prompt.content}</p>
                                            <div className="flex gap-2 mt-2">
                                                <span className="text-[10px] bg-white/10 text-gray-400 px-1.5 py-0.5 rounded uppercase">
                                                    {prompt.type}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity self-center">
                                            <Link
                                                href={`/admin/prompts/${prompt.id}`}
                                                className="text-xs bg-white/5 hover:bg-white/10 text-blue-300 hover:text-blue-200 px-3 py-1.5 rounded transition-colors"
                                            >
                                                Edit
                                            </Link>
                                            <form action={async () => {
                                                "use server"
                                                await deletePrompt(prompt.id)
                                            }}>
                                                <button className="cursor-pointer text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 px-3 py-1.5 rounded transition-colors">
                                                    Delete
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {prompts.length === 0 && (
                                <p className="text-gray-500 text-center py-8">No prompts in this category.</p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
