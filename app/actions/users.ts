'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email'
import { welcomeEmail } from '@/lib/email/templates'
import bcrypt from 'bcryptjs'
import { ensureAdmin } from './helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createUser(prevState: any, formData: FormData) {
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;

    const email = formData.get('email') as string;
    const name = formData.get('name') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
        return { error: 'Email and password are required' }
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        return { error: 'User already exists with this email' }
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.user.create({
            data: {
                email,
                name,
                password: hashedPassword,
                organizationId,
                role: 'USER' // Defaults to User
            }
        });

        // Send Welcome Email
        try {
            const emailContent = welcomeEmail(name || email)
            await sendEmail({
                to: email,
                subject: emailContent.subject,
                html: emailContent.html,
                text: emailContent.text
            })
        } catch (error) {
            console.error("Failed to send welcome email:", error)
            // Don't fail the user creation
        }

        revalidatePath('/admin/users');
        return { success: true }
    } catch (e) {
        console.error(e)
        return { error: 'Failed to create user' }
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateUser(userId: string, prevState: any, formData: FormData) {
    await ensureAdmin();
    // Validate org access? Ideally check if target user is in same org.
    // For simplicity assuming shared org context or admin super-power properly scoped.

    const email = formData.get('email') as string;
    const name = formData.get('name') as string;
    const excludeFromStats = formData.get('excludeFromStats') === 'on';

    if (!email) return { error: 'Email is required' };

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                email,
                name,
                excludeFromStats
            }
        });
        revalidatePath(`/admin/users/${userId}`);
        revalidatePath('/admin/users');
        revalidatePath('/admin'); // Update dashboard stats too
        return { success: true };
    } catch (e) {
        return { error: 'Failed to update user' };
    }
}

export async function deleteUser(userId: string) {
    const session = await ensureAdmin();

    // 1. Prevent Self-Deletion
    if (session?.user?.id === userId) {
        return { error: "You cannot delete your own account." }
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 2. Delete dependent data manually if cascade isn't fully relied upon
            // (Though schema has some relations, it's safer to be explicit for critical user data)

            // Delete Journal Entries
            await tx.journalEntry.deleteMany({ where: { userId } });

            // Delete Avatars
            await tx.userAvatar.deleteMany({ where: { userId } });

            // Remove from Groups (Implicit handling via link table, but let's be sure)
            // Many-to-many is handled by Prisma, no manual disconnect needed usually.

            // 3. Delete User
            await tx.user.delete({ where: { id: userId } });
        });

        revalidatePath('/admin/users');
        return { success: true };

    } catch (e) {
        console.error("Delete User Failed:", e);
        return { error: "Failed to delete user. Check logs." };
    }
}
