import Link from "next/link"
import Image from "next/image"

interface SidebarHeaderProps {
    logoUrl?: string | null
    siteName?: string | null
}

export function SidebarHeader({ logoUrl, siteName }: SidebarHeaderProps) {
    return (
        <Link href="/dashboard" className="text-xl font-bold tracking-tighter text-white flex items-center gap-2">
            {logoUrl && <Image src={logoUrl} alt="Logo" width={24} height={24} className="object-contain" />}
            <span>{siteName || "myJournal"}</span>
        </Link>
    )
}
