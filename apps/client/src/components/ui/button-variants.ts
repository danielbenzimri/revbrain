import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-violet-600 text-white hover:bg-violet-700',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
        outline: 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700',
        secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
        ghost: 'hover:bg-slate-100 text-slate-700',
        link: 'text-violet-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded px-3 text-xs',
        lg: 'h-10 rounded px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
