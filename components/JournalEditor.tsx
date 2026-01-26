
'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PromptCard } from './PromptCard';
import { saveJournalResponse } from '@/app/lib/actions';
import { Prompt } from '@prisma/client';

interface JournalEditorProps {
    prompts: Prompt[];
    initialAnswers?: Record<string, string>;
}

export function JournalEditor({ prompts, initialAnswers = {} }: JournalEditorProps) {
    // State to store answers: { [promptId]: answerString }
    const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);

    // Saving status: 'idle' | 'saving' | 'saved' | 'error'
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    // Track pending saves to avoid race conditions or use a queue?
    // Simple debounce per prompt is likely sufficient. 
    // Actually, we want to debounce the *call* to server.

    // We use a ref to keep track of timeout IDs for each prompt to debounce them individually if user switches between them quickly?
    // Or just one global saver? 
    // Let's debounce per prompt ID so editing one doesn't delay saving another if we wanted that, 
    // but individually is safer.

    const timeoutRefs = useRef<Record<string, NodeJS.Timeout>>({});

    const debouncedSave = useCallback((promptId: string, value: string) => {
        setStatus('saving');

        // Clear existing timeout for this prompt
        if (timeoutRefs.current[promptId]) {
            clearTimeout(timeoutRefs.current[promptId]);
        }

        // Set new timeout
        timeoutRefs.current[promptId] = setTimeout(async () => {
            try {
                const result = await saveJournalResponse(promptId, value);
                if (result.error) {
                    setStatus('error');
                    console.error(result.error);
                } else {
                    setStatus('saved');
                    setLastSaved(new Date());

                    // Reset to idle after a moment?
                    setTimeout(() => setStatus('idle'), 2000);
                }
            } catch (e) {
                setStatus('error');
                console.error(e);
            } finally {
                delete timeoutRefs.current[promptId];
            }
        }, 1000); // 1 second debounce
    }, []);

    const handleChange = (promptId: string, newValue: string) => {
        // 1. Update UI immediately
        setAnswers(prev => ({ ...prev, [promptId]: newValue }));

        // 2. Trigger debounced save
        debouncedSave(promptId, newValue);
    };

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            Object.values(timeoutRefs.current).forEach(clearTimeout);
        };
    }, []);

    return (
        <div className="animate-[fade-in_0.5s_ease-out]">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 mb-2">Today</h2>
                    <p className="text-muted-foreground">What is on your mind?</p>
                </div>

                {/* Status Indicator */}
                <div className="flex flex-col items-end h-10 justify-center">
                    {status === 'saving' && (
                        <span className="text-sm text-yellow-400 animate-pulse">Saving...</span>
                    )}
                    {status === 'saved' && (
                        <span className="text-sm text-green-400">Saved</span>
                    )}
                    {status === 'error' && (
                        <span className="text-sm text-red-400">Error saving</span>
                    )}
                    {lastSaved && status === 'idle' && (
                        <span className="text-xs text-muted-foreground">Last saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                </div>
            </div>

            <div className="grid gap-2">
                {prompts.map(prompt => (
                    <PromptCard
                        key={prompt.id}
                        prompt={prompt}
                        value={answers[prompt.id]}
                        onChange={(val) => handleChange(prompt.id, val)}
                    />
                ))}
            </div>

            {/* Optional: Manual Save Button (Legacy / Force Save) */}
            <div className="mt-8 flex justify-end opacity-50 hover:opacity-100 transition-opacity">
                <button
                    className="text-xs text-muted-foreground hover:text-white transition-colors"
                >
                    Auto-save enabled
                </button>
            </div>
        </div>
    )
}
