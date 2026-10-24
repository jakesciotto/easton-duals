import { cn } from '@/lib/utils'

export const SETUP_STEP_LABELS = ['Event', 'Roster', 'Matches'] as const

export type SetupStepNumber = 1 | 2 | 3

export function SetupSteps({ current }: { current: SetupStepNumber }) {
  return (
    <ol aria-label="Setup steps" className="flex flex-wrap items-center gap-1.5 t1 text-gray-10">
      {SETUP_STEP_LABELS.map((label, i) => {
        const n = i + 1
        const active = n === current
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'rounded-full border px-2 py-0.5',
              active ? 'border-transparent bg-gray-4 text-gray-12' : 'border-border',
            )}
          >
            {n} {label}
          </li>
        )
      })}
    </ol>
  )
}
