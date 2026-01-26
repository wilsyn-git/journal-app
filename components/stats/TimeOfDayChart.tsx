"use client"

export function TimeOfDayChart({ data }: { data: number[] }) {
    const max = Math.max(...data, 1) // Avoid div by 0

    const buckets = [
        { label: 'Night', range: '12am', idx: 0 },
        { label: 'Morn', range: '6am', idx: 6 },
        { label: 'Noon', range: '12pm', idx: 12 },
        { label: 'Eve', range: '6pm', idx: 18 }
    ]

    return (
        <div className="h-40 flex items-end justify-between gap-1 mt-4 relative">
            {data.map((count, i) => (
                <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    <div
                        className="w-full bg-blue-500/60 group-hover:bg-blue-500 transition-all rounded-t-sm relative min-h-[4px]"
                        style={{ height: `${(count / max) * 100}%` }}
                    >
                        {count > 0 && (
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                {count}
                            </span>
                        )}
                    </div>
                </div>
            ))}

            {/* Axis Labels */}
            <div className="absolute -bottom-6 w-full flex justify-between text-[10px] text-gray-500 px-2">
                {buckets.map(b => (
                    <span key={b.idx} style={{ left: `${(b.idx / 24) * 100}%` }} className="absolute">
                        {b.range}
                    </span>
                ))}
            </div>
        </div>
    )
}
