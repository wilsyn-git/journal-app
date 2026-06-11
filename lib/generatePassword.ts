// Mixed charset for generated passwords, omitting visually ambiguous characters
// (0/O, 1/l/I) so an admin can reliably read/copy the password to share (#71).
export const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'

/**
 * Returns `count` non-negative 32-bit integers from the platform CSPRNG.
 * Separated out so generatePassword can be unit-tested with a deterministic
 * fake instead of real randomness.
 */
export function secureRandomInts(count: number): number[] {
    const arr = new Uint32Array(count)
    crypto.getRandomValues(arr)
    return Array.from(arr)
}

/**
 * Generates a strong password of `length` characters drawn from a mixed
 * charset (upper, lower, digits, symbols). #71: used by the admin create-user
 * form's Generate button. `randomInts` is injectable for testing.
 */
export function generatePassword(
    length = 16,
    randomInts: (count: number) => number[] = secureRandomInts,
): string {
    const ints = randomInts(length)
    let out = ''
    for (let i = 0; i < length; i++) {
        out += CHARSET[ints[i] % CHARSET.length]
    }
    return out
}
