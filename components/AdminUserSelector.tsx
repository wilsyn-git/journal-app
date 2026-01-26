
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

type UserOption = {
    id: string;
    email: string;
    name: string | null;
}

export function AdminUserSelector({ users }: { users: UserOption[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        const newParams = new URLSearchParams(searchParams.toString());
        if (val) {
            newParams.set('viewUserId', val);
        } else {
            newParams.delete('viewUserId');
        }
        router.push(`${pathname}?${newParams.toString()}`);
    }

    // Identify current user (Myself) if viewUserId is missing
    const currentSelection = searchParams.get('viewUserId') || '';

    return (
        <div className="px-2">
            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2 block px-1">
                Inspect User
            </label>
            <select
                value={currentSelection}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg text-xs text-white p-2 focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
            >
                <option value="">Myself (Admin)</option>
                {users
                    .filter(u => u.email !== 'admin@example.com') // Hide the explicit Admin user entry to avoid redundancy
                    // Filter out the admin user themselves if they appear in the list to avoid duplication
                    // assuming we can indentify them? Actually, cleaner to just let them appear or 
                    // rename the default option.
                    // Let's just list everyone.
                    .map(u => (
                        <option key={u.id} value={u.id}>
                            {u.name ? `${u.name} (${u.email})` : u.email}
                        </option>
                    ))}
            </select>
        </div>
    )
}
