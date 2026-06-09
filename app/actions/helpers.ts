'use server'

import { auth } from '@/auth'

export async function ensureAdmin() {
    const session = await auth()
    if (session?.user?.role !== 'ADMIN') {
        throw new Error("Unauthorized: Admin access required")
    }
    return session!
}
