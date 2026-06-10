import { computeStripCells, type StripCellState } from '@/lib/habitStrip'
import type { DailyHabitStat } from '@/lib/rules'

const CELL_CLASS: Record<StripCellState, string> = {
  empty: 'bg-white/[0.08]',
  done: 'bg-[#166534]',
  streak: 'bg-[#4ade80]',
}

export function DailyHabitConsistency({
  habits,
  todayStr,
}: {
  habits: DailyHabitStat[]
  todayStr: string
}) {
  if (habits.length === 0) {
    return (
      <div className="text-muted-foreground italic p-8 glass-card rounded-xl border border-white/10">
        No daily habits yet. Daily rules assigned to you will show up here as you build streaks.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {habits.map(habit => {
        const cells = computeStripCells(habit.completedDays, habit.currentStreak, todayStr)
        return (
          <div
            key={habit.id}
            className="glass-card p-4 rounded-xl border border-white/10 group hover:bg-white/5 transition-colors"
          >
            <div className="flex justify-between items-start mb-3 gap-4">
              <h3 className="text-white font-medium">{habit.content}</h3>
              <div className="flex gap-8 text-right shrink-0">
                <div>
                  <span className="block text-xl font-bold text-green-400">{habit.currentStreak}</span>
                  <span className="text-xs text-gray-400 uppercase">Streak</span>
                </div>
                <div>
                  <span className="block text-xl font-bold text-gray-300">{habit.maxStreak}</span>
                  <span className="text-xs text-gray-400 uppercase">Best</span>
                </div>
              </div>
            </div>
            <div className="flex gap-1" aria-hidden="true">
              {cells.map((state, i) => (
                <div key={i} className={`h-4 flex-1 rounded-sm ${CELL_CLASS[state]}`} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">Completed {habit.count} times</p>
          </div>
        )
      })}
    </div>
  )
}
