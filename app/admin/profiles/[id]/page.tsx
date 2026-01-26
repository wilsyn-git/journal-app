
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ProfileRulesManager } from "@/components/admin/ProfileRulesManager"
import { ProfileEditor } from "@/components/admin/ProfileEditor"

type Props = {
    params: Promise<{ id: string }>
}

export default async function ProfileDetailPage({ params }: Props) {
    const session = await auth();
    const { id } = await params;

    const profile = await prisma.profile.findUnique({
        where: { id },
        include: {
            rules: {
                include: { categoryPrompt: true },
                orderBy: { sortOrder: 'asc' }
            }
        }
    });

    if (!profile) notFound();

    const allCategories = await prisma.promptCategory.findMany({
        where: { organizationId: session?.user?.organizationId },
        orderBy: { name: 'asc' }
    });

    // Transform for Client Components
    const safeCategories = allCategories.map(c => ({ id: c.id, name: c.name }));
    const safeRules = profile.rules.map(r => ({
        id: r.id,
        categoryString: r.categoryString,
        categoryId: r.categoryId,
        minCount: r.minCount,
        maxCount: r.maxCount,
        includeAll: r.includeAll,
        categoryPrompt: r.categoryPrompt ? { name: r.categoryPrompt.name } : null
    }));

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <Link href="/admin/profiles" className="text-sm text-gray-400 hover:text-white mb-2 inline-block">&larr; Back to Profiles</Link>
                <ProfileEditor profile={{ id: profile.id, name: profile.name, description: profile.description }} />
            </div>

            <div className="grid gap-8">
                <ProfileRulesManager
                    profileId={profile.id}
                    initialRules={safeRules}
                    categories={safeCategories}
                />
            </div>
        </div>
    )
}
