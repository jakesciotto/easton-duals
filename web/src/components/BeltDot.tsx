import { beltDotStyle, beltLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

export function BeltDot({ belt, className }: { belt: string | null; className?: string }) {
  const label = beltLabel(belt)
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn('inline-block size-3.5 shrink-0 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.14)]', className)}
      style={beltDotStyle(belt)}
    />
  )
}
