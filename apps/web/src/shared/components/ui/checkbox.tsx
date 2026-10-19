import * as React from 'react'
import { cn } from '@/shared/lib/utils'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  /** API compatible con shadcn/radix: recibe el nuevo estado booleano. */
  onCheckedChange?: (checked: boolean) => void
}

/**
 * Checkbox nativo estilizado con los tokens del theme. Mantiene la
 * accesibilidad del input nativo (teclado, label, formularios).
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onChange, onCheckedChange, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        ref={ref}
        className={cn(
          'h-4 w-4 shrink-0 cursor-pointer rounded-sm border border-primary accent-[hsl(var(--primary))] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        onChange={(e) => {
          onChange?.(e)
          onCheckedChange?.(e.target.checked)
        }}
        {...props}
      />
    )
  },
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
