import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// 7.14: dotless, for data (Badge's leading dot is the status semantic and
// stays reserved for status). A label plus a mono value, or plain children
// for a one-piece value such as a match's "why". Truncated with a title.
//
// size picks the type step instead of taking it through className: t1/t2/t3 are
// plain classes, not a twMerge-recognised group, so a caller's className could
// not reliably replace the default step (see label.tsx for the same gotcha).
function Chip({
  label,
  value,
  children,
  title,
  size = "t3",
  className,
}: {
  label?: ReactNode
  value?: ReactNode
  children?: ReactNode
  title?: string
  size?: "t1" | "t3"
  className?: string
}) {
  return (
    <span
      data-slot="chip"
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md bg-gray-5 px-2 py-0.5 text-gray-11",
        size,
        className
      )}
    >
      {label !== undefined && <span className="text-gray-9">{label}</span>}
      {value !== undefined ? <span className="fig text-gray-11">{value}</span> : children}
    </span>
  )
}

export { Chip }
