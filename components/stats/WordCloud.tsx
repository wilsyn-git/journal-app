"use client"

export function WordCloud({ words }: { words: { text: string, value: number }[] }) {
    if (words.length === 0) return <div className="text-gray-500 italic">No text entries yet.</div>

    // Normalize size
    const max = words[0]?.value || 1
    const min = words[words.length - 1]?.value || 0

    const getSize = (val: number) => {
        // Linear scale between 0.8rem and 2rem
        const normalized = (val - min) / (max - min || 1)
        return `${0.8 + (normalized * 1.5)}rem`
    }

    const getOpacity = (val: number) => {
        const normalized = (val - min) / (max - min || 1)
        return 0.4 + (normalized * 0.6)
    }

    return (
        <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center items-center py-4">
            {words.slice(0, 40).map((w, i) => (
                <span
                    key={i}
                    className="text-white hover:text-primary transition-colors cursor-default select-none"
                    title={`${w.value} uses`}
                    style={{
                        fontSize: getSize(w.value),
                        opacity: getOpacity(w.value)
                    }}
                >
                    {w.text}
                </span>
            ))}
        </div>
    )
}
