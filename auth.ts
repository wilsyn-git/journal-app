
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "./lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "./auth.config"
import { DUMMY_PASSWORD_HASH } from "./lib/api/constantTimeAuth"

async function getUser(email: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });
        return user;
    } catch (error) {
        console.error('Failed to fetch user:', error);
        throw new Error('Failed to fetch user.');
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    session: {
        maxAge: 7 * 24 * 60 * 60, // 7 Days
    },
    providers: [
        Credentials({
            async authorize(credentials) {
                const parsedCredentials = z
                    .object({ email: z.string().email(), password: z.string().min(6) })
                    .safeParse(credentials);

                if (parsedCredentials.success) {
                    const { email, password } = parsedCredentials.data;
                    const user = await getUser(email);
                    // Always run bcrypt.compare (against a dummy hash when the
                    // user is absent) so the response time is constant whether
                    // or not the email exists, closing the user-enumeration
                    // timing side-channel (#61).
                    const passwordsMatch = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH);
                    if (user && passwordsMatch) return user;
                }

                console.log('Invalid credentials');
                return null;
            },
        }),
    ],
    callbacks: {
        async session({ session, token }) {
            if (session.user && token.sub) {
                session.user.id = token.sub;
            }
            if (session.user && token.role) {
                session.user.role = token.role as string;
                session.user.organizationId = token.organizationId as string;
            }
            return session;
        },
        async jwt({ token, user }) {
            if (user) {
                token.role = user.role;
                token.organizationId = user.organizationId;
            }
            return token;
        }
    },
})
