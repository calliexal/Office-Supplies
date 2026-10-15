import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'navy' | 'danger' | 'outline' | 'white';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-[#dd6533] disabled:bg-ink-600',
  navy: 'bg-navy text-white hover:bg-navy-deep disabled:bg-ink-500',
  danger: 'bg-danger text-white hover:bg-[#e83634] disabled:bg-ink-500',
  outline: 'border border-ink-500/80 bg-white font-medium text-ink-500 hover:bg-ink-500/5',
  white: 'bg-white font-medium text-ink hover:bg-white/90',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-4 text-sm rounded-md',
  md: 'h-[47px] px-6 text-sm rounded-lg',
  lg: 'h-[57px] px-6 text-base rounded-[5px]',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, className, children, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-bold transition-colors disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="size-4" label="Working" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
