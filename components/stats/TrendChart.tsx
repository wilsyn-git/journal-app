'use client';

import React, { useState } from 'react';

type DataPoint = {
    date: string;
    value: number;
}

export function TrendChart({ data, name }: { data: DataPoint[], name: string }) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Filter out potential bad data
    const validData = data.filter(d => !isNaN(d.value));

    if (validData.length < 2) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-xl border border-white/5">
                <p>Not enough data to show trends.</p>
                <p className="text-xs mt-1">Log at least 2 entries.</p>
            </div>
        )
    }

    // Chart Dimensions
    const width = 800;
    const height = 300;
    const padding = 40;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    // Scales
    const minX = 0;
    const maxX = validData.length - 1;
    const minY = 0;
    const maxY = 100; // Fixed scale 0-100

    const getX = (index: number) => padding + (index / maxX) * graphWidth;
    const getY = (value: number) => height - padding - (value / maxY) * graphHeight;

    // Generate Path
    const points = validData.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' ');

    // Smooth helper (simple version)
    // Actually, simple polyline is often clearer for distinct daily points, but let's try a simple fill
    const fillPath = `${points} ${getX(validData.length - 1)},${height - padding} ${padding},${height - padding}`;

    return (
        <div className="w-full">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary/80"></span>
                {name}
            </h3>
            <div className="relative w-full aspect-[8/3] group">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                    {/* Grid Lines */}
                    {[0, 25, 50, 75, 100].map(tick => (
                        <g key={tick}>
                            <line
                                x1={padding}
                                y1={getY(tick)}
                                x2={width - padding}
                                y2={getY(tick)}
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="1"
                                strokeDasharray="4 4"
                            />
                            <text
                                x={padding - 10}
                                y={getY(tick) + 4}
                                className="text-[10px] fill-gray-500 text-right"
                                textAnchor="end"
                            >
                                {tick}
                            </text>
                        </g>
                    ))}

                    {/* Left Fill Gradient */}
                    <defs>
                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                        </linearGradient>
                    </defs>
                    <path d={`M ${points} L ${getX(validData.length - 1)},${height - padding} L ${padding},${height - padding} Z`} fill="url(#trendGradient)" stroke="none" />

                    {/* The Line */}
                    <polyline
                        points={points}
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />

                    {/* Data Points */}
                    {validData.map((d, i) => (
                        <g key={i}
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            className="cursor-pointer"
                        >
                            <circle
                                cx={getX(i)}
                                cy={getY(d.value)}
                                r={hoveredIndex === i ? 6 : 4}
                                fill="var(--background)"
                                stroke="var(--primary)"
                                strokeWidth="2"
                                className="transition-all duration-200"
                            />
                            {/* Hitbox */}
                            <rect
                                x={getX(i) - 10}
                                y={0}
                                width={20}
                                height={height}
                                fill="transparent"
                            />
                        </g>
                    ))}

                    {/* Hover Tooltip (SVG Overlay) */}
                    {hoveredIndex !== null && validData[hoveredIndex] && (
                        <g transform={`translate(${getX(hoveredIndex)}, ${getY(validData[hoveredIndex].value) - 10})`}>
                            <rect x="-40" y="-35" width="80" height="30" rx="4" fill="rgba(0,0,0,0.8)" />
                            <text x="0" y="-15" textAnchor="middle" fill="white" className="text-xs font-bold">
                                {validData[hoveredIndex].value}
                            </text>
                            <text x="0" y="4" textAnchor="middle" fill="gray" className="text-[8px]">
                                {validData[hoveredIndex].date.slice(5)}
                            </text>
                        </g>
                    )}
                </svg>

                {/* X Axis Labels (Simple start/end) */}
                <div className="flex justify-between px-4 mt-2 text-xs text-gray-500">
                    <span>{validData[0].date}</span>
                    <span>{validData[validData.length - 1].date}</span>
                </div>
            </div>
        </div>
    )
}
