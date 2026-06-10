import { connection } from 'next/server';

// Opt into dynamic rendering so the nonce-based CSP (#58) applied per-request
// in proxy.ts is stamped onto Next.js's inline hydration scripts. Next.js
// extracts the nonce from the request's Content-Security-Policy header during
// server-side rendering, which only happens for dynamically-rendered routes.
// Without this the page is statically prerendered at build time (no request /
// nonce exists yet), so its scripts ship without a nonce and would be blocked
// by the strict CSP. `connection()` is the documented mechanism for this.
export default async function LoginLayout({ children }: { children: React.ReactNode }) {
    await connection();
    return children;
}
