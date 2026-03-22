'use client'

import { revokeDeviceSession, revokeAllDeviceSessions } from '@/app/actions/deviceSessions'

interface DeviceSession {
  id: string
  deviceName: string
  lastActiveAt: Date
  createdAt: Date
}

export function DeviceSessionsList({
  sessions,
  userId,
}: {
  sessions: DeviceSession[]
  userId: string
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-gray-500">No active device sessions.</p>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
        >
          <div>
            <p className="text-sm font-medium text-white">
              {session.deviceName}
            </p>
            <p className="text-xs text-gray-400">
              Last active:{' '}
              {new Date(session.lastActiveAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          </div>
          <button
            onClick={() => revokeDeviceSession(session.id)}
            className="text-xs text-red-400 hover:text-red-300 px-3 py-1 rounded border border-red-400/30 hover:border-red-400/60 transition-colors"
          >
            Revoke
          </button>
        </div>
      ))}
      {sessions.length > 1 && (
        <button
          onClick={() => revokeAllDeviceSessions(userId)}
          className="text-xs text-red-400 hover:text-red-300 mt-2"
        >
          Revoke All Sessions
        </button>
      )}
    </div>
  )
}
