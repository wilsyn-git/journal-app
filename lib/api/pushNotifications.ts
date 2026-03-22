import apn from '@parse/node-apn'

let provider: apn.Provider | null = null

function getProvider(): apn.Provider | null {
    if (provider) return provider

    const keyPath = process.env.APNS_KEY_PATH
    const keyId = process.env.APNS_KEY_ID
    const teamId = process.env.APNS_TEAM_ID

    if (!keyPath || !keyId || !teamId) {
        console.warn('APNs not configured — push notifications disabled')
        return null
    }

    provider = new apn.Provider({
        token: { key: keyPath, keyId, teamId },
        production: process.env.NODE_ENV === 'production',
    })

    return provider
}

export async function sendPushNotification(
    deviceTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>
) {
    const apnProvider = getProvider()
    if (!apnProvider || deviceTokens.length === 0) return

    const bundleId = process.env.APNS_BUNDLE_ID
    if (!bundleId) return

    const notification = new apn.Notification()
    notification.alert = { title, body }
    notification.sound = 'default'
    notification.badge = 1
    notification.topic = bundleId
    if (data) notification.payload = data

    try {
        await apnProvider.send(notification, deviceTokens)
    } catch (error) {
        console.error('Push notification error:', error)
    }
}
