import { teamCode, type TeamColor } from '@shared/types'
import { teamStyle } from '@/lib/format'
import { cn } from '@/lib/utils'

const SIZES = {
  inline: 'h-4 px-[5px] text-[10px] rounded-[3px]',
  desk: 'h-[18px] px-1.5 text-[11px] rounded-[4px]',
  scorer: 'h-7 px-2 text-sm rounded-[4px]',
} as const

export type PlateSize = keyof typeof SIZES

export function TeamPlate({ color, name, size = 'desk', showName = true, className }: {
  color: TeamColor | string
  name: string
  size?: PlateSize
  showName?: boolean
  className?: string
}) {
  const code = teamCode(name)
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <span
        style={teamStyle(color)}
        aria-hidden
        className={cn(
          'inline-grid shrink-0 place-items-center bg-[var(--team)] font-mono font-semibold leading-none tracking-[0.04em] text-gray-1',
          SIZES[size],
        )}
      >
        {code}
      </span>
      {showName && <span className="truncate font-sans font-medium text-gray-12">{name}</span>}
      {!showName && <span className="sr-only">{name}</span>}
    </span>
  )
}
