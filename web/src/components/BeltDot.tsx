import { beltDotStyle, beltLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The belt as a dot. The family colour fills it and a stripe belt carries the stripe at
 * its centre. The name rides the title and the accessible label, so colour never carries
 * the belt alone.
 */
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
