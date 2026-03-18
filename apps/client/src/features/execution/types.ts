/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Billing module types — ported from the original REVBRAIN-1 monolith.
 * These types are used by BillingView and ClientBillingView components.
 */

export interface BillingStyleConfig {
  structureBg: string;
  structureText: string;
  chapterBg: string;
  chapterText: string;
  subChapterBg: string;
  subChapterText: string;
  summaryStructureBg: string;
  summaryChapterBg: string;
  summarySubChapterBg: string;
  summaryTotalBg: string;
}

export interface MeasurementRow {
  id: string;
  billNumber?: number;
  sheetId?: string;
  description: string;
  unit: string;
  location: string;
  quantity: number;
  partialPercentage: number;
  total: number;
  approvedQuantity?: number;
  remarks?: string;
  supersededBy?: string;
  supersedes?: string;
  approvalSignature?: {
    userId: string;
    userName: string;
    userTitle?: string;
    signatureDataUrl: string;
    approvedAt: string;
    approverRemarks?: string;
  };
}

export interface BOQItem {
  code: string;
  description: string;
  unit: string;
  contractQuantity: number;
  unitPrice: number;
}

export interface BillItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  contractQuantity: number;
  unitPrice: number;
  previousQuantity: number;
  currentQuantity: number;
  discount: number;
  totalAmount: number;
  measurements: MeasurementRow[];
}

export interface BillRevision {
  id: string;
  savedAt: string;
  savedBy?: {
    userId: string;
    userName: string;
    userRole?: string;
  };
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  items: BillItem[];
  cumulativeAmount: number;
  previousCumulativeAmount: number;
  currentAmount: number;
  notes?: string;
}

export interface Bill {
  id: string;
  number: number;
  date: string;
  period: string;
  items: BillItem[];
  cumulativeAmount: number;
  previousCumulativeAmount: number;
  currentAmount: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  notes?: string;
  attachments?: string[];
  revisions?: BillRevision[];
  contractorSignature?: {
    userId: string;
    userName: string;
    userTitle?: string;
    signatureDataUrl: string;
    signedAt: string;
  };
  approverSignature?: {
    userId: string;
    userName: string;
    userTitle?: string;
    signatureDataUrl: string;
    approvedAt: string;
    approvalNotes?: string;
  };
}

export interface ApprovedBillEntry {
  billNumber: number;
  approvedAmount: number;
  contractAmount?: number;
  exceptionalAmount?: number;
  approvalDate: string;
  notes?: string;
  chapterBreakdown?: { [chapter: string]: number };
}

export type QuantitySourceModule =
  | 'pipes'
  | 'heads'
  | 'exceptions'
  | 'traffic'
  | 'plants'
  | 'walls'
  | 'paving'
  | 'other';

export interface QuantityEntry {
  id: string;
  index: string;
  description: string;
  quantity: number;
  unit?: string;
  executed: boolean;
  billNumber?: number;
  executedAt?: string;
}

export interface QuantityPage {
  id: string;
  pageNumber: number;
  sourceModule: QuantitySourceModule;
  sourceId?: string;
  boqCode?: string;
  boqDescription?: string;
  customTitle?: string;
  folderPath: string[];
  unit: string;
  totalQuantity: number;
  executedQuantity: number;
  entries: QuantityEntry[];
  createdAt: string;
  updatedAt: string;
  customUnitPrice?: number;
  remarks?: string;
}

export interface ExceptionItemCalculation {
  boqCode: string;
  description: string;
  unit: string;
  originalQuantity: number;
  calculatedQuantity: number;
  difference: number;
  percentChange: number;
  isCustom?: boolean;
  isIgnored?: boolean;
  priceLineItems?: unknown[];
  customItemNumber?: string;
  itemId?: string;
  customDescription?: string;
  customUnit?: string;
  excessQuantity?: number;
  newUnitPrice?: number;
}

export interface ProjectMetadata {
  name: string;
  projectName?: string;
  contractNumber?: string;
  contractorName?: string;
  clientName?: string;
  logoContractorUrl?: string;
  logoClientUrl?: string;
  discountType?: 'per_chapter' | 'global';
  discountRate?: number;
  chapterDiscounts?: Record<string, number>;
}

export type UserRole = 'system_admin' | 'org_owner' | 'admin' | 'operator' | 'reviewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  title?: string;
  signatureDataUrl?: string;
  [key: string]: any;
}
