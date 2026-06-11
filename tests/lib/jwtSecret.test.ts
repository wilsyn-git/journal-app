import { describe, it, expect } from 'vitest'
import { resolveJwtSecret } from '@/lib/api/jwt'

describe('resolveJwtSecret', () => {
  it('returns API_JWT_SECRET in production, ignoring AUTH_SECRET', () => {
    expect(
      resolveJwtSecret({ API_JWT_SECRET: 'api-key', AUTH_SECRET: 'auth-key', NODE_ENV: 'production' }),
    ).toBe('api-key')
  })

  it('throws in production when API_JWT_SECRET is unset', () => {
    expect(() =>
      resolveJwtSecret({ AUTH_SECRET: 'auth-key', NODE_ENV: 'production' }),
    ).toThrow('API_JWT_SECRET must be set in production')
  })

  it('falls back to AUTH_SECRET in development', () => {
    expect(resolveJwtSecret({ AUTH_SECRET: 'auth-key', NODE_ENV: 'development' })).toBe('auth-key')
  })

  it('falls back to dev-only-secret when nothing is set in development', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development' })).toBe('dev-only-secret')
  })

  it('throws in production when API_JWT_SECRET is an empty string', () => {
    expect(() =>
      resolveJwtSecret({ API_JWT_SECRET: '', NODE_ENV: 'production' }),
    ).toThrow('API_JWT_SECRET must be set in production')
  })

  it('falls back to dev-only-secret when NODE_ENV is test', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'test' })).toBe('dev-only-secret')
  })
})
