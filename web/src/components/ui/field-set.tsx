import * as React from "react"

import { cn } from "@/lib/utils"

function FieldSet({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-set"
      data-frame="ruled"
      className={cn(
        "min-w-0 overflow-hidden rounded-lg",
        "data-[frame=ruled]:border-2 data-[frame=ruled]:border-transparent",
        "data-[frame=card]:border data-[frame=card]:border-border data-[frame=card]:bg-card",
        "transition-colors duration-150 ease-standard",
        className
      )}
      {...props}
    />
  )
}

function FieldHead({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-head"
      className={cn(
        "h-8 items-center bg-gray-1 px-3 t1 uppercase text-gray-10",
        className
      )}
      {...props}
    />
  )
}

function FieldRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-row"
      className={cn(
        "items-center border-t border-gray-7 px-3 first-of-type:border-t-0",
        "transition-colors duration-120 ease-out",
        "hover:bg-accent active:bg-accent-press data-[selected=true]:bg-accent-press",
        className
      )}
      {...props}
    />
  )
}

export { FieldSet, FieldHead, FieldRow }
