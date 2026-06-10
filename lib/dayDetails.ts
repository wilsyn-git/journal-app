export type DayEntry = {
    id: string
    answer: string
    isLiked: boolean
    prompt: { content: string; type: string }
}

export type DayDetails = {
    date: string
    entries: DayEntry[]
    rules: string[]
    summary: { entryCount: number; wordCount: number }
}

/** Pure transform from raw day data into the shape the modal renders. */
export function buildDayDetails(entries: DayEntry[], ruleTitles: string[], dateStr: string): DayDetails {
    const wordCount = entries.reduce((sum, e) => {
        const trimmed = e.answer.trim()
        return sum + (trimmed ? trimmed.split(/\s+/).length : 0)
    }, 0)

    return {
        date: dateStr,
        entries,
        rules: ruleTitles,
        summary: { entryCount: entries.length, wordCount },
    }
}
