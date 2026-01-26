
'use client'

import { useRouter, useSearchParams } from 'next/navigation'

type UserOption = {
    id: string;
    email: string;
    name: string | null;
}

export function AdminUserSelector({ users }: { users: UserOption[] }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentViewIds = searchParams.get('viewUserId') || '';

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const userId = e.target.value;
        const params = new URLSearchParams(searchParams);
        if (userId) {
            params.set('viewUserId', userId);
        } else {
            params.delete('viewUserId');
        }
        router.push(`?${params.toString()}`);
    }

    return (
        <div className="mb-4 px-4">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                Inspect User
            </label>
            <select
                value={currentViewIds}
                onChange={handleChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 p-2 focus:ring-2 focus:ring-primary/50 outline-none [&>option]:bg-gray-900"
            >
                <option value="">(Myself)</option>
                {users.map(u => (
                    <option key={u.id} value={u.id}>
                        {u.name ? `${u.name} (${u.email})` : u.email}
                    </option>
                ))}
            </select>
        </div>
    )
}
