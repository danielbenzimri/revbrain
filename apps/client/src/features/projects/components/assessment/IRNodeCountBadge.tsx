/**
 * PH8.5 — IR node count badge.
 *
 * Placeholder surface on the assessment page that proves BB-3 output
 * has reached the UI layer — BEFORE BB-4/5/7 build the real views.
 * Displays "IR nodes: N" when the server returns a count, or a
 * muted "IR: pending" placeholder when the graph hasn't been
 * stored yet.
 *
 * This is intentionally minimal: it is a smoke indicator, not the
 * real UI. Real UI arrives with BB-5 / BB-6 / BB-7.
 *
 * Spec: docs/MIGRATION-PLANNER-BB3-TASKS.md PH8.5
 */

import { useTranslation } from 'react-i18next';

export interface IRNodeCountBadgeProps {
  /** Node count from `/assessment/status`, null when no graph is stored. */
  irNodeCount: number | null | undefined;
}

export default function IRNodeCountBadge({ irNodeCount }: IRNodeCountBadgeProps) {
  const { t } = useTranslation();
  const hasGraph = typeof irNodeCount === 'number';

  return (
    <span
      data-testid="ir-node-count-badge"
      data-ir-node-count={hasGraph ? irNodeCount : ''}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
        border border-slate-200
        ${hasGraph ? 'bg-violet-50 text-violet-700' : 'bg-slate-50 text-slate-500'}
      `}
      aria-label={t('assessment.irBadge.ariaLabel', {
        defaultValue: 'BB-3 IR graph node count',
      })}
      title={t('assessment.irBadge.tooltip', {
        defaultValue:
          'Node count from the BB-3 intermediate representation graph. Placeholder until BB-5/6/7.',
      })}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {hasGraph
        ? t('assessment.irBadge.count', {
            defaultValue: 'IR nodes: {{count}}',
            count: irNodeCount as number,
          })
        : t('assessment.irBadge.pending', { defaultValue: 'IR: pending' })}
    </span>
  );
}
