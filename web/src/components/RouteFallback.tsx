import { Skeleton } from '@/components/ui/skeleton'

const ROW_HEIGHT = { compact: 32, default: 40, 'two-line': 56 } as const
export type FallbackRung = keyof typeof ROW_HEIGHT

export function RouteFallback({ rung = 'default', tabs = true, rows = 6 }: {
  rung?: FallbackRung
  tabs?: boolean
  rows?: number
}) {
  return (
    <div role="status" aria-label="Loading" className="min-h-dvh">
      <div aria-hidden>
        <div className="sticky top-0 z-10 border-b border-gray-7 bg-background py-3">
          <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-6">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
        <main className="mx-auto max-w-6xl">
          <div className="grid gap-2 px-6 pt-6 pb-4">
            <Skeleton className="h-7 w-56" />
          </div>
          {tabs && (
            <div className="flex gap-6 border-b border-gray-7 px-6">
              {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="my-3 h-4 w-14" />)}
            </div>
          )}
          <div className="grid gap-6 px-6 py-6">
            <div className="overflow-hidden rounded-lg">
              <div className="h-8 bg-gray-1" />
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} style={{ height: ROW_HEIGHT[rung] }} className="flex items-center border-t border-gray-7 px-3 first-of-type:border-t-0">
                  <Skeleton className="h-4 w-full max-w-sm" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
