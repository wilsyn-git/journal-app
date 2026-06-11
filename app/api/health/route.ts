import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkDatabaseHealth } from '@/lib/health'

// Force per-request execution so the probe is never statically cached.
export const dynamic = 'force-dynamic'

export async function GET() {
    const healthy = await checkDatabaseHealth(prisma)
    if (!healthy) {
        // Intentionally no error detail in the body (avoids info leak, cf. #65).
        return NextResponse.json(
            { status: 'error' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        )
    }
    return NextResponse.json(
        { status: 'ok' },
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
}
