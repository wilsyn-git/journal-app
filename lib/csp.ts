/**
 * Content-Security-Policy builder for the nonce-based CSP applied in proxy.ts.
 *
 * Kept as a pure function so it can be unit-tested without spinning up the
 * Next.js runtime. The proxy generates a fresh nonce per request and passes it
 * (plus the environment) here.
 *
 * Notes:
 * - script-src uses a per-request nonce + 'strict-dynamic' in production, with
 *   NO 'unsafe-inline' / 'unsafe-eval'. Next.js streams its own inline
 *   hydration scripts and stamps them with this nonce, so hydration is allowed.
 * - In development we additionally allow 'unsafe-eval' (for React Refresh / HMR,
 *   which evaluates code at runtime). We deliberately do NOT add 'unsafe-inline'
 *   to script-src: per CSP3, 'strict-dynamic' makes browsers ignore both
 *   'unsafe-inline' and host/source allowlists, so it would be a dead token.
 *   Dev inline scripts are allowed via the same per-request nonce as prod.
 * - style-src keeps 'unsafe-inline' because Tailwind v4 injects a runtime
 *   <style> tag that we do not nonce (out of scope). 'strict-dynamic' does not
 *   apply to style-src, so 'unsafe-inline' is honoured there.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ];

  return directives.join("; ");
}
