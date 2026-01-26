'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ToastType = 'success' | 'error' | 'info'

type Toast = {
    id: string
    type: ToastType
    message: ReactNode
    duration?: number
}

type ToastContextType = {
    addToast: (type: ToastType, message: ReactNode, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) throw new Error('useToast must be used within a ToastProvider')
    return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [mounted, setMounted] = useState(false)
    const [toasts, setToasts] = useState<Toast[]>([])

    useEffect(() => {
        setMounted(true)
    }, [])

    const addToast = (type: ToastType, message: ReactNode, duration = 5000) => {
        const id = Math.random().toString(36).substring(2, 9)
        setToasts(prev => [...prev, { id, type, message, duration }])

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id)
            }, duration)
        }
    }

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            {/* Render Toasts */}
            {mounted && createPortal(
                <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                    {toasts.map(toast => (
                        <div
                            key={toast.id}
                            className={`
                                pointer-events-auto min-w-[300px] max-w-md p-4 rounded-xl shadow-2xl border backdrop-blur-md animate-in slide-in-from-bottom-5 fade-in duration-300
                                ${toast.type === 'success' ? 'bg-green-950/80 border-green-500/30 text-green-100' : ''}
                                ${toast.type === 'error' ? 'bg-red-950/80 border-red-500/30 text-red-100' : ''}
                                ${toast.type === 'info' ? 'bg-blue-950/80 border-blue-500/30 text-blue-100' : ''}
                            `}
                        >
                            <div className="flex justify-between items-start gap-4">
                                <div className="text-sm font-medium leading-relaxed">
                                    {toast.message}
                                </div>
                                <button
                                    onClick={() => removeToast(toast.id)}
                                    className="shrink-0 text-white/50 hover:text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    )
}
