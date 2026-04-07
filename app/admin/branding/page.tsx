import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { BrandingForm } from "@/components/admin/BrandingForm"

export default async function AdminBrandingPage() {
    const session = await auth()
    const orgId = session?.user?.organizationId

    const org = orgId ? await prisma.organization.findUnique({
        where: { id: orgId }
    }) : null

    if (!org) return <div>Organization not found</div>

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Branding & Customization</h1>
                    <p className="text-gray-400 mt-1">Make myJournal your own.</p>
                </div>
            </div>

            <BrandingForm
                currentName={org.siteName || "myJournal"}
                currentLogo={org.logoUrl}
            />
        </div>
    )
}
