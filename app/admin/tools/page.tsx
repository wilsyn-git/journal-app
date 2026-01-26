'use client'

import React, { useState } from 'react'
import { useToast } from "@/components/providers/ToastProvider"

export default function AdminToolsPage() {
    const { addToast } = useToast()
    const [isRestoring, setIsRestoring] = useState(false)
    const [hasFile, setHasFile] = useState(false)

    return (
        <div className="space-y-8 animate-[fade-in_0.5s_ease-out]">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">System Tools</h1>
                <p className="text-gray-400">Manage data, backups, and system integrity.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Export Card */}
                <div className="glass-card p-6 rounded-xl border border-white/10 flex flex-col justify-between hover:border-white/20 transition-all">
                    <div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">Export Data</h3>
                        <p className="text-sm text-gray-400 mb-6">
                            Download a compressed JSON backup (.json.gz) of the system database (Users, Entries, Binary Assets).
                        </p>
                    </div>

                    <a
                        href="/api/admin/export"
                        className="block w-full text-center py-2 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
                    >
                        Download Archive
                    </a>
                </div>

                {/* Restore Card */}
                <div className="glass-card p-6 rounded-xl border border-white/10 flex flex-col justify-between hover:border-white/20 transition-all">
                    <div>
                        <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center mb-4 text-red-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">Restore Data</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            Upload a backup file (.json.gz) to restore the system state.
                        </p>
                    </div>

                    <form action={async (formData) => {
                        setIsRestoring(true)
                        try {
                            const { restoreSystemData } = await import('@/app/actions/restore')
                            const result = await restoreSystemData(formData)
                            if (result.error) {
                                addToast('error', result.error)
                            } else if (result.success && result.report) {
                                const r = result.report
                                const totalCreated = Object.values(r).reduce((acc: any, v: any) => acc + v.created, 0)
                                const totalUpdated = Object.values(r).reduce((acc: any, v: any) => acc + v.updated, 0)
                                const totalSkipped = Object.values(r).reduce((acc: any, v: any) => acc + v.skipped, 0)
                                addToast('success', `Restore Complete: Created ${totalCreated}, Updated ${totalUpdated}, Skipped ${totalSkipped}.`, 10000)
                            }
                        } catch (e) {
                            addToast('error', 'Restore failed unexpectedly')
                        } finally {
                            setIsRestoring(false)
                        }
                    }} className="space-y-4">
                        <input
                            type="file"
                            name="file"
                            accept=".json,.gz"
                            required
                            onChange={(e) => setHasFile(!!e.target.files?.length)}
                            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 cursor-pointer"
                        />

                        <label className="flex items-center space-x-2 text-sm text-gray-300">
                            <input type="checkbox" name="overwrite" value="true" className="rounded border-gray-600 bg-black/40" />
                            <span>Overwrite existing records?</span>
                        </label>

                        <button
                            type="submit"
                            disabled={!hasFile || isRestoring}
                            className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 
                                ${hasFile && !isRestoring
                                    ? 'bg-white/10 hover:bg-white/20 text-white cursor-pointer shadow-lg shadow-white/5'
                                    : 'bg-red-500/10 text-red-100/30 cursor-not-allowed border border-white/5'
                                }
                            `}
                        >
                            {isRestoring ? 'Restoring...' : 'Upload & Restore'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}
