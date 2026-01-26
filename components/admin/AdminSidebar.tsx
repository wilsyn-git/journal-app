
'use client';

import Link from "next/link"
import { usePathname } from "next/navigation"

export function AdminSidebar() {
    const pathname = usePathname();

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

    return (
        <aside className="w-64 border-r border-white/10 bg-black/20 p-6 flex flex-col">
            <h2 className="text-xl font-bold text-white mb-8">Journal Admin</h2>
            <nav className="flex-1 space-y-2">
                <Link href="/admin" className={linkClass('/admin')}>
                    Overview
                </Link>

                <div className="h-px bg-white/10 my-2" />

                <Link href="/admin/groups" className={linkClass('/admin/groups')}>
                    Groups
                </Link>
                <Link href="/admin/users" className={linkClass('/admin/users')}>
                    Users
                </Link>

                <div className="h-px bg-white/10 my-2" />

                <Link href="/admin/profiles" className={linkClass('/admin/profiles')}>
                    Profiles
                </Link>
                <Link href="/admin/prompts" className={linkClass('/admin/prompts')}>
                    Prompts
                </Link>
            </nav>
            <div className="pt-4 border-t border-white/10">
                <Link href="/dashboard" className="block px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                    &larr; User Dashboard
                </Link>
                <Link href="/dashboard" className="block px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                    📊 My Stats
                </Link>
            </div>
        </aside>
    )
}
