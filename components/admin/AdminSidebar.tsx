
'use client';

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useBranding } from "@/components/BrandingProvider"

function Breadcrumbs() {
    const pathname = usePathname()

    // Build breadcrumb segments from pathname
    // /admin -> ["Admin"]
    // /admin/tasks -> ["Admin", "Tasks"]
    // /admin/tasks/[id] -> ["Admin", "Tasks", "Detail"]
    // /admin/tasks/[id]/edit -> ["Admin", "Tasks", "Edit"]
    const segments = pathname.split('/').filter(Boolean) // ["admin", "tasks", "abc123", "edit"]

    const crumbs: { label: string; href: string }[] = []

    if (segments.length >= 1) {
        crumbs.push({ label: 'Admin', href: '/admin' })
    }

    if (segments.length >= 2) {
        const section = segments[1]
        const label = section.charAt(0).toUpperCase() + section.slice(1)
        crumbs.push({ label, href: `/admin/${section}` })
    }

    if (segments.length >= 3) {
        const sub = segments[2]
        if (sub === 'new') {
            crumbs.push({ label: 'New', href: pathname })
        } else if (segments.length >= 4 && segments[3] === 'edit') {
            crumbs.push({ label: 'Edit', href: pathname })
        }
    }

    // Don't show breadcrumb if we're just on /admin
    if (crumbs.length <= 1) return null

    return (
        <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="flex items-center gap-1 text-xs text-gray-400">
                {crumbs.map((crumb, i) => (
                    <li key={crumb.href} className="flex items-center gap-1">
                        {i > 0 && <span aria-hidden="true" className="text-gray-500">/</span>}
                        {i === crumbs.length - 1 ? (
                            <span className="text-gray-300">{crumb.label}</span>
                        ) : (
                            <Link href={crumb.href} className="hover:text-white transition-colors">
                                {crumb.label}
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    )
}

export function AdminSidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const { siteName, logoUrl } = useBranding();

    const isActive = (path: string) => {
        if (path === '/admin' && pathname === '/admin') return true;
        if (path !== '/admin' && pathname.startsWith(path)) return true;
        return false;
    };

    const linkClass = (path: string) => `
        block px-4 py-2 rounded-lg transition-colors
        ${isActive(path)
            ? 'bg-white/10 text-white font-medium'
            : 'text-gray-300 hover:bg-white/5 hover:text-white'}
    `;

    const SidebarContent = () => (
        <>
            {/* Brand header — clickable, links to dashboard */}
            <div className="flex items-center justify-between mb-4">
                <Link href="/dashboard" className="text-xl font-bold tracking-tighter text-white flex items-center gap-2">
                    {logoUrl && <Image src={logoUrl} alt="Logo" width={24} height={24} className="object-contain" />}
                    <span>{siteName || "myJournal"}</span>
                </Link>
                <button
                    onClick={() => setIsOpen(false)}
                    className="md:hidden text-gray-400 hover:text-white"
                    aria-label="Close menu"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Breadcrumbs */}
            <Breadcrumbs />

            <nav aria-label="Admin navigation" className="flex-1 space-y-2 overflow-y-auto">
                <Link href="/admin" className={linkClass('/admin')} onClick={() => setIsOpen(false)}>
                    Overview
                </Link>

                <div className="h-px bg-white/10 my-2" />

                <Link href="/admin/groups" className={linkClass('/admin/groups')} onClick={() => setIsOpen(false)}>
                    Groups
                </Link>
                <Link href="/admin/users" className={linkClass('/admin/users')} onClick={() => setIsOpen(false)}>
                    Users
                </Link>
                <Link href="/admin/tasks" className={linkClass('/admin/tasks')} onClick={() => setIsOpen(false)}>
                    Tasks
                </Link>
                <Link href="/admin/rules/types" className={linkClass('/admin/rules')} onClick={() => setIsOpen(false)}>
                    Rules
                </Link>

                <div className="h-px bg-white/10 my-2" />

                <Link href="/admin/profiles" className={linkClass('/admin/profiles')} onClick={() => setIsOpen(false)}>
                    Profiles
                </Link>
                <Link href="/admin/prompts" className={linkClass('/admin/prompts')} onClick={() => setIsOpen(false)}>
                    Prompts
                </Link>

                <div className="h-px bg-white/10 my-2" />

                <Link href="/admin/branding" className={linkClass('/admin/branding')} onClick={() => setIsOpen(false)}>
                    Branding
                </Link>
                <Link href="/admin/tools" className={linkClass('/admin/tools')} onClick={() => setIsOpen(false)}>
                    Tools (Data)
                </Link>

                <div className="h-px bg-white/10 my-2" />

                <Link
                    href="/dashboard"
                    className="block px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    onClick={() => setIsOpen(false)}
                >
                    &larr; Back to Journal
                </Link>
            </nav>
            <div className="pt-4 border-t border-white/10 text-xs text-gray-400">
                v0.1.0
            </div>
        </>
    );

    return (
        <>
            {/* Mobile Header */}
            <div className="md:hidden bg-black/40 backdrop-blur-md border-b border-white/10 p-4 sticky top-0 z-30 flex items-center justify-between">
                <Link href="/dashboard" className="text-lg font-bold text-white flex items-center gap-2">
                    {logoUrl && <Image src={logoUrl} alt="Logo" width={20} height={20} className="object-contain" />}
                    <span>{siteName || "myJournal"}</span>
                </Link>
                <button
                    onClick={() => setIsOpen(true)}
                    className="text-white p-1 hover:bg-white/10 rounded"
                    aria-label="Open menu"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </div>

            {/* Mobile Overlay Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar (Desktop Fixed / Mobile Drawer) */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-[#111] border-r border-white/10 p-6 flex flex-col transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                md:relative md:translate-x-0 md:flex md:bg-black/20
            `}>
                <SidebarContent />
            </aside>
        </>
    )
}
