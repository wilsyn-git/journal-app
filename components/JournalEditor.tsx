'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PromptCard } from './PromptCard';
import { saveJournalResponse } from '@/app/actions/journal';
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

    // Refs so unload/flush handlers always see current save state:
    // - answersRef: latest values (debounced saves and Retry read from here)
    // - dirtyRef: prompt IDs changed since their last successful save
    // - inFlightRef: number of save requests currently awaiting a response
    const answersRef = useRef(answers);
    const dirtyRef = useRef<Set<string>>(new Set());
    const inFlightRef = useRef(0);

    // Debounce saves per prompt ID so editing one doesn't delay saving another
    const timeoutRefs = useRef<Record<string, NodeJS.Timeout>>({});

    const saveNow = useCallback(async (promptId: string) => {
        const value = answersRef.current[promptId] ?? '';
        inFlightRef.current += 1;
        setStatus('saving');
        try {
            const result = await saveJournalResponse(promptId, value);
            if (result.error) {
                setStatus('error');
                return;
            }
            // Only mark clean if the value didn't change while the save was in flight
            if ((answersRef.current[promptId] ?? '') === value) {
                dirtyRef.current.delete(promptId);
            }
            if (dirtyRef.current.size === 0) {
                setStatus('saved');
                setLastSaved(new Date());
            }
        } catch (e) {
            console.error(e);
            setStatus('error');
        } finally {
            inFlightRef.current -= 1;
        }
    }, []);

    const retryDirty = useCallback(() => {
        for (const promptId of Array.from(dirtyRef.current)) {
            if (timeoutRefs.current[promptId]) {
                clearTimeout(timeoutRefs.current[promptId]);
                delete timeoutRefs.current[promptId];
            }
            void saveNow(promptId);
        }
    }, [saveNow]);

    const debouncedSave = useCallback((promptId: string) => {
        setStatus('saving');

        if (timeoutRefs.current[promptId]) {
            clearTimeout(timeoutRefs.current[promptId]);
        }

        timeoutRefs.current[promptId] = setTimeout(() => {
            delete timeoutRefs.current[promptId];
            void saveNow(promptId);
        }, 1000); // 1 second debounce
    }, [saveNow]);

    const handleChange = (promptId: string, newValue: string) => {
        // 1. Update UI immediately (ref updated synchronously for unload handlers)
        setAnswers(prev => {
            const next = { ...prev, [promptId]: newValue };
            answersRef.current = next;
            return next;
        });
        dirtyRef.current.add(promptId);

        // 2. Trigger debounced save
        debouncedSave(promptId);
    };

    // Warn before unload while changes are unsaved or saves are in flight
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (dirtyRef.current.size > 0 || inFlightRef.current > 0) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    // Flush pending debounced saves as soon as the tab is hidden
    useEffect(() => {
        const flushPending = () => {
            if (document.visibilityState !== 'hidden') return;
            for (const promptId of Object.keys(timeoutRefs.current)) {
                clearTimeout(timeoutRefs.current[promptId]);
                delete timeoutRefs.current[promptId];
                void saveNow(promptId);
            }
        };
        document.addEventListener('visibilitychange', flushPending);
        return () => document.removeEventListener('visibilitychange', flushPending);
    }, [saveNow]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        const timeouts = timeoutRefs.current;
        return () => {
            Object.values(timeouts).forEach(clearTimeout);
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
                <div role="status" aria-live="polite" className="flex flex-col items-end h-10 justify-center">
                    {status === 'saving' && (
                        <span className="text-sm text-yellow-400 animate-pulse">Saving...</span>
                    )}
                    {status === 'saved' && lastSaved && (
                        <span className="text-sm text-green-400">
                            Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    {status === 'error' && (
                        <span className="text-sm text-red-400 flex items-center gap-2">
                            Save failed — your latest changes are not saved.
                            <button
                                onClick={retryDirty}
                                className="underline text-white hover:text-red-200 transition-colors"
                            >
                                Retry
                            </button>
                        </span>
                    )}
                    {status === 'idle' && lastSaved && (
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
