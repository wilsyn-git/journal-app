export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/** Returns an error message if the avatar file is invalid, else null. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
    if (!file.type.startsWith('image/jpeg')) return 'Only JPG images are allowed'
    if (file.size > AVATAR_MAX_BYTES) return 'Image must be smaller than 2MB'
    return null
}

/**
 * Server-side defense for #62: the client-supplied MIME type (checked by
 * validateAvatarFile) is forgeable, so confirm the raw bytes are actually a
 * JPEG before writing to a public path. JPEG files begin with the SOI marker
 * 0xFF 0xD8 followed by 0xFF. Returns an error message if invalid, else null.
 */
export function validateAvatarBytes(buffer: Buffer): string | null {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        return 'File is not a valid JPEG image'
    }
    return null
}
