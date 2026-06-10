import { PROMPT_TYPES } from '@/lib/promptConstants'

export type EntryWithPrompt = {
    id: string;
    answer: string;
    isLiked: boolean;
    prompt: {
        content: string;
        type: string;
    }
}

export function EntryCard({ entry }: { entry: EntryWithPrompt }) {
    return (
        <div className="glass-card p-6 rounded-xl border border-white/10 relative group">
            <div className="flex justify-between items-start mb-3">
                <h3 className="text-sm font-medium text-primary uppercase tracking-wide opacity-80">{entry.prompt.content}</h3>
            </div>

            <div className="text-lg text-gray-200 leading-relaxed whitespace-pre-wrap">
                {formatAnswer(entry.answer, entry.prompt.type)}
            </div>
        </div>
    )
}

function formatAnswer(answer: string, type: string) {
    if (type === PROMPT_TYPES.CHECKBOX || type === PROMPT_TYPES.RADIO) {
        try {
            if (answer.startsWith('[') || answer.startsWith('{')) {
                const parsed = JSON.parse(answer);
                if (Array.isArray(parsed)) return parsed.join(', ');
                return parsed;
            }
        } catch {
            // ignore
        }
    }
    return answer;
}
