import { Ellipsis } from 'lucide-react'
import { Menu } from '@base-ui/react/menu'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export interface MenuItemSpec {
  key: string
  label: string
  disabled: boolean
  onSelect: () => void
  tone?: 'destructive'
}

export function OverflowMenu({ label, text, disabled = false, items, className }: {
  label: string
  text?: string
  disabled?: boolean
  items: MenuItemSpec[]
  className?: string
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={label}
        disabled={disabled}
        className={buttonVariants({ variant: 'ghost', size: text === undefined ? 'xs' : 'sm', className: cn('self-center', className) })}
      >
        {text ?? <Ellipsis />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="isolate z-50">
          <Menu.Popup className="min-w-48 origin-(--transform-origin) rounded-xl border border-border bg-popover p-1 shadow-dialog">
            {items.map(item => (
              <Menu.Item
                key={item.key}
                disabled={item.disabled}
                onClick={item.onSelect}
                className={cn(
                  'flex cursor-default items-center rounded-md px-2.5 py-1.5 t3 outline-none select-none data-disabled:opacity-50 data-highlighted:bg-gray-4',
                  item.tone === 'destructive' ? 'text-fault' : 'text-gray-11 data-highlighted:text-white',
                )}
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
