import { connection } from 'next/server';

// Opt into dynamic rendering so the nonce-based CSP (#58) applied per-request
// in proxy.ts is stamped onto Next.js's inline hydration scripts. Next.js
// extracts the nonce from the request's Content-Security-Policy header during
// server-side rendering, which only happens for dynamically-rendered routes.
// Without this the page is statically prerendered at build time (no request /
// nonce exists yet), so its scripts ship without a nonce and would be blocked
// by the strict CSP. `connection()` is the documented mechanism for this.
//
// The /reset-password/[token] page is a 'use client' page on a dynamic segment;
// it currently renders dynamically by default, but this layout makes the
// dynamic-render contract explicit so a future generateStaticParams() (or
// other static-optimisation change) cannot silently ship un-nonced scripts and
// break the password-reset flow under the strict CSP.
export default async function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
    await connection();
    return children;
}
