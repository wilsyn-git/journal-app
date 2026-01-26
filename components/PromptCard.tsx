
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

    // Horizontal layout for Radio / Checkbox
    // Fallback options if none provided
    const displayOptions = options.length > 0 ? options : ['Yes', 'No'];

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
