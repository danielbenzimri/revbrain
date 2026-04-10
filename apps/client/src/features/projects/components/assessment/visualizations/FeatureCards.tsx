/**
 * Feature Cards
 *
 * Visual cards for subscription management, twin fields,
 * and guided selling flows.
 */
import type {
  SubscriptionManagement,
  TwinFieldPair,
  GuidedSellingFlow,
} from '../../../mocks/assessment-mock-data';

// ---------------------------------------------------------------------------
// Subscription Management Card
// ---------------------------------------------------------------------------

interface SubscriptionCardProps {
  data: SubscriptionManagement;
  t: (key: string) => string;
}

export function SubscriptionCard({ data, t }: SubscriptionCardProps) {
  const features = [
    { label: 'Co-termination', enabled: data.hasCoTermination, detail: data.coTerminationBasis },
    {
      label: 'MDQ Products',
      enabled: data.hasMdq,
      detail: `${data.mdqProductCount} products`,
      isBlocker: true,
    },
    { label: 'Evergreen Subscriptions', enabled: data.hasEvergreen },
    {
      label: 'Annual Uplift',
      enabled: data.hasUplift,
      detail: data.upliftDefaultPercent ? `${data.upliftDefaultPercent}% default` : undefined,
    },
    { label: 'Proration', enabled: true, detail: data.prorationMethod },
  ];

  return (
    <div className="bg-white rounded-2xl p-5" data-testid="subscription-card">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        {t('assessment.subTabs.subscriptionManagement')}
      </h3>
      <div className="space-y-2.5">
        {features.map((f, i) => (
          <div key={i} className="flex items-start gap-3">
            <span
              className={`mt-0.5 text-sm ${f.enabled ? (f.isBlocker ? 'text-red-500' : 'text-emerald-500') : 'text-slate-300'}`}
            >
              {f.enabled ? (f.isBlocker ? '⚠' : '✓') : '○'}
            </span>
            <div>
              <p
                className={`text-sm ${f.enabled ? 'text-slate-900 font-medium' : 'text-slate-400'}`}
              >
                {f.label}
              </p>
              {f.detail && <p className="text-xs text-slate-500 mt-0.5">{f.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Twin Field Sync Matrix
// ---------------------------------------------------------------------------

interface TwinFieldMatrixProps {
  pairs: TwinFieldPair[];
  t: (key: string) => string;
}

export function TwinFieldMatrix({ pairs, t }: TwinFieldMatrixProps) {
  return (
    <div className="bg-white rounded-2xl p-5" data-testid="twin-field-matrix">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        {t('assessment.subTabs.twinFields')} ({pairs.length} pairs)
      </h3>
      <div className="space-y-2">
        {pairs.map((pair) => (
          <div key={pair.id} className="flex items-center gap-2 py-2 px-3 bg-slate-50 rounded-lg">
            <div className="flex-1 text-end">
              <p className="text-xs font-mono text-slate-700">{pair.sourceField}</p>
              <p className="text-[10px] text-slate-400">{pair.sourceObject}</p>
            </div>
            <span
              className={`text-sm shrink-0 ${pair.syncDirection === 'bidirectional' ? 'text-violet-500' : 'text-slate-400'}`}
            >
              {pair.syncDirection === 'bidirectional' ? '↔' : '→'}
            </span>
            <div className="flex-1">
              <p className="text-xs font-mono text-slate-700">{pair.targetField}</p>
              <p className="text-[10px] text-slate-400">{pair.targetObject}</p>
            </div>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
              {pair.rcaApproach}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guided Selling Flow Cards
// ---------------------------------------------------------------------------

interface GuidedSellingCardsProps {
  flows: GuidedSellingFlow[];
  t: (key: string) => string;
}

export function GuidedSellingCards({ flows, t }: GuidedSellingCardsProps) {
  return (
    <div className="bg-white rounded-2xl p-5" data-testid="guided-selling-cards">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">
        {t('assessment.subTabs.guidedSelling')} ({flows.length} flows)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {flows.map((flow) => (
          <div key={flow.id} className="bg-slate-50 rounded-xl p-4">
            <p className="text-sm font-medium text-slate-900 mb-2">{flow.name}</p>

            {/* Step visualization */}
            <div className="flex items-center gap-0.5 mb-3">
              {Array.from({ length: flow.stepCount }).map((_, i) => (
                <div key={i} className="flex items-center">
                  <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-600">
                    {i + 1}
                  </div>
                  {i < flow.stepCount - 1 && <div className="w-3 h-0.5 bg-violet-200" />}
                </div>
              ))}
              {flow.hasBranching && (
                <span className="ms-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                  Branching
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center mb-2">
              <div>
                <p className="text-lg font-bold text-slate-900">{flow.inputFields}</p>
                <p className="text-[10px] text-slate-400">Inputs</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{flow.stepCount}</p>
                <p className="text-[10px] text-slate-400">Steps</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{flow.outputProducts}</p>
                <p className="text-[10px] text-slate-400">Outputs</p>
              </div>
            </div>

            <p className="text-xs text-violet-600 bg-violet-50 px-2 py-1 rounded">
              {flow.rcaApproach}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
