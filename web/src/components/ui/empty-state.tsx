import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

function EmptyState({
  message,
  action,
  className,
}: {
  message: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5 font-sans t2 text-gray-10", className)}
    >
      <span>{message}</span>
      {action}
    </div>
  )
}

export { EmptyState }
