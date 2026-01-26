
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"
import { PromptEditor } from "@/components/admin/PromptEditor"

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function NewPromptPage({ searchParams }: Props) {
    const session = await auth();
    const orgId = session?.user?.organizationId;
    const params = await searchParams;
    const categoryId = typeof params.cat === 'string' ? params.cat : undefined;

    const categories = await prisma.promptCategory.findMany({
        where: { organizationId: orgId },
        orderBy: { name: 'asc' }
    });

    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-8">
                <Link href={`/admin/prompts?cat=${categoryId}`} className="text-sm text-gray-400 hover:text-white mb-2 inline-block">&larr; Back to Prompts</Link>
                <h1 className="text-3xl font-bold text-white">Create New Prompt</h1>
            </div>

            <PromptEditor
                categories={categories}
                categoryId={categoryId}
                mode="create"
                prompt={{
                    content: '',
                    type: 'TEXT',
                    categoryId: categoryId
                }}
            />
        </div>
    )
}
