import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { BrandingForm } from "@/components/admin/BrandingForm"

export default async function AdminBrandingPage() {
    const session = await auth()
    if (!session?.user?.email) redirect('/')

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { role: true, organizationId: true }
    })

    if (user?.role !== 'ADMIN') redirect('/dashboard')

    const org = await prisma.organization.findUnique({
        where: { id: user.organizationId }
    })

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
