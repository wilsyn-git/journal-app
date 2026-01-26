'use client'

import { useState, useRef } from 'react'
import { updateProfile } from "../actions/settings"

type Props = {
    userId: string
    activeAvatar: string | undefined | null
    initialName: string | null
    initialEmail: string
    initialBio: string | null
}

export function ProfileForm({ userId, activeAvatar, initialName, initialEmail, initialBio }: Props) {
    const [preview, setPreview] = useState<string | null>(activeAvatar || null)
    const [isPending, setIsPending] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const formRef = useRef<HTMLFormElement>(null)

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            alert('Please select an image file')
            return
        }

        // Resize Image
        try {
            const resizedBlob = await resizeImage(file, 500) // Max 500px
            const resizedFile = new File([resizedBlob], "avatar.jpg", { type: "image/jpeg" })

            // Create preview
            const reader = new FileReader()
            reader.onloadend = () => {
                setPreview(reader.result as string)
            }
            reader.readAsDataURL(resizedFile)

            // We can't easily set the file input value to this new Blob. 
            // So we'll need to append it manually or intercept the submit.
            // A pattern: Store the blob in state, and when form submits, use a Client Action wrapper?

            // Actually, we can just use the hidden input trick or DataTransfer if we really want to keep the form simple.
            // But let's just hold it in a ref/state and handle submission via JS.
            // Or simpler: We can put the blob into a HIDDEN file input? No, security.

            // Best approach for Server Actions with custom Blobs:
            // Use `formData.append` in the submit handler.
        } catch (err) {
            console.error(err)
            alert('Failed to process image')
        }
    }

    const resizeImage = (file: File, maxDim: number): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (readerEvent) => {
                const image = new Image()
                image.onload = () => {
                    // Canvas logic
                    let width = image.width
                    let height = image.height

                    if (width > height) {
                        if (width > maxDim) {
                            height *= maxDim / width
                            width = maxDim
                        }
                    } else {
                        if (height > maxDim) {
                            width *= maxDim / height
                            height = maxDim
                        }
                    }

                    const canvas = document.createElement('canvas')
                    canvas.width = width
                    canvas.height = height
                    const ctx = canvas.getContext('2d')
                    if (!ctx) {
                        reject(new Error('Canvas context missing'))
                        return
                    }
                    ctx.drawImage(image, 0, 0, width, height)

                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob)
                        else reject(new Error('Canvas to Blob failed'))
                    }, 'image/jpeg', 0.85) // 85% quality JPG
                }
                image.src = readerEvent.target?.result as string
            }
            reader.readAsDataURL(file)
        })
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsPending(true)

        const formData = new FormData(e.currentTarget)

        // If we have a resized file in our system? 
        // Let's actually do the resize ON submit if needed, or stick to the "stored blob" plan.

        // Re-implementing the resize flow cleanly:
        // 1. User picks file.
        // 2. We resize immediately and store the BLOB in a ref `resizedImageBlob`.
        // 3. On Submit, we delete the entry for 'avatar' (the original huge file) and append the blob.

        if (fileInputRef.current?.files?.[0]) {
            // We have a file selected... let's ensure we use the resized one.
            // Wait, handleFileChange already acts. Let's make sure we save that blob.
            // But wait, the standard form action will just grab the hidden input.

            // Let's just do manual FormData construction.
            if (currentResizedBlob.current) {
                formData.set('avatar', currentResizedBlob.current, 'avatar.jpg')
            }
        }

        try {
            await updateProfile(userId, formData)
            // Success feedback?
        } catch (err) {
            console.error(err)
            alert('Update failed')
        } finally {
            setIsPending(false)
        }
    }

    // Determine the current blob to send
    const currentResizedBlob = useRef<Blob | null>(null)

    // Update handleFileChange to store the blob
    const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Preview immediately (even if big) or wait? 
        // Resize first.
        const blob = await resizeImage(file, 500)
        currentResizedBlob.current = blob

        const reader = new FileReader()
        reader.onloadend = () => {
            setPreview(reader.result as string)
        }
        reader.readAsDataURL(blob)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-6">
                <div className="relative group">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center overflow-hidden border-2 border-white/20">
                        {preview ? (
                            <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-3xl font-bold text-white/50">
                                {initialName?.[0] || initialEmail[0].toUpperCase()}
                            </span>
                        )}
                    </div>
                    <label className="absolute bottom-0 right-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-400 transition-colors shadow-lg">
                        <input
                            ref={fileInputRef}
                            type="file"
                            name="avatar_upload" // changed name so it doesn't auto-bind to the huge file
                            className="hidden"
                            accept="image/*"
                            onChange={onFileSelect}
                        />
                        <span className="text-xs">📷</span>
                    </label>
                </div>
                <div className="flex-1">
                    <h3 className="tex-lg font-medium">Profile Picture</h3>
                    <p className="text-sm text-gray-400">Auto-resized to 500px. JPG/PNG.</p>
                </div>
            </div>

            {/* Info Section */}
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Display Name</label>
                    <input
                        type="text"
                        name="name"
                        defaultValue={initialName || ''}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                    <input
                        type="text"
                        value={initialEmail}
                        disabled
                        className="w-full bg-white/5 border border-transparent rounded-lg px-4 py-2 text-gray-500 cursor-not-allowed"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Bio / About Me</label>
                    <textarea
                        name="bio"
                        defaultValue={initialBio || ''}
                        rows={4}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        placeholder="Tell us a little about yourself..."
                    />
                </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-end">
                <button
                    type="submit"
                    disabled={isPending}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {isPending ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </form>
    )
}
