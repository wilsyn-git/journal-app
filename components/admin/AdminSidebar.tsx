
'use client';

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

export function AdminSidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

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
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-white">Journal Admin</h2>
                <button
                    onClick={() => setIsOpen(false)}
                    className="md:hidden text-gray-400 hover:text-white"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <nav className="flex-1 space-y-2 overflow-y-auto">
                <Link
                    href="/dashboard"
                    className="block px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
                    onClick={() => setIsOpen(false)}
                >
                    &larr; User Dashboard
                </Link>

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
            </nav>
            <div className="pt-4 border-t border-white/10 text-xs text-gray-500">
                v0.1.0 (Mobile Ready)
            </div>
        </>
    );

    return (
        <>
            {/* Mobile Header */}
            <div className="md:hidden bg-black/40 backdrop-blur-md border-b border-white/10 p-4 sticky top-0 z-30 flex items-center justify-between">
                <h1 className="text-lg font-bold text-white">Journal Admin</h1>
                <button
                    onClick={() => setIsOpen(true)}
                    className="text-white p-1 hover:bg-white/10 rounded"
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
