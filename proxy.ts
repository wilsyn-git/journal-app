import NextAuth from "next-auth"
import { NextResponse } from "next/server"
import { authConfig } from "./auth.config"
import { buildCsp } from "./lib/csp"

const { auth } = NextAuth(authConfig)

/**
 * Network-boundary handler (Next.js 16 `proxy`).
 *
 * Runs NextAuth's `authorized` callback (see auth.config.ts) for access
 * control, and additionally applies a nonce-based Content-Security-Policy
 * (#58). A fresh nonce is generated per request and forwarded on the request
 * headers as `x-nonce` so Next.js stamps its own streamed inline hydration
 * scripts with it; the CSP is also set on the response headers (the canonical
 * Next.js App Router pattern).
 *
 * When the `authorized` callback returns false / a redirect, NextAuth's
 * wrapper short-circuits with that response before this callback runs, so auth
 * redirects are unaffected. For authorized requests we return a
 * `NextResponse.next()` carrying the CSP so the page is served with it.
 *
 * This opts matched routes into dynamic rendering (the nonce differs per
 * request). The app is already dynamic (auth, Prisma, server actions), so that
 * is acceptable.
 */
export const proxy = auth((req) => {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
    const isDev = process.env.NODE_ENV !== "production"
    const csp = buildCsp(nonce, isDev)

    const requestHeaders = new Headers(req.headers)
    requestHeaders.set("x-nonce", nonce)
    requestHeaders.set("Content-Security-Policy", csp)

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    })
    response.headers.set("Content-Security-Policy", csp)

    return response
})

export const config = {
    // https://nextjs.org/docs/app/api-reference/file-conventions/proxy#matcher
    matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
