
import React from 'react'

type EntryWithPrompt = {
    id: string;
    answer: string;
    prompt: {
        content: string;
        type: string;
    }
}

export function PastJournalView({ entries, date }: { entries: EntryWithPrompt[], date: string }) {
    // Force parsing as local time by appending time component, or Parse integers. 
    // new Date("YYYY-MM-DD") is UTC. new Date("YYYY-MM-DDT00:00:00") is Local.
    const displayDate = new Date(`${date}T00:00:00`).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <div className="animate-[fade-in_0.5s_ease-out]">
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 mb-8 border-b border-white/10 pb-4">
                {displayDate}
            </h2>

            <div className="space-y-6">
                {entries.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <p>No entries found for this day.</p>
                    </div>
                ) : (
                    entries.map(entry => (
                        <div key={entry.id} className="glass-card p-6 rounded-xl border border-white/10">
                            <h3 className="text-sm font-medium text-primary mb-3 uppercase tracking-wide opacity-80">{entry.prompt.content}</h3>
                            <div className="text-lg text-gray-200 leading-relaxed whitespace-pre-wrap">
                                {/* Ideally parse JSON for Checkboxes/formatted answers */}
                                {formatAnswer(entry.answer, entry.prompt.type)}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

function formatAnswer(answer: string, type: string) {
    if (type === 'CHECKBOX' || type === 'RADIO') {
        try {
            // Check if it's JSON
            if (answer.startsWith('[') || answer.startsWith('{')) {
                const parsed = JSON.parse(answer);
                if (Array.isArray(parsed)) return parsed.join(', ');
                return parsed; // Plain string match in JSON?
            }
        } catch (e) {
            // ignore
        }
    }
    return answer;
}
