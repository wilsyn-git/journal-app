import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/about', '/login', '/forgot-password'],
      disallow: ['/dashboard', '/admin', '/stats', '/settings', '/api'],
    },
    sitemap: 'https://myjournal.lol/sitemap.xml',
  }
}
