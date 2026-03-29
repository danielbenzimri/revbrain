import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, dir, ...props }, ref) => {
    // Default dir="auto" so inputs auto-detect LTR/RTL per content.
    // email/tel/url are always LTR. Callers can override with explicit dir prop.
    const resolvedDir =
      dir ?? (type === 'email' || type === 'tel' || type === 'url' ? 'ltr' : 'auto');
    return (
      <input
        type={type}
        dir={resolvedDir}
        className={cn(
          'flex h-10 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:border-violet-400 focus-visible:ring-1 focus-visible:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
