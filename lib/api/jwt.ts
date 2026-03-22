import { SignJWT, jwtVerify } from 'jose'

const secret = process.env.API_JWT_SECRET || process.env.AUTH_SECRET
if (!secret && process.env.NODE_ENV === 'production') {
  throw new Error('API_JWT_SECRET or AUTH_SECRET must be set in production')
}
const JWT_SECRET = new TextEncoder().encode(secret || 'dev-only-secret')

const ACCESS_TOKEN_EXPIRY = '1h'

export interface AccessTokenPayload {
  userId: string
  orgId: string
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
  }
}
