import { OTPField } from "@base-ui/react/otp-field"

import { cn } from "@/lib/utils"

function CodeField({
  length,
  id,
  value,
  defaultValue,
  onValueChange,
  onValueComplete,
  autoFocus,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  length: number
  id?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onValueComplete?: (value: string) => void
  autoFocus?: boolean
  disabled?: boolean
  className?: string
  "aria-label": string
}) {
  return (
    <OTPField.Root
      id={id}
      length={length}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange ? v => onValueChange(v) : undefined}
      onValueComplete={onValueComplete ? v => onValueComplete(v) : undefined}
      disabled={disabled}
      className={cn("flex gap-2", className)}
    >
      {Array.from({ length }, (_, i) => (
        <OTPField.Input
          key={i}
          aria-label={ariaLabel}
          autoFocus={autoFocus && i === 0}
          className="h-[52px] w-11 rounded-sm border border-gray-7 bg-black text-center t8 fig text-white outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ease-standard focus-visible:border-transparent focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </OTPField.Root>
  )
}

export { CodeField }
