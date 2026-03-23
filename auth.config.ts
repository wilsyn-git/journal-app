import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const pathname = nextUrl.pathname;

            // Public routes that don't require authentication
            const publicPaths = [
                '/login',
                '/forgot-password',
                '/reset-password',
            ];
            const isPublicPath = publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'));
            const isPublicApi = pathname.startsWith('/api/v1/');
            const isStaticAsset = ['/icon.png', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml'].includes(pathname);

            // Allow public routes
            if (isPublicPath || isPublicApi || isStaticAsset) {
                // Redirect logged-in users away from login page
                if (isLoggedIn && pathname === '/login') {
                    return Response.redirect(new URL('/dashboard', nextUrl));
                }
                return true;
            }

            // Everything else requires authentication
            if (!isLoggedIn) return false;
            return true;
        },
    },
    providers: [], // Configured in auth.ts with proper imports
} satisfies NextAuthConfig;
