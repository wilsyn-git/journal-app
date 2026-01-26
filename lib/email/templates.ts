
export function welcomeEmail(name: string) {
    const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Welcome to Journal.ai, ${name}!</h1>
        <p>We're excited to have you on board. Your journey to a clearer mind starts today.</p>
        <p>Click below to start your first entry:</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display: inline-block; padding: 12px 24px; background-color: #8b5cf6; color: white; text-decoration: none; border-radius: 6px;">
            Start Journaling
        </a>
    </div>
    `;
    return {
        subject: "Welcome to Journal.ai",
        html,
        text: `Welcome to Journal.ai, ${name}! We're excited to have you on board. Log in at ${process.env.NEXT_PUBLIC_APP_URL}`
    };
}

export function passwordResetEmail(resetUrl: string) {
    const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Reset Your Password</h1>
        <p>You requested a password reset. Click the button below to choose a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #8b5cf6; color: white; text-decoration: none; border-radius: 6px;">
            Reset Password
        </a>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
    `;
    return {
        subject: "Reset your Journal.ai Password",
        html,
        text: `Reset your password here: ${resetUrl}`
    };
}
