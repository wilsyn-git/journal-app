import { timingSafeEqual } from 'crypto'

/**
 * Constant-time secret comparison for #63. crypto.timingSafeEqual throws if the
 * two buffers differ in length, so we length-guard first (returning false). A
 * missing/empty value on either side is never a valid match. Compares over
 * UTF-8 bytes.
 */
export function safeSecretCompare(
    a: string | null | undefined,
    b: string | null | undefined,
): boolean {
    if (!a || !b) return false
    const bufA = Buffer.from(a, 'utf-8')
    const bufB = Buffer.from(b, 'utf-8')
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}
