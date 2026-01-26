
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PromptEditor } from "@/components/admin/PromptEditor"

type Props = {
    params: Promise<{ id: string }>
}

export default async function EditPromptPage({ params }: Props) {
    const session = await auth();
    const orgId = session?.user?.organizationId;
    const { id } = await params;

    const prompt = await prisma.prompt.findUnique({
        where: { id },
        include: { category: true }
    });

    if (!prompt || prompt.organizationId !== orgId) notFound();

    const categories = await prisma.promptCategory.findMany({
        where: { organizationId: orgId },
        orderBy: { name: 'asc' }
    });

    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-8">
                <Link href={`/admin/prompts?cat=${prompt.categoryId}`} className="text-sm text-gray-400 hover:text-white mb-2 inline-block">&larr; Back to Prompts</Link>
                <h1 className="text-3xl font-bold text-white">Edit Prompt</h1>
            </div>

            <PromptEditor
                prompt={prompt}
                categories={categories}
                categoryId={prompt.categoryId || undefined}
                mode="edit"
            />
        </div>
    )
}
