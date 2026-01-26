'use server'

import { prisma } from "@/lib/prisma"
import { randomBytes } from "crypto"
import { sendEmail } from "@/lib/email"
import { passwordResetEmail } from "@/lib/email/templates"

export async function forgotPassword(formData: FormData) {
    const email = formData.get("email") as string

    if (!email) {
        return { error: "Email is required" }
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email }
        })

        if (!user) {
            // Security: Don't reveal if user exists.
            // But for dev/admin apps, sometimes helpful. 
            // Let's stick to secure standard: "If that email exists, we sent a link."
            return { success: true, message: "If an account exists, a reset link has been sent." }
        }

        // Generate Token
        const token = randomBytes(32).toString("hex")
        const expiry = new Date(Date.now() + 3600 * 1000) // 1 hour

        // Save to DB
        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetToken: token,
                resetTokenExpiry: expiry
            }
        })

        // Send Email
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
        const resetUrl = `${appUrl}/reset-password/${token}`
        const emailContent = passwordResetEmail(resetUrl)

        await sendEmail({
            to: email,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text
        })

        return { success: true, message: "If an account exists, a reset link has been sent." }

    } catch (error) {
        console.error("Forgot Password Error:", error)
        return { error: "Something went wrong. Please try again." }
    }
}

export async function resetPassword(formData: FormData) {
    const token = formData.get("token") as string
    const newPassword = formData.get("newPassword") as string

    if (!token || !newPassword) {
        return { error: "Missing required fields" }
    }

    if (newPassword.length < 6) return { error: "Password too short" }

    try {
        // Find user with valid token
        const user = await prisma.user.findFirst({
            where: {
                resetToken: token,
                resetTokenExpiry: { gt: new Date() }
            }
        })

        if (!user) {
            return { error: "Invalid or expired token" }
        }

        // Hash new password
        const { hash } = await import("bcryptjs") // Dynamic import to avoid edge issues if any, though standard is fine
        const hashedPassword = await hash(newPassword, 12)

        // Update User
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpiry: null
            }
        })

        return { success: true }

    } catch (error) {
        console.error("Reset Password Error:", error)
        return { error: "Failed to reset password" }
    }
}
