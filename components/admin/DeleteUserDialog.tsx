'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { deleteUser } from '@/app/lib/admin-actions'

type Props = {
    userId: string
    userName: string
    trigger?: React.ReactNode
}

export function DeleteUserDialog({ userId, userName, trigger }: Props) {

    const [isOpen, setIsOpen] = useState(false)
    const [isConfirmed, setIsConfirmed] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()

    const handleDelete = async () => {
        setIsDeleting(true)
        const result = await deleteUser(userId)

        if (result?.error) {
            alert(result.error)
            setIsDeleting(false)
        } else {
            setIsOpen(false)
            router.push('/admin/users')
        }
    }

    return (
        <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
            <Dialog.Trigger asChild>
                {trigger || (
                    <button className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-medium transition-colors border border-red-500/20">
                        Delete User
                    </button>
                )}
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#09090b] border border-white/10 p-6 rounded-xl w-full max-w-md z-50 shadow-2xl">
                    <Dialog.Title className="text-xl font-bold text-white mb-2">Delete User: {userName}?</Dialog.Title>
                    <Dialog.Description className="text-gray-400 mb-6">
                        This action is irreversible. This will permanently delete the user account and all associated journal entries.
                    </Dialog.Description>

                    <div className="space-y-4 mb-8">
                        {/* Step 1: Download Data */}
                        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                            <h4 className="text-sm font-bold text-gray-200 mb-2">Step 1: Backup Data</h4>
                            <p className="text-xs text-gray-500 mb-3">Please download a copy of the user's data before deleting.</p>
                            <a
                                href={`/api/admin/export-user?userId=${userId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-500/10 text-blue-400 rounded-md text-xs font-bold hover:bg-blue-500/20 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                                Download JSON Backup
                            </a>
                        </div>

                        {/* Step 2: Confirm */}
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={isConfirmed}
                                onChange={(e) => setIsConfirmed(e.target.checked)}
                                className="mt-1 w-4 h-4 accent-red-500"
                            />
                            <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                                I understand that this action is permanent and cannot be undone.
                            </span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-3">
                        <Dialog.Close asChild>
                            <button className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                                Cancel
                            </button>
                        </Dialog.Close>
                        <button
                            onClick={handleDelete}
                            disabled={!isConfirmed || isDeleting}
                            className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
