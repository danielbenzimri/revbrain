/* eslint-disable react-hooks/refs */
/**
 * useBillingData
 *
 * Loads billing state and BOQ items from the BOQ API.
 * TODO: Wire up to a dedicated billing persistence API.
 */
import { useState, useCallback, useRef } from 'react';
import { useBOQItems } from '@/features/boq/hooks/use-boq';
import type { Bill, BOQItem, ApprovedBillEntry, QuantityPage } from '../types';

export interface BillingState {
  bills: Bill[];
  approvedBills: ApprovedBillEntry[];
  quantityPages: QuantityPage[];
}

const EMPTY: BillingState = {
  bills: [],
  approvedBills: [],
  quantityPages: [],
};

export function useBillingData(projectId: string | undefined) {
  const [localState, setLocalState] = useState<BillingState>(EMPTY);

  // ── Fetch BOQ items from the BOQ API ──────────────────────────────────────
  const { data: boqData, isLoading: boqLoading } = useBOQItems(projectId);

  // Convert backend BOQ items → original format (code, description, unit, qty, price)
  const boqItems: BOQItem[] = (boqData?.items ?? [])
    .filter((item) => item.unit) // only leaf items with units
    .map((item) => ({
      code: item.code,
      description: item.description,
      unit: item.unit || '',
      contractQuantity: item.contractQuantity ?? 0,
      unitPrice: (item.unitPriceCents ?? 0) / 100,
    }));

  // ── Update helpers ────────────────────────────────────────────────────────
  const stateRef = useRef(localState);
  stateRef.current = localState;

  const save = useCallback((next: Partial<BillingState>) => {
    const merged = { ...stateRef.current, ...next };
    setLocalState(merged);
    // TODO: persist to backend via dedicated billing API
  }, []);

  return {
    bills: localState.bills,
    boqItems,
    approvedBills: localState.approvedBills,
    quantityPages: localState.quantityPages,
    isLoading: boqLoading,
    isSaving: false,
    save,
    updateBills: useCallback((bills: Bill[]) => save({ bills }), [save]),
    updateApprovedBills: useCallback(
      (approvedBills: ApprovedBillEntry[]) => save({ approvedBills }),
      [save]
    ),
    updateQuantityPages: useCallback(
      (quantityPages: QuantityPage[]) => save({ quantityPages }),
      [save]
    ),
  };
}
