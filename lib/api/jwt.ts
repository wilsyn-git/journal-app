import { SignJWT, jwtVerify } from 'jose'

/**
 * Resolve the API JWT signing secret (#60). Production REQUIRES a dedicated
 * API_JWT_SECRET so the mobile-API signing key is separated from the NextAuth
 * session secret (AUTH_SECRET) — no silent fallback in prod. Non-production
 * keeps a convenient fallback chain so local dev needs no extra config.
 */
export function resolveJwtSecret(env: {
  API_JWT_SECRET?: string
  AUTH_SECRET?: string
  NODE_ENV?: string
}): string {
  if (env.NODE_ENV === 'production') {
    if (!env.API_JWT_SECRET) {
      throw new Error('API_JWT_SECRET must be set in production')
    }
    return env.API_JWT_SECRET
  }
  return env.API_JWT_SECRET || env.AUTH_SECRET || 'dev-only-secret'
}

const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret(process.env))

const ACCESS_TOKEN_EXPIRY = '1h'

export interface AccessTokenPayload {
  userId: string
  orgId: string
  // Binds the token to a specific DeviceSession so it can be revoked before
  // its natural expiry. Optional on the returned payload for backward
  // compatibility with tokens issued before this claim existed (#64).
  sessionId?: string
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET)
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET)
  return {
    userId: payload.userId as string,
    orgId: payload.orgId as string,
    // Read defensively: legacy tokens lack this claim, which yields undefined.
    sessionId: payload.sessionId as string | undefined,
  }
}
