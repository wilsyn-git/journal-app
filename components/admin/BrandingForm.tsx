'use client'

import { useState } from "react"
import { updateBranding } from "@/app/actions/admin"
import Image from "next/image"

type Props = {
    currentName: string
    currentLogo: string | null
}

export function BrandingForm({ currentName, currentLogo }: Props) {
    const [isSaving, setIsSaving] = useState(false)
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogo)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            setPreviewUrl(URL.createObjectURL(file))
        }
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSaving(true)

        const formData = new FormData(e.currentTarget)
        const res = await updateBranding(formData)

        if (res?.error) {
            alert(res.error)
        } else {
            // Ideally use a toast here
            window.location.reload() // Reload to see changes? Or just revalidate.
        }
        setIsSaving(false)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            {/* Site Name Section */}
            <div className="glass-card p-6 rounded-xl border border-white/10">
                <h2 className="text-xl font-semibold text-white mb-4">Site Identity</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Application Name</label>
                        <input
                            type="text"
                            name="siteName"
                            defaultValue={currentName}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="e.g. Acme Journal"
                        />
                        <p className="text-xs text-gray-500 mt-1">This will replace &quot;myJournal&quot; anywhere it appears as text.</p>
                    </div>
                </div>
            </div>

            {/* Logo Section */}
            <div className="glass-card p-6 rounded-xl border border-white/10">
                <h2 className="text-xl font-semibold text-white mb-4">Logo</h2>
                <div className="flex flex-col sm:flex-row gap-8 items-start">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Upload Logo</label>
                        <div className="flex items-center gap-4">
                            <label className="cursor-pointer px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm text-white">
                                <span>Choose File</span>
                                <input
                                    type="file"
                                    name="logo"
                                    accept="image/png, image/jpeg"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </label>
                            <span className="text-xs text-gray-500">PNG or JPG, max 2MB</span>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="shrink-0 p-4 bg-black/40 rounded-lg border border-white/10 border-dashed min-w-[120px] min-h-[120px] flex items-center justify-center">
                        {previewUrl ? (
                            <Image
                                src={previewUrl}
                                alt="Logo Preview"
                                width={80}
                                height={80}
                                className="object-contain max-w-[100px] max-h-[100px]"
                            />
                        ) : (
                            <div className="text-4xl">💎</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </form>
    )
}
