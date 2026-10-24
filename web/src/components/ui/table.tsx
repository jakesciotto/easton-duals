import * as React from "react"

import { cn } from "@/lib/utils"

type Density = "compact" | "default"

const DensityContext = React.createContext<Density>("compact")

const rowHeight: Record<Density, string> = {
  compact: "h-8",
  default: "h-10",
}

function Table({
  className,
  wrapperClassName,
  density = "compact",
  ...props
}: React.ComponentProps<"table"> & { density?: Density; wrapperClassName?: string }) {
  return (
    <div className={cn("overflow-x-auto", wrapperClassName)}>
      <DensityContext.Provider value={density}>
        <table
          data-slot="table"
          data-density={density}
          className={cn("w-full border-collapse t2 text-left", className)}
          {...props}
        />
      </DensityContext.Provider>
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("sticky top-0 z-10 bg-gray-1", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />
}

function TableRow({
  className,
  selected,
  ...props
}: React.ComponentProps<"tr"> & { selected?: boolean }) {
  const density = React.useContext(DensityContext)
  return (
    <tr
      data-slot="table-row"
      data-selected={selected || undefined}
      className={cn(
        rowHeight[density],
        "border-b border-gray-7 transition-colors duration-150 ease-standard last:border-0 hover:bg-gray-3 data-selected:bg-gray-4",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "px-3 align-middle uppercase text-gray-10",
        numeric ? "tick t2 font-mono text-right" : "t1",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-3 align-middle", numeric && "fig text-right", className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
