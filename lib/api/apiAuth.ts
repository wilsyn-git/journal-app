import { NextRequest } from 'next/server'
import { verifyAccessToken, AccessTokenPayload } from './jwt'
import { prisma } from '@/lib/prisma'

export async function authenticateRequest(
  request: NextRequest
): Promise<{ payload: AccessTokenPayload } | { error: string; status: number }> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 }
  }

  const token = authHeader.slice(7)
  let payload: AccessTokenPayload
  try {
    payload = await verifyAccessToken(token)
  } catch {
    return { error: 'Invalid or expired token', status: 401 }
  }

  // Enforce device-session revocation: a valid-signature token is rejected the
  // moment its bound session is revoked or deleted, instead of staying live for
  // the full 1h TTL (#64). The lookup is an O(1) read on the indexed PK.
  if (payload.sessionId) {
    const session = await prisma.deviceSession.findUnique({
      where: { id: payload.sessionId },
      select: { revokedAt: true },
    })
    if (!session || session.revokedAt) {
      return { error: 'Session revoked', status: 401 }
    }
  }
  // Legacy tokens without sessionId are allowed; they expire within the 1h TTL
  // (one-time migration window).

  return { payload }
}
