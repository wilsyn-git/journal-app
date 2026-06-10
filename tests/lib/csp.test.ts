import { describe, it, expect } from 'vitest'
import { buildCsp } from '@/lib/csp'

const NONCE = 'dGVzdC1ub25jZQ=='

describe('buildCsp', () => {
  describe('production', () => {
    const csp = buildCsp(NONCE, false)

    it('includes the nonce in script-src', () => {
      expect(csp).toContain(`'nonce-${NONCE}'`)
    })

    it('uses strict-dynamic in script-src', () => {
      expect(csp).toContain("script-src 'self' 'nonce-")
      expect(csp).toContain("'strict-dynamic'")
    })

    it("does NOT allow 'unsafe-inline' or 'unsafe-eval' in script-src", () => {
      const scriptSrc = csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('script-src'))!
      expect(scriptSrc).not.toContain("'unsafe-inline'")
      expect(scriptSrc).not.toContain("'unsafe-eval'")
    })

    it("keeps 'unsafe-inline' in style-src for Tailwind's runtime style", () => {
      const styleSrc = csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('style-src'))!
      expect(styleSrc).toContain("'unsafe-inline'")
    })

    it('preserves the other locked-down directives', () => {
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("img-src 'self' data: blob:")
      expect(csp).toContain("font-src 'self'")
      expect(csp).toContain("connect-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("object-src 'none'")
    })
  })

  describe('development', () => {
    const csp = buildCsp(NONCE, true)

    it('still includes the nonce', () => {
      expect(csp).toContain(`'nonce-${NONCE}'`)
    })

    it("relaxes script-src with 'unsafe-eval' and 'unsafe-inline' for HMR", () => {
      const scriptSrc = csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('script-src'))!
      expect(scriptSrc).toContain("'unsafe-eval'")
      expect(scriptSrc).toContain("'unsafe-inline'")
    })
  })
})
