'use client'

import React, { createContext, useContext } from 'react'

type BrandingContextType = {
    siteName: string
    logoUrl: string | null
}

const BrandingContext = createContext<BrandingContextType>({
    siteName: 'Journal.ai',
    logoUrl: null
})

export function useBranding() {
    return useContext(BrandingContext)
}

export function BrandingProvider({
    siteName = 'Journal.ai',
    logoUrl = null,
    children
}: {
    siteName?: string | null
    logoUrl?: string | null
    children: React.ReactNode
}) {
    return (
        <BrandingContext.Provider value={{ siteName: siteName || 'Journal.ai', logoUrl }}>
            {children}
        </BrandingContext.Provider>
    )
}
