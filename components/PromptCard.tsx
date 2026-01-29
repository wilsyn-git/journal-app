
import React from 'react';

type Prompt = {
    id: string;
    content: string;
    type: string;
    options: string | null;
};

interface PromptCardProps {
    prompt: Prompt;
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
}

export function PromptCard({ prompt, value = "", onChange, disabled }: PromptCardProps) {
    let options: string[] = [];
    try {
        if (prompt.options) {
            options = JSON.parse(prompt.options);
        }
    } catch (e) {
        console.error("Failed to parse options for prompt", prompt.id, e);
    }

    const handleChange = (newValue: string) => {
        if (onChange) onChange(newValue);
    };

    const handleCheckboxChange = (option: string, checked: boolean) => {
        let currentValues: string[] = [];
        try {
            currentValues = value ? JSON.parse(value) : [];
            if (!Array.isArray(currentValues)) currentValues = [];
        } catch {
            currentValues = [];
        }

        if (checked) {
            if (!currentValues.includes(option)) currentValues.push(option);
        } else {
            currentValues = currentValues.filter(v => v !== option);
        }

        // Emitting JSON string for checkboxes
        if (onChange) onChange(JSON.stringify(currentValues));
    };

    const isText = prompt.type === 'TEXT';

    if (isText) {
        return (
            <div className="glass-card p-4 rounded-xl border border-white/10 mb-6 group hover:border-white/20 transition-all duration-300">
                <h3 className="text-lg font-medium text-white mb-4">{prompt.content}</h3>
                <textarea
                    name={`prompt_${prompt.id}`}
                    value={value}
                    onChange={(e) => handleChange(e.target.value)}
                    disabled={disabled}
                    className="w-full h-32 bg-white/5 border border-white/10 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none disabled:opacity-50"
                    placeholder="Type your answer here..."
                />
            </div>
        );
    }

    // Horizontal layout for Radio / Checkbox / Range
    // Fallback options if none provided
    const displayOptions = options.length > 0 ? options : ['Yes', 'No'];

    if (prompt.type === 'RANGE') {
        const minLabel = options.length >= 2 ? options[0] : 'Low';
        const maxLabel = options.length >= 2 ? options[1] : 'High';

        // "Ghost State" Logic:
        // If value is empty string, we treat it as null/uninteracted.
        // We visually show it at 50% opacity.
        // Once interacted, we set it to the value (defaulting start to 50 if clicked).
        const hasInteracted = value !== "";
        const numericValue = hasInteracted ? parseInt(value) : 50;

        const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            handleChange(e.target.value);
        };

        return (
            <div className="glass-card p-4 rounded-xl border border-white/10 mb-3 group hover:border-white/20 transition-all duration-300 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-base font-medium text-white">{prompt.content}</h3>
                    {hasInteracted && <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded animate-in fade-in hidden">{value}</span>}
                </div>

                <div className="relative pt-2 pb-1">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={numericValue}
                        onChange={handleRangeChange}
                        disabled={disabled}
                        className={`
                            w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50
                            slider-thumb
                            ${!hasInteracted ? 'opacity-50 grayscale hover:opacity-80 hover:grayscale-0' : 'opacity-100'}
                            transition-all duration-300
                        `}
                    />
                    <div className="flex justify-between mt-2 text-xs text-gray-400 font-medium uppercase tracking-wider">
                        <span>{minLabel}</span>
                        <span>{maxLabel}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card p-4 rounded-xl border border-white/10 mb-3 group hover:border-white/20 transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-start gap-6">
            <h3 className="text-base font-medium text-white shrink-0">{prompt.content}</h3>

            <div className="flex flex-wrap items-center gap-4">
                {prompt.type === 'RADIO' && displayOptions.map((option, idx) => (
                    <label key={idx} className="flex items-center space-x-2 cursor-pointer group/option">
                        <input
                            type="radio"
                            name={`prompt_${prompt.id}`}
                            value={option}
                            checked={value === option}
                            onChange={(e) => handleChange(e.target.value)}
                            disabled={disabled}
                            className="w-4 h-4 border-2 border-white/20 bg-transparent text-primary focus:ring-primary/50 focus:ring-offset-0 focus:ring-offset-transparent transition-all checked:border-primary checked:bg-primary disabled:opacity-50"
                        />
                        <span className="text-xs text-gray-400 group-hover/option:text-white transition-colors uppercase tracking-wide font-medium">{option}</span>
                    </label>
                ))}

                {prompt.type === 'CHECKBOX' && displayOptions.map((option, idx) => {
                    let isChecked = false;
                    try {
                        const currentValues = value ? JSON.parse(value) : [];
                        if (Array.isArray(currentValues)) {
                            isChecked = currentValues.includes(option);
                        }
                    } catch { }

                    return (
                        <label key={idx} className="flex items-center space-x-2 cursor-pointer group/option">
                            <input
                                type="checkbox"
                                name={`prompt_${prompt.id}`}
                                value={option}
                                checked={isChecked}
                                onChange={(e) => handleCheckboxChange(option, e.target.checked)}
                                disabled={disabled}
                                className="w-4 h-4 rounded border-2 border-white/20 bg-transparent text-primary focus:ring-primary/50 focus:ring-offset-0 focus:ring-offset-transparent transition-all checked:border-primary checked:bg-primary disabled:opacity-50"
                            />
                            <span className="text-xs text-gray-400 group-hover/option:text-white transition-colors uppercase tracking-wide font-medium">{option}</span>
                        </label>
                    )
                })}
            </div>
        </div>
    );
}
