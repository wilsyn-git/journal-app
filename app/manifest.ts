import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'myJournal',
        short_name: 'myJournal',
        description: 'A focused journaling application for daily reflection and personal growth.',
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#09090b',
        theme_color: '#8b5cf6',
        icons: [
            {
                src: '/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    }
}
