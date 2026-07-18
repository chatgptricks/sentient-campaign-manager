import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary:
          'border-[var(--acid)] bg-[var(--acid)] px-4 text-black hover:bg-[var(--acid-soft)]',
        secondary:
          'border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 text-[var(--text)] hover:border-[var(--acid)]',
        ghost:
          'border-transparent bg-transparent px-3 text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]',
        danger: 'border-red-500/50 bg-red-500/10 px-4 text-red-300 hover:bg-red-500/20',
      },
      size: {
        sm: 'min-h-8 px-3 text-xs',
        md: '',
        lg: 'min-h-12 px-5 text-base',
        icon: 'size-10 px-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
