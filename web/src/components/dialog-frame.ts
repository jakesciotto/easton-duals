import { cn } from '@/lib/utils'

export type DialogWidth = 512 | 576 | 640 | 672

const WIDTH: Record<DialogWidth, string> = {
  512: 'sm:max-w-[512px]',
  576: 'sm:max-w-[576px]',
  640: 'sm:max-w-[640px]',
  672: 'sm:max-w-[672px]',
}

export function dialogSurface(width: DialogWidth): string {
  return cn(
    'top-0 right-0 bottom-0 left-0 h-full max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] rounded-none border-0',
    'sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:h-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border',
    WIDTH[width],
  )
}

export const dialogStack = 'row-span-3 grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]'

export const dialogBody = 'min-h-0 max-h-none sm:max-h-[calc(100dvh-10rem)]'

export const dialogFooter = 'rounded-none pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:rounded-b-xl sm:pb-3.5'
