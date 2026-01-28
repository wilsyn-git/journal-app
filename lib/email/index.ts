import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

type SendEmailParams = {
    to: string;
    subject: string;
    html: string;
    text?: string;
};

const SES_CONFIG = {
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
};

const hasCredentials =
    Boolean(process.env.AWS_ACCESS_KEY_ID) &&
    Boolean(process.env.AWS_SECRET_ACCESS_KEY);

const sesClient = hasCredentials ? new SESClient(SES_CONFIG) : null;
const FROM_EMAIL = process.env.EMAIL_FROM || "noreply@myjournal.com";

export async function sendEmail({ to, subject, html, text }: SendEmailParams) {
    if (sesClient && hasCredentials) {
        try {
            const command = new SendEmailCommand({
                Source: FROM_EMAIL,
                Destination: {
                    ToAddresses: [to],
                },
                Message: {
                    Subject: {
                        Data: subject,
                    },
                    Body: {
                        Html: {
                            Data: html,
                        },
                        Text: {
                            Data: text || html.replace(/<[^>]*>/g, ""), // Simple fallback
                        },
                    },
                },
            });

            await sesClient.send(command);
            console.log(`[EmailService] Sent email to ${to} via SES`);
            return { success: true };
        } catch (error) {
            console.error("[EmailService] SES Error:", error);
            // Fallback to console if SES fails? Maybe not, better to know it failed.
            return { success: false, error };
        }
    } else {
        // Console Provider (Dev Mode)
        console.log("==========================================");
        console.log(`📧 EMAIL TO: ${to}`);
        console.log(`SUBJECT: ${subject}`);
        console.log("------------------------------------------");
        console.log(text || html.replace(/<[^>]*>/g, ""));
        console.log("==========================================");
        return { success: true, mock: true };
    }
}
