import { NextRequest } from 'next/server'
import { verifyAccessToken, AccessTokenPayload } from './jwt'

export async function authenticateRequest(
  request: NextRequest
): Promise<{ payload: AccessTokenPayload } | { error: string; status: number }> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 }
  }

  const token = authHeader.slice(7)
  try {
    const payload = await verifyAccessToken(token)
    return { payload }
  } catch {
    return { error: 'Invalid or expired token', status: 401 }
  }
}
