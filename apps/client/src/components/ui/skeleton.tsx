/**
 * Composable Skeleton Components
 *
 * Page-specific loading states that match real layouts for better
 * perceived performance. Used as Suspense fallbacks in the router.
 */

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Base Building Block
// ---------------------------------------------------------------------------

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-200', className)}
      style={style}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Composable Primitives
// ---------------------------------------------------------------------------

export function SkeletonKpi({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-xl p-5', className)}>
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-8 w-28 mb-1" />
      <Skeleton className="h-3 w-14" />
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-xl overflow-hidden', className)}>
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="px-5 py-4 flex gap-4">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <Skeleton key={colIdx} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-xl p-5', className)}>
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="h-40 flex items-end gap-2 pt-4">
        {[60, 40, 75, 50, 65, 35].map((height, i) => (
          <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200 rounded-xl p-4 space-y-3', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page-Specific Compositions
// ---------------------------------------------------------------------------

/** Dashboard: KPIs → Charts → Recent table */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonKpi key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonChart key={i} />
        ))}
      </div>
      <SkeletonTable rows={4} cols={5} />
    </div>
  );
}

/** Projects list: Search bar → Table */
export function ProjectsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}

/** Billing: Plan card → Payment history */
export function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-24" />
        <div className="flex gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <SkeletonTable rows={4} cols={4} />
    </div>
  );
}

/** Team/Users: Header → User list */
export function TeamSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <SkeletonTable rows={5} cols={4} />
    </div>
  );
}

/** Project workspace: Sidebar + Content */
export function WorkspaceSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
        <div className="lg:col-span-3">
          <SkeletonTable rows={5} cols={4} />
        </div>
      </div>
    </div>
  );
}

/** Generic fallback (kept for routes without specific skeleton) */
export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-8 w-1/4" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
