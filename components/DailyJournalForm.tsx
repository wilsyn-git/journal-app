
import { JournalEditor } from "./JournalEditor"
import { Prompt } from "@prisma/client"

type Props = {
    prompts: Prompt[]
    initialAnswers: Record<string, string>
}

export function DailyJournalForm({ prompts, initialAnswers }: Props) {
    return (
        <JournalEditor prompts={prompts} initialAnswers={initialAnswers} />
    )
}
