import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

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
