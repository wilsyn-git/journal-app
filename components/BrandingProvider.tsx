'use client'

import React, { createContext, useContext } from 'react'

type BrandingContextType = {
    siteName: string
    logoUrl: string | null
}

const BrandingContext = createContext<BrandingContextType>({
    siteName: 'myJournal',
    logoUrl: null
})

export function useBranding() {
    return useContext(BrandingContext)
}

export function BrandingProvider({
    siteName = 'myJournal',
    logoUrl = null,
    children
}: {
    siteName?: string | null
    logoUrl?: string | null
    children: React.ReactNode
}) {
    return (
        <BrandingContext.Provider value={{ siteName: siteName || 'myJournal', logoUrl }}>
            {children}
        </BrandingContext.Provider>
    )
}
