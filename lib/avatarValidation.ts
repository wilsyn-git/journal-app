export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/** Returns an error message if the avatar file is invalid, else null. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
    if (!file.type.startsWith('image/jpeg')) return 'Only JPG images are allowed'
    if (file.size > AVATAR_MAX_BYTES) return 'Image must be smaller than 2MB'
    return null
}
