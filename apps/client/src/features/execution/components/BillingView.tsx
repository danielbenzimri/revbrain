/* eslint-disable react-hooks/immutability, react-hooks/purity, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type {
  Bill,
  BillItem,
  BillRevision,
  BOQItem,
  MeasurementRow,
  BillingStyleConfig,
  ProjectMetadata,
  ExceptionItemCalculation,
  ApprovedBillEntry,
  QuantityPage,
  QuantityEntry,
  User,
} from '../types';
import { DEFAULT_BILLING_CONFIG } from '../constants';
import {
  Plus,
  Download,
  Edit,
  Eye,
  Trash2,
  ArrowRight,
  Save,
  Calculator,
  Search,
  FileDigit,
  X,
  Settings,
  Upload,
  Palette,
  CheckCircle,
  Clock,
  Printer,
  Lock,
  Send,
  FileText,
  Layers,
  AlertCircle,
  FileSpreadsheet,
  FolderTree,
  ChevronDown,
  Folder,
  Copy,
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { exportStyledExcel } from '../utils/excelExport';
import { useAppDialog } from '@/contexts/AppDialogContext';

// Using ApprovedBillEntry from types.ts
type ApprovedBill = ApprovedBillEntry;

interface BillingViewProps {
  projectId?: string;
  bills: Bill[];
  onUpdateBills: (bills: Bill[]) => void;
  boqItems: BOQItem[];
  onUpdateBoq: (items: BOQItem[]) => void;
  projectData: ProjectMetadata;
  exceptionsCalculations?: ExceptionItemCalculation[];
  approvedBills?: ApprovedBill[];
  onUpdateApprovedBills?: (bills: ApprovedBill[]) => void;
  quantityPages?: QuantityPage[];
  onUpdateQuantityPages?: (pages: QuantityPage[]) => void;
  currentUser?: User;
}

const EditPageModal = ({
  page,
  onSave,
  onClose,
}: {
  page: QuantityPage;
  onSave: (p: QuantityPage) => void;
  onClose: () => void;
}) => {
  const [edited, setEdited] = useState(page);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div
        className="bg-white p-6 rounded-lg shadow-xl w-96 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg text-slate-800">עריכת פריט</h3>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">תיאור</label>
          <input
            type="text"
            value={edited.customTitle || edited.boqDescription || ''}
            onChange={(e) => setEdited({ ...edited, customTitle: e.target.value })}
            className="w-full border border-slate-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">כמות</label>
            <input
              type="number"
              value={edited.totalQuantity}
              onChange={(e) => setEdited({ ...edited, totalQuantity: parseFloat(e.target.value) })}
              className="w-full border border-slate-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">יחידה</label>
            <input
              type="text"
              value={edited.unit}
              onChange={(e) => setEdited({ ...edited, unit: e.target.value })}
              className="w-full border border-slate-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">מחיר יחידה (₪)</label>
          <input
            type="number"
            value={edited.customUnitPrice !== undefined ? edited.customUnitPrice : ''}
            placeholder="מחיר מחירון"
            onChange={(e) =>
              setEdited({
                ...edited,
                customUnitPrice: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
            className="w-full border border-slate-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <p className="text-xs text-slate-500 mt-1">השאר ריק לשימוש במחיר מחירון</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
          <textarea
            value={edited.remarks || ''}
            onChange={(e) => setEdited({ ...edited, remarks: e.target.value })}
            className="w-full border border-slate-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded font-medium transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={() => onSave(edited)}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded font-medium transition-colors"
          >
            שמור
          </button>
        </div>
      </div>
    </div>
  );
};

const CalcPageModal = ({
  page,
  onSave,
  onClose,
}: {
  page: QuantityPage;
  onSave: (p: QuantityPage) => void;
  onClose: () => void;
}) => {
  const [mode, setMode] = useState<'summary' | 'details'>('summary');
  const [entries, setEntries] = useState<QuantityEntry[]>(page.entries || []);
  const [description, setDescription] = useState(page.customTitle || page.boqDescription || '');

  // Calculate total from entries
  const totalQuantity = entries.reduce((sum, entry) => sum + (entry.quantity || 0), 0);

  // Helper to get index range
  const getIndexRange = (entries: QuantityEntry[]) => {
    if (entries.length === 0) return '-';
    if (entries.length === 1) return entries[0].index;
    return `${entries[0].index}-${entries[entries.length - 1].index}`;
  };

  const handleAddRow = () => {
    const newEntry: QuantityEntry = {
      id: crypto.randomUUID(),
      index: `L${entries.length + 1}`,
      description: '',
      quantity: 0,
      executed: false,
    };
    setEntries([...entries, newEntry]);
  };

  const handleUpdateRow = (id: string, field: keyof QuantityEntry, value: any) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const handleDeleteRow = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  const handleSave = () => {
    onSave({
      ...page,
      entries,
      totalQuantity, // Update total based on entries
      customTitle: description, // Allow updating title too
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-lg shadow-xl w-[800px] h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
          <div>
            <h3 className="font-bold text-lg text-slate-800">דף ריכוז כמויות</h3>
            <div className="text-sm text-slate-500 flex gap-4 mt-1">
              <span>
                סעיף: <strong>{page.boqCode || '-'}</strong>
              </span>
              <span>
                יחידה: <strong>{page.unit}</strong>
              </span>
            </div>
          </div>
          <div className="text-left">
            <div className="text-sm text-slate-500">סה"כ כמות</div>
            <div className="text-2xl font-bold text-blue-600">
              {(totalQuantity ?? 0).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {mode === 'summary' ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-bold text-slate-800">ריכוז כמויות</h4>
                {/* Placeholder for adding more tables in future */}
              </div>

              <table className="w-full text-sm text-right border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="p-3 border border-slate-200 w-16 text-center">מס' דף</th>
                    <th className="p-3 border border-slate-200">תאור העבודה (מיקום/חישוב)</th>
                    <th className="p-3 border border-slate-200 w-24 text-center">כמות מחושבת</th>
                    <th className="p-3 border border-slate-200 w-16 text-center">%</th>
                    <th className="p-3 border border-slate-200 w-24 text-center bg-blue-50 text-blue-800">
                      לשלם
                    </th>
                    <th className="p-3 border border-slate-200 w-24 text-center bg-green-50 text-green-800">
                      מצטברת
                    </th>
                    <th className="p-3 border border-slate-200 w-16 text-center">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 border border-slate-200 text-center">1</td>
                    <td className="p-3 border border-slate-200 font-medium">
                      {getIndexRange(entries)} |{' '}
                      {description || page.customTitle || page.boqDescription}
                    </td>
                    <td className="p-3 border border-slate-200 text-center font-mono">
                      {(totalQuantity ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200 text-center text-slate-500">100%</td>
                    <td className="p-3 border border-slate-200 text-center font-bold text-blue-700 bg-blue-50/50">
                      {(totalQuantity ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200 text-center font-bold text-green-700 bg-green-50/50">
                      {(totalQuantity ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200 text-center">
                      <button
                        type="button"
                        onClick={() => setMode('details')}
                        className="text-blue-600 hover:bg-blue-100 p-1.5 rounded transition-colors"
                        title="ערוך פירוט"
                      >
                        <Edit size={16} />
                      </button>
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-50 font-bold">
                  <tr>
                    <td colSpan={2} className="p-3 border border-slate-200 text-left pl-4">
                      סה"כ לתשלום:
                    </td>
                    <td className="p-3 border border-slate-200 text-center">
                      {(totalQuantity ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200"></td>
                    <td className="p-3 border border-slate-200 text-center text-blue-800">
                      {(totalQuantity ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200 text-center text-green-800">
                      {(totalQuantity ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 border border-slate-200"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="animate-in slide-in-from-right duration-200">
              <div className="flex justify-between items-center mb-4 sticky top-0 bg-white z-20 py-2 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => setMode('summary')}
                  className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm font-medium px-2 py-1 hover:bg-slate-50 rounded transition-colors"
                >
                  <ArrowRight size={16} /> חזרה לסיכום
                </button>
                <div className="text-sm font-bold text-slate-700">עריכת שורות מדידה</div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  תיאור הדף / סעיף
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-slate-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <table className="w-full text-sm text-right border-collapse">
                <thead className="bg-slate-100 text-slate-600 sticky top-12 z-10">
                  <tr>
                    <th className="p-2 border border-slate-200 w-16 text-center">#</th>
                    <th className="p-2 border border-slate-200">תיאור / מיקום</th>
                    <th className="p-2 border border-slate-200 w-24 text-center">כמות</th>
                    <th className="p-2 border border-slate-200 w-16 text-center">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-2 border border-slate-200 text-center">
                        <input
                          type="text"
                          value={entry.index}
                          onChange={(e) => handleUpdateRow(entry.id, 'index', e.target.value)}
                          className="w-full text-center bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1"
                        />
                      </td>
                      <td className="p-2 border border-slate-200">
                        <input
                          type="text"
                          value={entry.description}
                          onChange={(e) => handleUpdateRow(entry.id, 'description', e.target.value)}
                          className="w-full bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1"
                          placeholder="תיאור השורה..."
                        />
                      </td>
                      <td className="p-2 border border-slate-200">
                        <input
                          type="number"
                          value={entry.quantity}
                          onChange={(e) =>
                            handleUpdateRow(entry.id, 'quantity', parseFloat(e.target.value))
                          }
                          className="w-full text-center font-mono font-bold bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1"
                        />
                      </td>
                      <td className="p-2 border border-slate-200 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(entry.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400">
                        אין שורות חישוב. לחץ על "הוסף שורה" כדי להתחיל.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center rounded-b-lg">
          {mode === 'details' ? (
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded font-medium transition-colors"
            >
              <Plus size={16} /> הוסף שורה
            </button>
          ) : (
            <div></div> // Spacer
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-medium transition-colors"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded font-medium transition-colors shadow-sm"
            >
              שמור ועדכן
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const BillingView: React.FC<BillingViewProps> = ({
  bills,
  onUpdateBills,
  boqItems,
  onUpdateBoq,
  projectData,
  exceptionsCalculations = [],
  approvedBills = [],
  onUpdateApprovedBills,
  quantityPages = [],
  onUpdateQuantityPages,
  currentUser,
}) => {
  const dialog = useAppDialog();
  const [viewMode, setViewMode] = useState<'dashboard' | 'editor'>('dashboard');
  const [dashboardTab, setDashboardTab] = useState<'submitted' | 'approved' | 'estimate'>(
    'submitted'
  );
  const [selectedEstimatePage, setSelectedEstimatePage] = useState<QuantityPage | null>(null);
  const [activeBill, setActiveBill] = useState<Bill | null>(null);
  const [config, setConfig] = useState<BillingStyleConfig>(DEFAULT_BILLING_CONFIG);

  // Derive effective bill status: cross-reference with approvedBills
  const approvedBillNumbers = useMemo(
    () => new Set(approvedBills.map((ab) => ab.billNumber)),
    [approvedBills]
  );
  const getEffectiveStatus = (bill: { number: number; status: string }) =>
    approvedBillNumbers.has(bill.number) ? 'approved' : bill.status;

  // Modals State
  const [selectedItem, setSelectedItem] = useState<BillItem | null>(null);
  const [isBoqModalOpen, setIsBoqModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [boqSearch, setBoqSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const approvedBillsFileRef = useRef<HTMLInputElement>(null);

  // Print Configuration State
  const [printOptions, setPrintOptions] = useState({
    summary: true,
    measurements: false,
  });

  // Context Menu State (for quantity pages)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    page: QuantityPage;
  } | null>(null);
  const [editingPage, setEditingPage] = useState<QuantityPage | null>(null);
  const [viewingCalcPage, setViewingCalcPage] = useState<QuantityPage | null>(null);

  // Bill Context Menu State (for right-click on bill rows)
  const [billContextMenu, setBillContextMenu] = useState<{
    x: number;
    y: number;
    bill: Bill;
  } | null>(null);

  // Revision viewer state (read-only preview of a saved revision)
  const [viewingRevision, setViewingRevision] = useState<{
    bill: Bill;
    revision: BillRevision;
    revisionIndex: number;
  } | null>(null);

  // Bill approval flow state
  const [approvalPickerOpen, setApprovalPickerOpen] = useState(false);
  const [approvingBill, setApprovingBill] = useState<Bill | null>(null);
  const [approvedQuantities, setApprovedQuantities] = useState<Record<string, number>>({});

  // Close context menus on click outside
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setBillContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, page: QuantityPage) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, page });
  };

  const handleDeletePage = async () => {
    if (!contextMenu) return;
    if (await dialog.confirm('האם אתה בטוח שברצונך למחוק דף זה?')) {
      const updatedPages = quantityPages.filter((p) => p.id !== contextMenu.page.id);
      onUpdateQuantityPages?.(updatedPages);
    }
    setContextMenu(null);
  };

  const handleEditPage = () => {
    if (!contextMenu) return;
    setEditingPage(contextMenu.page);
    setContextMenu(null);
  };

  // Bill right-click context menu handler
  const handleBillContextMenu = (e: React.MouseEvent, bill: Bill) => {
    e.preventDefault();
    setBillContextMenu({ x: e.clientX, y: e.clientY, bill });
  };

  const handleDeleteBill = async () => {
    if (!billContextMenu) return;
    const bill = billContextMenu.bill;
    if (await dialog.confirm(`האם למחוק את חשבון #${bill.number}?`)) {
      onUpdateBills(bills.filter((b) => b.id !== bill.id));
    }
    setBillContextMenu(null);
  };

  // Duplicate a revision as a new draft bill
  const handleDuplicateRevision = (bill: Bill, revision: BillRevision) => {
    const sortedBills = [...bills].sort((a, b) => b.number - a.number);
    const newBillNumber = (sortedBills[0]?.number || 0) + 1;
    const now = new Date();

    const newBill: Bill = {
      id: `b-${Date.now()}`,
      number: newBillNumber,
      date: now.toISOString().split('T')[0],
      period: `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`,
      items: JSON.parse(JSON.stringify(revision.items)),
      cumulativeAmount: revision.cumulativeAmount,
      previousCumulativeAmount: revision.previousCumulativeAmount,
      currentAmount: revision.currentAmount,
      status: 'draft',
      notes: `שוכפל מגרסה ${bill.number} (${new Date(revision.savedAt).toLocaleDateString('he-IL')})`,
    };

    const updatedBills = [newBill, ...bills];
    onUpdateBills(updatedBills);
    setActiveBill(newBill);
    setViewMode('editor');
    setBillContextMenu(null);
    setViewingRevision(null);
    dialog.alert(`חשבון חדש #${newBillNumber} נוצר מגרסה שמורה`);
  };

  const handleSaveEditedPage = (updatedPage: QuantityPage) => {
    const updatedPages = quantityPages.map((p) => (p.id === updatedPage.id ? updatedPage : p));
    onUpdateQuantityPages?.(updatedPages);
    setEditingPage(null);
  };

  const handleSaveCalcPage = (updatedPage: QuantityPage) => {
    const updatedPages = quantityPages.map((p) => (p.id === updatedPage.id ? updatedPage : p));
    onUpdateQuantityPages?.(updatedPages);
    setViewingCalcPage(null);
  };

  // Helper to map bill number to its period string
  const billPeriodsMap = useMemo(() => {
    return bills.reduce(
      (acc, bill) => {
        acc[bill.number] = bill.period;
        return acc;
      },
      {} as Record<number, string>
    );
  }, [bills]);

  // Combine BOQ items with exception items for selection
  const combinedBoqItems = useMemo(() => {
    // Convert exception items to BOQ format
    const exceptionAsBoq: BOQItem[] = exceptionsCalculations
      .filter((e) => e.isCustom && !e.isIgnored && e.priceLineItems && e.priceLineItems.length > 0)
      .map((e) => ({
        code: e.customItemNumber || e.itemId || '',
        description: (e.customDescription || '').split(' | ')[0] || 'חריג',
        unit: e.customUnit || 'יחידה',
        contractQuantity: e.excessQuantity || 1,
        unitPrice: e.newUnitPrice || 0,
        type: 'item' as const,
        isException: true, // Flag to identify exception items
      }));

    return [...boqItems, ...exceptionAsBoq];
  }, [boqItems, exceptionsCalculations]);

  // Helper function to get discount rate for an item based on project settings
  const getDiscountForItem = (itemCode: string): number => {
    if (projectData.discountType === 'per_chapter') {
      // Extract chapter code (column B = second part of code XX.BB.XX.XX)
      const parts = itemCode.split('.');
      const chapterCode = parts.length >= 2 ? parts[1] : '';
      return (projectData.chapterDiscounts?.[chapterCode] || 0) / 100;
    }
    // Global discount
    return (projectData.discountRate || 0) / 100;
  };

  const handlePrintAction = () => {
    setIsPrintModalOpen(false);
    // Small timeout to allow modal to close before print dialog freezes UI
    setTimeout(() => window.print(), 100);
  };

  const handleExportExcel = () => {
    if (!activeBill) return;
    exportStyledExcel(activeBill, projectData, printOptions);
  };

  // --- ACTIONS ---

  // New function to update bill metadata (like period)
  const handleUpdateBillMetadata = (field: keyof Bill, value: any) => {
    if (!activeBill) return;
    const updatedBill = { ...activeBill, [field]: value };
    setActiveBill(updatedBill);
    onUpdateBills(bills.map((b) => (b.id === activeBill.id ? updatedBill : b)));
  };

  const handleCreateBill = () => {
    const sortedBills = [...bills].sort((a, b) => b.number - a.number);
    const lastBill = sortedBills.length > 0 ? sortedBills[0] : null;
    const newBillNumber = (lastBill?.number || 0) + 1;

    // Deep copy items
    let newItems: BillItem[] = [];
    if (lastBill) {
      newItems = lastBill.items.map((item) => ({
        ...item,
        measurements: item.measurements.map((m) => ({ ...m })),
      }));
    }

    // Calculate default period (Current Month/Year)
    const now = new Date();
    const defaultPeriod = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

    const newBill: Bill = {
      id: `b-${Date.now()}`,
      number: newBillNumber,
      date: now.toISOString().split('T')[0],
      period: defaultPeriod, // Set default period
      items: newItems,
      cumulativeAmount: lastBill ? lastBill.cumulativeAmount : 0,
      previousCumulativeAmount: lastBill ? lastBill.cumulativeAmount : 0,
      currentAmount: 0,
      status: 'draft',
    };

    // Update items quantities logic
    newBill.items = newBill.items.map((item) => {
      const prevQty = item.measurements
        .filter((m) => (m.billNumber || 0) < newBillNumber)
        .reduce((sum, m) => sum + (m.total ?? 0), 0);

      const totalQty = item.measurements.reduce((sum, m) => sum + (m.total ?? 0), 0);
      const discountRate = getDiscountForItem(item.code);

      return {
        ...item,
        previousQuantity: prevQty,
        currentQuantity: totalQty,
        discount: discountRate,
        totalAmount: totalQty * item.unitPrice * (1 - discountRate),
      };
    });

    const updatedBills = [newBill, ...bills];
    onUpdateBills(updatedBills); // PERSIST TO PARENT
    setActiveBill(newBill);
    setViewMode('editor');
  };

  const handleEditBill = async (bill: Bill) => {
    // If bill was submitted/approved, save a revision before opening for editing
    if (bill.status === 'submitted' || bill.status === 'approved') {
      const confirmed = await dialog.confirm(
        `חשבון #${bill.number} הוגש. האם לפתוח אותו לעריכה?\nהגרסה הנוכחית תישמר בהיסטוריית הגרסאות.`
      );
      if (!confirmed) return;

      const revision = {
        id: `rev-${Date.now()}`,
        savedAt: new Date().toISOString(),
        savedBy: currentUser
          ? {
              userId: currentUser.id,
              userName: currentUser.name,
              userRole: currentUser.role,
            }
          : undefined,
        status: bill.status,
        items: JSON.parse(JSON.stringify(bill.items)),
        cumulativeAmount: bill.cumulativeAmount,
        previousCumulativeAmount: bill.previousCumulativeAmount,
        currentAmount: bill.currentAmount,
        notes: bill.notes,
      };

      const reopened = {
        ...bill,
        status: 'draft' as const,
        revisions: [...(bill.revisions || []), revision],
      };

      // Persist the reopened bill with revision
      const updatedBills = bills.map((b) => (b.id === bill.id ? reopened : b));
      onUpdateBills(updatedBills);
      setActiveBill(reopened);
    } else {
      setActiveBill(bill);
    }
    setViewMode('editor');
  };

  const handleSaveBill = (status: 'draft' | 'submitted') => {
    if (!activeBill) return;

    // Recalculate Totals before saving
    // 1. Sum up all items totalAmount (which is Quantity * Price) -> This is the New Cumulative
    const totalCumulative = activeBill.items.reduce(
      (sum, item) => sum + (item.totalAmount || 0),
      0
    );

    // 2. Calculate the specific amount for THIS bill (New Cumulative - Previous Cumulative)
    const currentBillAmount = totalCumulative - (activeBill.previousCumulativeAmount || 0);

    const updatedBill = {
      ...activeBill,
      status,
      cumulativeAmount: totalCumulative,
      currentAmount: currentBillAmount,
    };

    // Update the main bills array
    const updatedBills = bills.map((b) => (b.id === activeBill.id ? updatedBill : b));
    onUpdateBills(updatedBills); // PERSIST TO PARENT

    dialog.alert(status === 'submitted' ? 'החשבון הוגש בהצלחה!' : 'החשבון נשמר כטיוטה');

    // Clear active bill and go back to dashboard
    setActiveBill(null);
    setViewMode('dashboard');
  };

  // --- ROBUST BOQ FILE IMPORT ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;

      try {
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const newItems: BOQItem[] = [];

        jsonData.forEach((row, index) => {
          if (row.length === 0) return;
          const getVal = (idx: number) => {
            const val = row[idx];
            return val !== undefined && val !== null ? String(val).trim() : '';
          };

          // Construct Code: A.B.C.D
          const p1 = getVal(0); // Structure
          const p2 = getVal(1); // Chapter
          const p3 = getVal(2); // Sub-Chapter
          const p4 = getVal(3); // Item ID

          // We need at least an Item ID or a full structure
          if (!p4 && !p1 && !p2 && !p3) return;

          // Clean dots
          const clean = (s: string) => s.replace(/\.$/, '');

          let fullCode = clean(p4);
          if (p1 || p2 || p3) {
            fullCode = `${clean(p1)}.${clean(p2)}.${clean(p3)}.${clean(p4)}`;
            fullCode = fullCode.replace(/^\.+/, '');
          }

          // Heuristic: Check if price/qty look like numbers to avoid headers
          const qtyCheck = parseFloat(getVal(6).replace(/,/g, ''));
          if (isNaN(qtyCheck) && index < 5) return;

          newItems.push({
            code: fullCode || `item-${index}`,
            description: getVal(4) || 'ללא תיאור',
            unit: getVal(5) || "יח'",
            contractQuantity: parseFloat(getVal(6).replace(/,/g, '')) || 0,
            unitPrice: parseFloat(getVal(7).replace(/,/g, '')) || 0,
          });
        });

        if (newItems.length > 0) {
          const existingCodes = new Set(boqItems.map((i) => i.code));
          const filteredNewItems = newItems.filter((i) => !existingCodes.has(i.code));

          // Update Global BOQ
          const updatedBoq = [...boqItems, ...filteredNewItems].sort((a, b) =>
            a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
          );
          onUpdateBoq(updatedBoq);
          dialog.alert(`נטענו בהצלחה ${filteredNewItems.length} סעיפים.`);
        } else {
          dialog.alert(
            "לא זוהו סעיפים תקינים בקובץ. וודא פורמט עמודות: A-D (קוד), E (תיאור), F (יח'), G (כמות), H (מחיר)."
          );
        }
      } catch (err) {
        console.error(err);
        dialog.alert('שגיאה בעיבוד הקובץ.');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // --- EDITOR LOGIC ---

  const tableData = useMemo(() => {
    if (!activeBill) return [];
    // SORTING LOGIC UPDATE: Use numeric: true for Excel-like sorting
    const items = [...activeBill.items].sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
    );
    const rows: any[] = [];

    let curStruct = '';
    let curChapter = '';
    let curSubchap = '';

    let sumSubK = 0;
    let sumChapK = 0;
    let sumStructK = 0;
    let totalK = 0;

    const pushSummary = (
      title: string,
      amount: number,
      type: 'subchapter' | 'chapter' | 'structure'
    ) => {
      rows.push({ isSummary: true, type, description: title, totalAmount: amount });
    };

    items.forEach((item) => {
      const parts = item.code.split('.');
      const struct = parts[0] || '';
      const chapter = parts[1] || '';
      const subchap = parts[2] || '';

      if (struct !== curStruct) {
        if (curStruct !== '') {
          pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
          pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
          pushSummary(`סך הכל מבנה ${curStruct}`, sumStructK, 'structure');
        }
        curStruct = struct;
        curChapter = '';
        curSubchap = '';
        sumStructK = 0;
        sumChapK = 0;
        sumSubK = 0;
        rows.push({ isHeader: true, type: 'structure', description: `מבנה ${struct}` });
      }

      if (chapter !== curChapter) {
        if (curChapter !== '') {
          pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
          pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
        }
        curChapter = chapter;
        curSubchap = '';
        sumChapK = 0;
        sumSubK = 0;
        rows.push({ isHeader: true, type: 'chapter', description: `פרק ${chapter}` });
      }

      if (subchap !== curSubchap) {
        if (curSubchap !== '') {
          pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
        }
        curSubchap = subchap;
        sumSubK = 0;
        rows.push({ isHeader: true, type: 'subchapter', description: `תת-פרק ${subchap}` });
      }

      rows.push({ ...item, isItem: true });
      sumSubK += item.totalAmount;
      sumChapK += item.totalAmount;
      sumStructK += item.totalAmount;
      totalK += item.totalAmount;
    });

    if (curStruct !== '') {
      pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
      pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
      pushSummary(`סך הכל מבנה ${curStruct}`, sumStructK, 'structure');
    }

    rows.push({
      isSummary: true,
      type: 'total',
      description: 'סך הכל לחשבון מצטבר',
      totalAmount: totalK,
    });

    return rows;
  }, [activeBill]);

  const estimateTableData = useMemo(() => {
    if (!quantityPages || quantityPages.length === 0) return [];
    // Sort by BOQ code
    const sortedPages = [...quantityPages].sort((a, b) => {
      const codeA = a.boqCode || '';
      const codeB = b.boqCode || '';
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    });

    const rows: any[] = [];
    let curStruct = '';
    let curChapter = '';
    let curSubchap = '';

    let sumSubK = 0;
    let sumChapK = 0;
    let sumStructK = 0;
    let totalK = 0;

    const pushSummary = (
      title: string,
      amount: number,
      type: 'subchapter' | 'chapter' | 'structure'
    ) => {
      rows.push({ isSummary: true, type, description: title, totalAmount: amount });
    };

    sortedPages.forEach((page) => {
      const boqItem = boqItems.find((b) => b.code === page.boqCode);
      const price =
        page.customUnitPrice !== undefined ? page.customUnitPrice : boqItem?.unitPrice || 0;
      const discountRate = getDiscountForItem(page.boqCode || '');

      // Calculate totalQuantity from entries if not set (backwards compatibility)
      const quantity =
        page.totalQuantity ?? page.entries?.reduce((sum, e) => sum + (e.quantity || 0), 0) ?? 0;
      const total = quantity * price * (1 - discountRate);

      const parts = (page.boqCode || '').split('.');
      const struct = parts[0] || '';
      const chapter = parts[1] || '';
      const subchap = parts[2] || '';

      if (struct !== curStruct) {
        if (curStruct !== '') {
          pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
          pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
          pushSummary(`סך הכל מבנה ${curStruct}`, sumStructK, 'structure');
        }
        curStruct = struct;
        curChapter = '';
        curSubchap = '';
        sumStructK = 0;
        sumChapK = 0;
        sumSubK = 0;
        rows.push({ isHeader: true, type: 'structure', description: `מבנה ${struct}` });
      }

      if (chapter !== curChapter) {
        if (curChapter !== '') {
          pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
          pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
        }
        curChapter = chapter;
        curSubchap = '';
        sumChapK = 0;
        sumSubK = 0;
        rows.push({ isHeader: true, type: 'chapter', description: `פרק ${chapter}` });
      }

      if (subchap !== curSubchap) {
        if (curSubchap !== '') {
          pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
        }
        curSubchap = subchap;
        sumSubK = 0;
        rows.push({ isHeader: true, type: 'subchapter', description: `תת-פרק ${subchap}` });
      }

      rows.push({
        ...page,
        isItem: true,
        code: page.boqCode,
        description: page.boqDescription || page.customTitle,
        contractQuantity: boqItem?.contractQuantity || 0,
        unitPrice: price,
        previousQuantity: 0,
        currentQuantity: quantity,
        discount: discountRate,
        totalAmount: total,
      });

      sumSubK += total;
      sumChapK += total;
      sumStructK += total;
      totalK += total;
    });

    if (curStruct !== '') {
      pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
      pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
      pushSummary(`סך הכל מבנה ${curStruct}`, sumStructK, 'structure');
    }

    rows.push({
      isSummary: true,
      type: 'total',
      description: 'סך הכל לאומדן',
      totalAmount: totalK,
    });

    return rows;
  }, [quantityPages, boqItems]);

  const handleAddItem = (boqItem: BOQItem) => {
    if (!activeBill) return;
    if (activeBill.items.find((i) => i.code === boqItem.code)) {
      dialog.alert('פריט זה כבר קיים בחשבון');
      return;
    }

    const discountRate = getDiscountForItem(boqItem.code);
    const newItem: BillItem = {
      id: `bi-${Date.now()}`,
      code: boqItem.code,
      description: boqItem.description,
      unit: boqItem.unit,
      contractQuantity: boqItem.contractQuantity,
      unitPrice: boqItem.unitPrice,
      previousQuantity: 0,
      currentQuantity: 0,
      discount: discountRate,
      totalAmount: 0,
      measurements: [],
    };

    const updatedBill = { ...activeBill, items: [...activeBill.items, newItem] };
    setActiveBill(updatedBill);
    onUpdateBills(bills.map((b) => (b.id === activeBill.id ? updatedBill : b)));

    // CLOSE BOQ MODAL AND OPEN MEASUREMENT SHEET AUTOMATICALLY
    setIsBoqModalOpen(false);
    setSelectedItem(newItem);
  };

  const handleUpdateMeasurements = (itemId: string, measurements: MeasurementRow[]) => {
    if (!activeBill) return;

    const totalQty = measurements.reduce((sum, m) => sum + (m.total ?? 0), 0);
    const prevQty = measurements
      .filter((m) => (m.billNumber || 0) < activeBill.number)
      .reduce((sum, m) => sum + (m.total ?? 0), 0);

    const updatedItems = activeBill.items.map((item) => {
      if (item.id === itemId) {
        const discountRate = getDiscountForItem(item.code);
        return {
          ...item,
          measurements,
          previousQuantity: prevQty,
          currentQuantity: totalQty,
          discount: discountRate,
          totalAmount: totalQty * item.unitPrice * (1 - discountRate),
        };
      }
      return item;
    });

    const updatedBill = { ...activeBill, items: updatedItems };
    setActiveBill(updatedBill);
    onUpdateBills(bills.map((b) => (b.id === activeBill.id ? updatedBill : b)));
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 2,
    }).format(val);

  const getRowStyle = (row: any) => {
    if (row.isHeader) {
      switch (row.type) {
        case 'structure':
          return {
            backgroundColor: config.structureBg,
            color: config.structureText,
            fontWeight: 'bold',
          };
        case 'chapter':
          return {
            backgroundColor: config.chapterBg,
            color: config.chapterText,
            fontWeight: 'bold',
          };
        case 'subchapter':
          return {
            backgroundColor: config.subChapterBg,
            color: config.subChapterText,
            fontWeight: 'bold',
          };
      }
    }
    if (row.isSummary) {
      switch (row.type) {
        case 'subchapter':
          return {
            backgroundColor: config.summarySubChapterBg,
            color: '#0f172a',
            fontWeight: 'bold',
            borderTop: '1px solid #cbd5e1',
          };
        case 'chapter':
          return {
            backgroundColor: config.summaryChapterBg,
            color: '#0f172a',
            fontWeight: 'bold',
            borderTop: '2px solid #94a3b8',
          };
        case 'structure':
          return {
            backgroundColor: config.summaryStructureBg,
            color: '#0f172a',
            fontWeight: 'bold',
            borderTop: '2px solid #64748b',
          };
        case 'total':
          return {
            backgroundColor: config.summaryTotalBg,
            color: '#0f172a',
            fontWeight: '900',
            fontSize: '1.1em',
            borderTop: '4px double #334155',
          };
      }
    }
    return { backgroundColor: '#fff', color: '#1e293b' };
  };

  // --- RENDER VIEWS ---

  if (viewMode === 'dashboard') {
    // Handler for approved bills file upload (Excel or CSV - single bill with chapter breakdown)
    const handleApprovedBillsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const billNumber = await dialog.prompt('מספר חשבון מאושר:');
      if (!billNumber || isNaN(parseInt(billNumber))) {
        if (billNumber !== null) await dialog.alert('יש להזין מספר חשבון תקין');
        e.target.value = '';
        return;
      }

      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

      if (isExcel) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const wsname = workbook.SheetNames[0];
            const ws = workbook.Sheets[wsname];
            // Read with header 'A' to get columns by letter, skip header row
            const jsonData = XLSX.utils.sheet_to_json(ws, { header: 'A', range: 1 }) as any[];

            let totalContractAmount = 0;
            let totalExceptionalAmount = 0;
            let currentDiscount = 0;
            const chapterBreakdown: { [chapter: string]: number } = {};

            jsonData.forEach((row: any) => {
              // Check for discount in column K
              if (row['K'] !== undefined && row['K'] !== null && row['K'] !== '') {
                const rawDiscount = parseFloat(row['K']);
                currentDiscount = rawDiscount > 1 ? rawDiscount / 100 : rawDiscount;
              }

              const qty = parseFloat(row['H'] || 0);
              let percent = parseFloat(row['I'] || 0);
              if (percent > 1) percent = percent / 100;
              const price = parseFloat(row['J'] || 0);

              if (qty && price) {
                const netPrice = price * (1 - currentDiscount);
                const total = qty * percent * netPrice;

                const structure = String(row['A'] || '');
                const chapter = String(row['B'] || '');

                // Check if exceptional (contains '99')
                if (structure.includes('99') || chapter.includes('99')) {
                  totalExceptionalAmount += total;
                } else {
                  totalContractAmount += total;
                }

                const chapterKey = chapter || 'כללי';
                chapterBreakdown[chapterKey] = (chapterBreakdown[chapterKey] || 0) + total;
              }
            });

            const totalApprovedAmount = totalContractAmount + totalExceptionalAmount;

            if (totalApprovedAmount > 0) {
              const newBill: ApprovedBill = {
                billNumber: parseInt(billNumber),
                approvedAmount: totalApprovedAmount,
                contractAmount: totalContractAmount,
                exceptionalAmount: totalExceptionalAmount,
                approvalDate: new Date().toISOString().split('T')[0],
                notes: `נטען מקובץ: ${file.name}`,
                chapterBreakdown,
              };

              if (onUpdateApprovedBills) {
                onUpdateApprovedBills([...approvedBills, newBill]);
                dialog.alert(
                  `חשבון #${billNumber} נטען בהצלחה!\nסה"כ חוזי: ${totalContractAmount.toLocaleString('he-IL')} ₪\nסה"כ חריגים: ${totalExceptionalAmount.toLocaleString('he-IL')} ₪\nסה"כ: ${totalApprovedAmount.toLocaleString('he-IL')} ₪`
                );
              }
            } else {
              dialog.alert(
                'לא נמצאו נתונים תקינים בקובץ.\nוודא שהפורמט: A=מבנה, B=פרק, H=כמות, I=אחוז, J=מחיר, K=הנחה'
              );
            }
          } catch (err) {
            dialog.alert('שגיאה בקריאת קובץ Excel');
            console.error(err);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        // CSV - same logic
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const text = event.target?.result as string;
            const lines = text.split('\n').filter((l) => l.trim());

            let contractTotal = 0;
            const chapterBreakdown: { [chapter: string]: number } = {};

            for (let i = 0; i < lines.length; i++) {
              const cols = lines[i].split(',').map((c) => c.trim());
              if (cols.length >= 2) {
                const chapter = cols[0];
                const amount = parseFloat(cols[1].replace(/[₪,]/g, '')) || 0;

                if (chapter && amount !== 0) {
                  chapterBreakdown[chapter] = (chapterBreakdown[chapter] || 0) + amount;
                  contractTotal += amount;
                }
              }
            }

            if (contractTotal > 0) {
              const newBill: ApprovedBill = {
                billNumber: parseInt(billNumber),
                approvedAmount: contractTotal,
                contractAmount: contractTotal,
                approvalDate: new Date().toISOString().split('T')[0],
                notes: `נטען מקובץ: ${file.name}`,
                chapterBreakdown,
              };

              if (onUpdateApprovedBills) {
                onUpdateApprovedBills([...approvedBills, newBill]);
                dialog.alert(
                  `חשבון #${billNumber} נטען בהצלחה!\nסה"כ: ${contractTotal.toLocaleString('he-IL')} ₪`
                );
              }
            } else {
              dialog.alert('לא נמצאו נתונים תקינים בקובץ');
            }
          } catch (err) {
            dialog.alert('שגיאה בקריאת הקובץ');
          }
        };
        reader.readAsText(file);
      }
      e.target.value = '';
    };

    return (
      <div className="animate-in fade-in duration-500 min-w-0 print:hidden">
        {/* Dashboard Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">מעקב חשבונות קבלן</h2>
            <p className="text-sm text-slate-500">ניהול חשבונות, אישורים ואומדן לגמר</p>
          </div>
          {dashboardTab === 'submitted' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition shadow-sm"
              >
                <Settings size={18} /> הגדרות
              </button>
              <button
                type="button"
                onClick={handleCreateBill}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-sm font-medium"
              >
                <Plus size={18} /> חשבון חדש
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setDashboardTab('submitted')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition ${
              dashboardTab === 'submitted'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <Send size={16} className="inline ml-2" />
            חשבונות מוגשים ({bills.length})
          </button>
          <button
            type="button"
            onClick={() => setDashboardTab('approved')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition ${
              dashboardTab === 'approved'
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <CheckCircle size={16} className="inline ml-2" />
            חשבונות מאושרים ({approvedBills.length})
          </button>
          <button
            type="button"
            onClick={() => setDashboardTab('estimate')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition ${
              dashboardTab === 'estimate'
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <Calculator size={16} className="inline ml-2" />
            אומדן לגמר
          </button>
        </div>

        {/* Tab Content */}
        {dashboardTab === 'submitted' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-100">
                <tr>
                  <th className="p-4 font-semibold">מס' חשבון</th>
                  <th className="p-4 font-semibold">תקופה</th>
                  <th className="p-4 font-semibold">תאריך</th>
                  <th className="p-4 font-semibold">סכום לתשלום</th>
                  <th className="p-4 font-semibold">סטטוס</th>
                  <th className="p-4 font-semibold">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bills.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      <FileText size={32} className="mx-auto mb-2 opacity-50" />
                      <p>אין חשבונות מוגשים</p>
                    </td>
                  </tr>
                ) : (
                  bills.map((bill) => (
                    <tr
                      key={bill.id}
                      className="hover:bg-slate-50 transition cursor-pointer"
                      onClick={() => handleEditBill(bill)}
                      onContextMenu={(e) => handleBillContextMenu(e, bill)}
                    >
                      <td className="p-4 font-bold text-slate-800">#{bill.number}</td>
                      <td className="p-4">{bill.period}</td>
                      <td className="p-4 text-slate-500">{bill.date}</td>
                      <td className="p-4 font-medium text-blue-700">
                        {formatCurrency(bill.currentAmount)}
                      </td>
                      <td className="p-4">
                        {(() => {
                          const effectiveStatus = getEffectiveStatus(bill);
                          return (
                            <span
                              className={`px-2 py-1 rounded text-xs font-bold ${
                                effectiveStatus === 'approved'
                                  ? 'bg-green-100 text-green-700'
                                  : effectiveStatus === 'draft'
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-orange-100 text-orange-700'
                              }`}
                            >
                              {effectiveStatus === 'approved'
                                ? 'מאושר'
                                : effectiveStatus === 'draft'
                                  ? 'טיוטה'
                                  : 'הוגש'}
                            </span>
                          );
                        })()}
                        {(bill.revisions?.length ?? 0) > 0 && (
                          <span className="mr-2 text-blue-500 text-[10px]">
                            ({bill.revisions!.length} גרסאות)
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <button type="button" className="text-blue-600 hover:underline">
                          פתח/ערוך
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {dashboardTab === 'approved' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle size={20} className="text-green-600" />
                חשבונות מאושרים
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => approvedBillsFileRef.current?.click()}
                  className="flex items-center gap-2 bg-white border border-green-300 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 transition text-sm"
                >
                  <Upload size={16} /> טען מאקסל
                </button>
                <button
                  type="button"
                  onClick={() => setApprovalPickerOpen(true)}
                  className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition text-sm font-medium"
                >
                  <Plus size={16} /> אשר חשבון מוגש
                </button>
                {approvedBills.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (await dialog.confirm('האם למחוק את כל החשבונות המאושרים?')) {
                        if (onUpdateApprovedBills) {
                          onUpdateApprovedBills([]);
                        }
                      }
                    }}
                    className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition text-sm font-bold"
                  >
                    <Trash2 size={16} /> מחק הכל
                  </button>
                )}
              </div>
            </div>
            <input
              ref={approvedBillsFileRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={handleApprovedBillsUpload}
              className="hidden"
            />

            {approvedBills.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <CheckCircle size={40} className="mx-auto mb-3 opacity-50" />
                <p className="text-lg">אין חשבונות מאושרים</p>
                <p className="text-sm mt-1">
                  הוסף ידנית או טען מקובץ CSV (עמודות: מספר, סכום, תאריך, הערות)
                </p>
              </div>
            ) : (
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-3 font-semibold">מס' חשבון</th>
                    <th className="p-3 font-semibold">סכום מאושר</th>
                    <th className="p-3 font-semibold">תאריך אישור</th>
                    <th className="p-3 font-semibold">הערות</th>
                    <th className="p-3 font-semibold">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...approvedBills]
                    .sort((a, b) => a.billNumber - b.billNumber)
                    .map((ab) => (
                      <tr key={ab.billNumber} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-800">#{ab.billNumber}</td>
                        <td className="p-3 font-medium text-green-700">
                          {formatCurrency(ab.approvedAmount)}
                        </td>
                        <td className="p-3 text-slate-500">{ab.approvalDate}</td>
                        <td className="p-3 text-slate-500 text-xs">{ab.notes || '-'}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (await dialog.confirm(`למחוק חשבון מאושר #${ab.billNumber}?`)) {
                                if (onUpdateApprovedBills) {
                                  onUpdateApprovedBills(
                                    approvedBills.filter((x) => x.billNumber !== ab.billNumber)
                                  );
                                }
                              }
                            }}
                            className="text-red-500 hover:text-red-700 transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot className="bg-green-50 border-t-2 border-green-200">
                  <tr>
                    <td className="p-3 font-bold text-green-800">סה"כ מאושר</td>
                    <td className="p-3 font-bold text-green-700" colSpan={4}>
                      {formatCurrency(approvedBills.reduce((s, ab) => s + ab.approvedAmount, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {dashboardTab === 'estimate' && (
          <div
            className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
            style={{ height: 'calc(100vh - 280px)' }}
          >
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FolderTree size={22} className="text-purple-600" />
                אומדן לגמר
              </h3>
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500">{quantityPages.length} דפי חישוב</span>
                <span className="text-sm font-bold text-slate-700">
                  סה"כ:{' '}
                  {quantityPages
                    .reduce((sum, p) => sum + (p.totalQuantity ?? 0), 0)
                    .toLocaleString('he-IL')}{' '}
                  מ"א
                </span>
                {quantityPages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      // Print official bill format matching חשבון חלקי style
                      const printWindow = window.open('', '_blank');
                      if (!printWindow) return;

                      const projectName = projectData.projectName || 'פרויקט';
                      const contractNum = projectData.contractNumber || '00000';
                      const totalQty = quantityPages.reduce(
                        (s, p) => s + (p.totalQuantity ?? 0),
                        0
                      );

                      // Helper to get index range from entries (e.g., "L1-L61")
                      const getIndexRange = (entries: (typeof quantityPages)[0]['entries']) => {
                        if (entries.length === 0) return '-';
                        if (entries.length === 1) return entries[0].index;
                        return `${entries[0].index}-${entries[entries.length - 1].index}`;
                      };

                      let html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>עריכת חשבון #1</title>
                                            <style>
                                                * { box-sizing: border-box; margin: 0; padding: 0; }
                                                body { font-family: Arial, sans-serif; padding: 20px; font-size: 10px; }
                                                .header { text-align: center; margin-bottom: 10px; }
                                                .header h1 { font-size: 18px; color: #0d7377; margin: 5px 0; }
                                                .header p { font-size: 10px; color: #666; }
                                                table { width: 100%; border-collapse: collapse; }
                                                th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: right; }
                                                th { background: linear-gradient(180deg, #e3f2fd, #bbdefb); font-size: 9px; }
                                                .num { text-align: left; font-family: monospace; }
                                                .highlight { background: #fffde7; font-weight: bold; }
                                                .total-row { background: #e8f5e9; font-weight: bold; }
                                                .page-break { page-break-before: always; }
                                                .calc-sheet { margin-top: 30px; border: 1px solid #333; }
                                                .calc-header { background: #f5f5f5; padding: 10px; text-align: center; border-bottom: 1px solid #333; }
                                                .signatures { display: flex; justify-content: space-between; margin-top: 40px; font-size: 9px; }
                                                .sig-box { text-align: center; width: 30%; }
                                                .sig-line { border-bottom: 1px solid #000; height: 30px; margin-bottom: 5px; }
                                            </style></head><body>

                                            <div class="header">
                                                <h1>עריכת חשבון #1</h1>
                                                <p>פרויקט "${projectName}" - חוזה ${contractNum}</p>
                                                <p>תקופה: ${new Date().toLocaleDateString('he-IL')}</p>
                                            </div>

                                            <table>
                                                <thead><tr>
                                                    <th>קוד סעיף</th>
                                                    <th style="width:30%">תיאור סעיף</th>
                                                    <th>יח'</th>
                                                    <th class="num">כמות חוזה</th>
                                                    <th class="num">כמות קודם</th>
                                                    <th class="num">כמות זה</th>
                                                    <th class="num">מצטבר</th>
                                                    <th class="num">דפי ריכוז</th>
                                                </tr></thead>
                                                <tbody>`;

                      quantityPages.forEach((page) => {
                        const boqItem = boqItems.find((b) => b.code === page.boqCode);
                        html += `<tr>
                                                    <td>${page.boqCode || '-'}</td>
                                                    <td>${page.boqDescription || page.customTitle}</td>
                                                    <td>${page.unit}</td>
                                                    <td class="num">${boqItem?.contractQuantity?.toLocaleString() || '-'}</td>
                                                    <td class="num">0</td>
                                                    <td class="num highlight">${(page.totalQuantity ?? 0).toFixed(2)}</td>
                                                    <td class="num" style="color:#2e7d32;font-weight:bold">${(page.totalQuantity ?? 0).toFixed(2)}</td>
                                                    <td class="num">${page.pageNumber}</td>
                                                </tr>`;
                      });

                      html += `<tr class="total-row">
                                                <td colspan="5" style="text-align:left">סה"כ</td>
                                                <td class="num">${(totalQty ?? 0).toFixed(2)}</td>
                                                <td class="num">${(totalQty ?? 0).toFixed(2)}</td>
                                                <td></td>
                                            </tr></tbody></table>`;

                      // CALCULATION SHEETS - one per item with consolidated entry
                      quantityPages.forEach((page) => {
                        const indexRange = getIndexRange(page.entries);
                        html += `
                                                <div class="page-break calc-sheet">
                                                    <div class="calc-header">
                                                        <strong>פרויקט "${projectName}" - חוזה ${contractNum}</strong><br/>
                                                        <span style="font-size:12px;color:#1565c0;text-decoration:underline">ריכוז כמויות עבור סעיף מס': <u>${page.boqCode || 'ללא'}</u></span>
                                                    </div>
                                                    <table style="margin:0">
                                                        <tr><th>סעיף מס'</th><th colspan="3">תיאור הסעיף</th><th>יח'</th><th>כמות חוזה</th></tr>
                                                        <tr><td>${page.boqCode || '-'}</td><td colspan="3">${page.boqDescription || page.customTitle}</td><td>${page.unit}</td><td>-</td></tr>
                                                    </table>
                                                    <table style="margin-top:10px">
                                                        <thead><tr>
                                                            <th>מס' דף</th><th>תאור העבודה (מיקום/חישוב)</th><th class="num">כמות מחושבת</th><th class="num">%</th><th class="num">לשלם</th><th class="num">מצטברת</th>
                                                        </tr></thead>
                                                        <tbody>
                                                            <tr>
                                                                <td>1</td>
                                                                <td>${indexRange} | ${page.boqDescription || page.customTitle}</td>
                                                                <td class="num">${(page.totalQuantity ?? 0).toFixed(2)}</td>
                                                                <td class="num">100%</td>
                                                                <td class="num highlight">${(page.totalQuantity ?? 0).toFixed(2)}</td>
                                                                <td class="num">${(page.totalQuantity ?? 0).toFixed(2)}</td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                    <div style="background:#e8f5e9;padding:8px;text-align:center;font-weight:bold;border:1px solid #ccc;margin-top:10px">
                                                        סה"כ כמות מצטברת לחשבון זה (מוגש): ${(page.totalQuantity ?? 0).toFixed(2)}
                                                    </div>
                                                    <div class="signatures">
                                                        <div class="sig-box"><div class="sig-line"></div>חתימת המודד/קבלן:<br/>שם:______</div>
                                                        <div class="sig-box"><strong>חותמת הפרויקט</strong></div>
                                                        <div class="sig-box"><div class="sig-line"></div>אישור המפקח/מזמין:<br/>תאריך:______</div>
                                                    </div>
                                                </div>`;
                      });

                      html += '</body></html>';
                      printWindow.document.write(html);
                      printWindow.document.close();
                      printWindow.print();
                    }}
                    className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition text-sm shadow-sm"
                  >
                    <Printer size={14} /> הדפס חשבון
                  </button>
                )}
              </div>
            </div>

            {quantityPages.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Calculator size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">אין עדיין דפי חישוב</p>
                <p className="text-sm">לחץ "שמור לאומדן" ממודול הצינורות או מודולים אחרים</p>
              </div>
            ) : (
              <div className="flex h-full bg-slate-50">
                {/* Sidebar - File Tree */}
                <div className="w-80 bg-white border-l border-slate-200 flex flex-col">
                  <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                      <Search
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={16}
                      />
                      <input
                        type="text"
                        placeholder="חפש סעיפים..."
                        className="w-full pr-9 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {/* Group pages by BOQ description */}
                    {Object.entries(
                      quantityPages.reduce(
                        (acc, page) => {
                          const key = page.boqDescription || page.customTitle || 'ללא שם';
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(page);
                          return acc;
                        },
                        {} as Record<string, typeof quantityPages>
                      )
                    ).map(([groupName, pages]: [string, any]) => (
                      <div key={groupName} className="mb-1">
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors group"
                        >
                          <Folder size={16} className="text-yellow-500 fill-yellow-500/20" />
                          <span className="truncate flex-1 text-right">{groupName}</span>
                          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full group-hover:bg-white">
                            {pages.length}
                          </span>
                        </button>
                        <div className="mr-6 mt-1 space-y-0.5 border-r border-slate-200 pr-2">
                          {pages.map((page: QuantityPage, idx: number) => (
                            <button
                              type="button"
                              key={idx}
                              onClick={() => setSelectedEstimatePage(page)}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors ${selectedEstimatePage === page ? 'bg-purple-50 text-purple-700 font-medium' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
                            >
                              <FileText size={14} />
                              <span className="truncate">דף חישוב {page.pageNumber}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 border-t border-slate-200 bg-slate-50">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">סה"כ סעיפים:</span>
                      <span className="font-bold text-slate-700">{quantityPages.length}</span>
                    </div>
                  </div>
                </div>

                {/* Main Content - Bill Editor Style */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex-1 overflow-auto p-6">
                    <div className="bg-white shadow-lg border border-slate-300 overflow-hidden rounded-lg mb-8">
                      <div className="overflow-x-auto">
                        <table className="w-full text-right border-collapse">
                          <thead className="bg-slate-100 text-slate-700 text-xs uppercase font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                              <th className="p-3 border border-slate-300 w-32 shrink-0">
                                קוד סעיף
                              </th>
                              <th className="p-3 border border-slate-300 min-w-[350px]">
                                תיאור סעיף
                              </th>
                              <th className="p-3 border border-slate-300 w-16 text-center shrink-0">
                                יח'
                              </th>
                              <th className="p-3 border border-slate-300 w-24 shrink-0">
                                כמות חוזה
                              </th>
                              <th className="p-3 border border-slate-300 w-24 bg-slate-200 shrink-0">
                                כמות קודמת
                              </th>
                              <th className="p-3 border border-slate-300 w-24 bg-blue-50 text-blue-800 shrink-0">
                                לחשבון זה
                              </th>
                              <th className="p-3 border border-slate-300 w-24 bg-green-50 text-green-800 font-bold border-l-4 border-l-green-400 shrink-0">
                                כמות מצטברת
                              </th>
                              <th className="p-3 border border-slate-300 w-24 shrink-0">
                                מחיר יח'
                              </th>
                              <th className="p-3 border border-slate-300 w-16 shrink-0">הנחה</th>
                              <th className="p-3 border border-slate-300 w-32 shrink-0">
                                סה"כ לתשלום
                              </th>
                              <th className="p-3 border border-slate-300 w-20 text-center shrink-0">
                                דפי ריכוז
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {estimateTableData.map((row, idx) => {
                              const style = getRowStyle(row);
                              return (
                                <tr
                                  key={idx}
                                  className="border-b border-slate-200 hover:brightness-95 transition cursor-context-menu"
                                  style={style}
                                  onContextMenu={(e) => row.isItem && handleContextMenu(e, row)}
                                >
                                  {row.isItem ? (
                                    <>
                                      <td className="p-2 border border-slate-200 font-mono text-xs font-semibold bg-white text-slate-800">
                                        {row.code || '-'}
                                      </td>
                                      <td className="p-2 border border-slate-200 font-medium bg-white text-slate-800 leading-snug">
                                        {row.description}
                                      </td>
                                      <td className="p-2 border border-slate-200 text-center bg-white text-slate-800">
                                        {row.unit}
                                      </td>
                                      <td className="p-2 border border-slate-200 bg-white text-slate-800">
                                        {row.contractQuantity?.toLocaleString() || '-'}
                                      </td>
                                      <td className="p-2 border border-slate-200 bg-slate-50 text-slate-500">
                                        0
                                      </td>
                                      <td className="p-2 border border-slate-200 bg-blue-50 font-bold text-blue-700">
                                        {(row.currentQuantity ?? 0).toFixed(2)}
                                      </td>
                                      <td className="p-2 border border-slate-200 bg-green-50 font-bold text-green-800 text-lg">
                                        {(row.currentQuantity ?? 0).toFixed(2)}
                                      </td>
                                      <td className="p-2 border border-slate-200 bg-white text-slate-800">
                                        {row.unitPrice?.toLocaleString() || 0}
                                      </td>
                                      <td className="p-2 border border-slate-200 text-red-500 bg-white">
                                        0%
                                      </td>
                                      <td className="p-2 border border-slate-200 font-bold bg-white text-slate-800">
                                        {formatCurrency(row.totalAmount || 0)}
                                      </td>
                                      <td className="p-2 border border-slate-200 text-center bg-white">
                                        <button
                                          type="button"
                                          onClick={() => setViewingCalcPage(row)}
                                          className="p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition border border-indigo-200 flex items-center gap-1 text-xs px-2 mx-auto"
                                          title="פתח דף חישוב כמויות"
                                        >
                                          <FileDigit size={16} />
                                          דף ריכוז
                                        </button>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td
                                        className="p-3 border border-white/20"
                                        colSpan={row.isSummary ? 9 : 11}
                                      >
                                        {row.description}
                                      </td>
                                      {row.isSummary && (
                                        <td
                                          className="p-3 border border-white/20 font-bold text-left pl-4"
                                          colSpan={2}
                                        >
                                          {formatCurrency(row.totalAmount || 0)}
                                        </td>
                                      )}
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed bg-white shadow-xl border border-slate-200 rounded-lg py-1 z-50 min-w-[150px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleEditPage}
              className="w-full text-right px-4 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
            >
              <Edit size={14} /> ערוך
            </button>
            <button
              type="button"
              onClick={handleDeletePage}
              className="w-full text-right px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"
            >
              <Trash2 size={14} /> מחק
            </button>
          </div>
        )}

        {/* Edit Modal */}
        {editingPage && (
          <EditPageModal
            page={editingPage}
            onSave={handleSaveEditedPage}
            onClose={() => setEditingPage(null)}
          />
        )}

        {/* Calc Page Modal */}
        {viewingCalcPage && (
          <CalcPageModal
            page={viewingCalcPage}
            onSave={handleSaveCalcPage}
            onClose={() => setViewingCalcPage(null)}
          />
        )}

        {/* Bill Right-Click Context Menu */}
        {billContextMenu && (
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[220px] animate-in fade-in zoom-in-95 duration-150"
            style={{ top: billContextMenu.y, left: billContextMenu.x }}
          >
            <div className="px-3 py-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">
                חשבון #{billContextMenu.bill.number}
              </span>
            </div>
            <button
              type="button"
              className="w-full text-right px-3 py-2 text-sm hover:bg-blue-50 text-blue-700 flex items-center gap-2"
              onClick={() => {
                handleEditBill(billContextMenu.bill);
                setBillContextMenu(null);
              }}
            >
              <Edit size={14} /> פתח לעריכה
            </button>
            {(billContextMenu.bill.revisions?.length ?? 0) > 0 ? (
              <div className="border-t border-slate-100">
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Clock size={12} /> היסטוריית גרסאות ({billContextMenu.bill.revisions!.length})
                </div>
                <div className="max-h-[250px] overflow-y-auto">
                  {billContextMenu.bill.revisions!.map((rev, idx) => (
                    <div key={rev.id} className="px-3 py-2 text-xs border-t border-slate-50">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-slate-700">גרסה {idx + 1}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            rev.status === 'submitted'
                              ? 'bg-amber-50 text-amber-700'
                              : rev.status === 'approved'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-slate-50 text-slate-600'
                          }`}
                        >
                          {rev.status === 'submitted'
                            ? 'הוגש'
                            : rev.status === 'approved'
                              ? 'אושר'
                              : 'טיוטה'}
                        </span>
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        {new Date(rev.savedAt).toLocaleDateString('he-IL')}{' '}
                        {new Date(rev.savedAt).toLocaleTimeString('he-IL', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {rev.savedBy && <span className="mr-2">• {rev.savedBy.userName}</span>}
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        סכום: {formatCurrency(rev.currentAmount)}
                      </div>
                      <div className="flex gap-1 mt-1.5">
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingRevision({
                              bill: billContextMenu.bill,
                              revision: rev,
                              revisionIndex: idx,
                            });
                            setBillContextMenu(null);
                          }}
                        >
                          <Eye size={11} /> צפה
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-green-50 text-green-700 hover:bg-green-100 transition"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateRevision(billContextMenu.bill, rev);
                          }}
                        >
                          <Copy size={11} /> שכפל לחשבון חדש
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100">
                <Clock size={12} className="inline ml-1" /> אין היסטוריית גרסאות
              </div>
            )}
            <div className="border-t border-slate-100">
              <button
                type="button"
                className="w-full text-right px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                onClick={handleDeleteBill}
              >
                <Trash2 size={14} /> מחק חשבון
              </button>
            </div>
          </div>
        )}

        {/* Settings Modal (also available from dashboard) */}
        {isSettingsOpen && (
          <BillingSettingsModal
            config={config}
            onSave={(c) => {
              setConfig(c);
              setIsSettingsOpen(false);
            }}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}

        {/* Revision Viewer Modal */}
        {viewingRevision && (
          <RevisionViewerModal
            bill={viewingRevision.bill}
            revision={viewingRevision.revision}
            revisionIndex={viewingRevision.revisionIndex}
            projectData={projectData}
            config={config}
            onDuplicate={() =>
              handleDuplicateRevision(viewingRevision.bill, viewingRevision.revision)
            }
            onClose={() => setViewingRevision(null)}
          />
        )}

        {/* Bill Approval Picker — choose a submitted bill to approve */}
        {approvalPickerOpen && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200"
            onClick={() => setApprovalPickerOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 text-white">
                <h3 className="text-lg font-bold">בחר חשבון מוגש לאישור</h3>
                <p className="text-green-100 text-sm">בחר חשבון מהרשימה כדי לסקור ולאשר כמויות</p>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                {bills.filter((b) => b.status === 'submitted' || b.status === 'draft').length ===
                0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Send size={32} className="mx-auto mb-2 opacity-50" />
                    <p>אין חשבונות מוגשים לאישור</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...bills]
                      .filter((b) => b.status === 'submitted' || b.status === 'draft')
                      .sort((a, b) => b.number - a.number)
                      .map((bill) => {
                        const alreadyApproved = approvedBills.some(
                          (ab) => ab.billNumber === bill.number
                        );
                        return (
                          <button
                            key={bill.id}
                            type="button"
                            onClick={() => {
                              // Pre-fill approved quantities with the submitted currentQuantity per item
                              const initial: Record<string, number> = {};
                              bill.items.forEach((item) => {
                                initial[item.id] = item.currentQuantity;
                              });
                              setApprovedQuantities(initial);
                              setApprovingBill(bill);
                              setApprovalPickerOpen(false);
                            }}
                            className={`w-full text-right p-4 rounded-xl border transition hover:shadow-md flex justify-between items-center ${alreadyApproved ? 'border-green-300 bg-green-50' : 'border-slate-200 hover:border-green-300'}`}
                          >
                            <div>
                              <span className="font-bold text-slate-800">חשבון #{bill.number}</span>
                              <span className="mr-2 text-sm text-slate-500">{bill.period}</span>
                              {alreadyApproved && (
                                <span className="mr-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">
                                  כבר אושר
                                </span>
                              )}
                              <span
                                className={`mr-2 px-2 py-0.5 rounded text-xs font-bold ${bill.status === 'submitted' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}
                              >
                                {bill.status === 'submitted' ? 'הוגש' : 'טיוטה'}
                              </span>
                            </div>
                            <div className="text-left">
                              <span className="text-sm font-bold text-blue-700">
                                {formatCurrency(bill.currentAmount)}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {bill.items.length} סעיפים
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
              <div className="border-t border-slate-200 px-6 py-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setApprovalPickerOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition text-sm"
                >
                  סגור
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bill Approval Flow — review and approve quantities per item */}
        {approvingBill && (
          <BillApprovalModal
            bill={approvingBill}
            approvedQuantities={approvedQuantities}
            setApprovedQuantities={setApprovedQuantities}
            config={config}
            onApprove={() => {
              // Calculate totals from approved quantities
              let totalContractAmount = 0;
              let totalExceptionalAmount = 0;
              const chapterBreakdown: { [chapter: string]: number } = {};

              approvingBill.items.forEach((item) => {
                const qty = approvedQuantities[item.id] ?? 0;
                const amount = qty * item.unitPrice;
                const parts = item.code.split('.');
                const structure = parts[0];
                const chapter = parts[1];

                if (structure === '99' || chapter === '99') {
                  totalExceptionalAmount += amount;
                } else {
                  totalContractAmount += amount;
                }

                const chapterKey = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
                chapterBreakdown[chapterKey] = (chapterBreakdown[chapterKey] || 0) + amount;
              });

              const newApproved: ApprovedBill = {
                billNumber: approvingBill.number,
                approvedAmount: totalContractAmount + totalExceptionalAmount,
                contractAmount: totalContractAmount,
                exceptionalAmount: totalExceptionalAmount,
                approvalDate: new Date().toISOString().split('T')[0],
                notes: `אושר מחשבון #${approvingBill.number}`,
                chapterBreakdown,
              };

              if (onUpdateApprovedBills) {
                // Replace existing approval for this bill number, or add new
                const existing = approvedBills.filter(
                  (ab) => ab.billNumber !== approvingBill.number
                );
                onUpdateApprovedBills([...existing, newApproved]);
              }

              // Update the bill status to 'approved'
              const updatedBills = bills.map((b) =>
                b.id === approvingBill.id ? { ...b, status: 'approved' as const } : b
              );
              onUpdateBills(updatedBills);

              setApprovingBill(null);
            }}
            onClose={() => setApprovingBill(null)}
          />
        )}
      </div>
    );
  }

  // --- EDITOR VIEW (Active Bill) ---
  return (
    <>
      <div className="animate-in fade-in duration-500 pb-20 min-w-0 print:hidden">
        {/* Hidden Input for BOQ Upload */}
        <input
          type="file"
          accept=".csv, .xlsx, .xls"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* EDITOR HEADER */}
        <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm sticky top-0 z-20 no-print">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setViewMode('dashboard')}
              className="p-2 hover:bg-slate-100 rounded-full transition"
            >
              <ArrowRight size={20} className="text-slate-600" />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">
                עריכת חשבון #{activeBill?.number}
              </h2>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="font-bold">תקופה:</span>
                <input
                  type="text"
                  value={activeBill?.period || ''}
                  onChange={(e) => handleUpdateBillMetadata('period', e.target.value)}
                  className="border border-slate-300 rounded px-2 py-0.5 w-24 text-center bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="MM/YYYY"
                />
                {(activeBill?.revisions?.length ?? 0) > 0 && (
                  <div className="relative group">
                    <span className="text-blue-600 text-xs bg-blue-50 px-2 py-0.5 rounded cursor-pointer hover:bg-blue-100 transition">
                      {activeBill!.revisions!.length} גרסאות שמורות
                    </span>
                    <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-3 z-50 min-w-[280px] hidden group-hover:block">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        היסטוריית גרסאות
                      </div>
                      {activeBill!.revisions!.map((rev, idx) => (
                        <div
                          key={rev.id}
                          className="text-xs text-slate-600 border-b border-slate-100 last:border-0 py-1.5"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium">גרסה {idx + 1}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                rev.status === 'submitted'
                                  ? 'bg-amber-50 text-amber-700'
                                  : rev.status === 'approved'
                                    ? 'bg-green-50 text-green-700'
                                    : 'bg-slate-50 text-slate-600'
                              }`}
                            >
                              {rev.status === 'submitted'
                                ? 'הוגש'
                                : rev.status === 'approved'
                                  ? 'אושר'
                                  : rev.status}
                            </span>
                          </div>
                          <div className="text-slate-400 mt-0.5">
                            {new Date(rev.savedAt).toLocaleDateString('he-IL')}{' '}
                            {new Date(rev.savedAt).toLocaleTimeString('he-IL', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          {rev.savedBy && (
                            <div className="text-slate-500 mt-0.5">
                              נשמר ע״י: {rev.savedBy.userName}{' '}
                              {rev.savedBy.userRole ? `(${rev.savedBy.userRole})` : ''}
                            </div>
                          )}
                          <div className="text-slate-400 mt-0.5">
                            סכום: ₪{rev.currentAmount?.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Added "Add Item" Button here (Right side in RTL) */}
            <button
              type="button"
              onClick={() => setIsBoqModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-2 rounded-lg hover:bg-indigo-100 shadow-sm font-medium transition text-sm mr-4"
            >
              <Plus size={16} /> הוסף סעיף
            </button>
          </div>

          {/* ACTION BUTTONS (Left Side) */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 shadow-sm font-medium transition text-sm"
            >
              <Settings size={16} />
            </button>

            <div className="h-8 w-px bg-slate-300 mx-1 self-center"></div>

            <button
              type="button"
              onClick={() => handleSaveBill('draft')}
              className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 shadow-sm font-medium transition text-sm"
            >
              <Save size={16} /> שמור כטיוטה
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await dialog.confirm('האם אתה בטוח שברצונך להגיש את החשבון?')) {
                  handleSaveBill('submitted');
                }
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 shadow-sm font-medium transition text-sm"
            >
              <Send size={16} /> שמור והגש חשבון
            </button>

            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="flex items-center gap-2 bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-900 shadow-sm font-medium transition text-sm mr-2"
            >
              <Download size={16} /> ייצוא
            </button>
          </div>
        </div>

        {/* Logos Section - Safe Render */}
        {(projectData?.logoContractorUrl || projectData?.logoClientUrl) && (
          <div className="bg-white mb-4 p-4 rounded-xl border border-slate-200 flex justify-between items-center no-print">
            {projectData.logoContractorUrl ? (
              <img
                src={projectData.logoContractorUrl}
                alt="Contractor"
                className="h-16 object-contain"
              />
            ) : (
              <div></div>
            )}
            <div className="text-center">
              <h3 className="font-bold text-lg text-slate-800">חשבון חלקי מצטבר</h3>
              <p className="text-slate-500">{activeBill?.date}</p>
            </div>
            {projectData.logoClientUrl ? (
              <img src={projectData.logoClientUrl} alt="Client" className="h-16 object-contain" />
            ) : (
              <div></div>
            )}
          </div>
        )}

        {/* MAIN BILLING TABLE */}
        <div className="bg-white shadow-lg border border-slate-300 overflow-hidden rounded-lg mb-8 no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-slate-100 text-slate-700 text-xs uppercase font-bold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-3 border border-slate-300 w-32 shrink-0">קוד סעיף</th>
                  <th className="p-3 border border-slate-300 min-w-[350px]">תיאור סעיף</th>
                  <th className="p-3 border border-slate-300 w-16 text-center shrink-0">יח'</th>
                  <th className="p-3 border border-slate-300 w-24 shrink-0">כמות חוזה</th>
                  <th className="p-3 border border-slate-300 w-24 bg-slate-200 shrink-0">
                    כמות קודמת
                  </th>
                  <th className="p-3 border border-slate-300 w-24 bg-blue-50 text-blue-800 shrink-0">
                    לחשבון זה
                  </th>
                  <th className="p-3 border border-slate-300 w-24 bg-green-50 text-green-800 font-bold border-l-4 border-l-green-400 shrink-0">
                    כמות מצטברת
                  </th>
                  <th className="p-3 border border-slate-300 w-24 shrink-0">מחיר יח'</th>
                  <th className="p-3 border border-slate-300 w-16 shrink-0">הנחה</th>
                  <th className="p-3 border border-slate-300 w-32 shrink-0">סה"כ לתשלום</th>
                  <th className="p-3 border border-slate-300 w-20 text-center shrink-0">
                    דפי ריכוז
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, idx) => {
                  const style = getRowStyle(row);
                  return (
                    <tr
                      key={idx}
                      className="border-b border-slate-200 hover:brightness-95 transition"
                      style={style}
                    >
                      {row.isItem ? (
                        <>
                          <td className="p-2 border border-slate-200 font-mono text-xs font-semibold bg-white text-slate-800">
                            {row.code}
                          </td>
                          <td className="p-2 border border-slate-200 font-medium bg-white text-slate-800 leading-snug">
                            {row.description}
                          </td>
                          <td className="p-2 border border-slate-200 text-center bg-white text-slate-800">
                            {row.unit}
                          </td>
                          <td className="p-2 border border-slate-200 bg-white text-slate-800">
                            {row.contractQuantity?.toLocaleString() || 0}
                          </td>
                          <td className="p-2 border border-slate-200 bg-slate-50 text-slate-500">
                            {row.previousQuantity?.toLocaleString() || 0}
                          </td>

                          <td className="p-2 border border-slate-200 bg-blue-50 font-bold text-blue-700">
                            {(row.currentQuantity - row.previousQuantity).toLocaleString()}
                          </td>

                          <td className="p-2 border border-slate-200 bg-green-50 font-bold text-green-800 text-lg">
                            {row.currentQuantity?.toLocaleString() || 0}
                          </td>

                          <td className="p-2 border border-slate-200 bg-white text-slate-800">
                            {row.unitPrice?.toLocaleString() || 0}
                          </td>
                          <td className="p-2 border border-slate-200 text-red-500 bg-white">
                            {((row.discount ?? 0) * 100).toFixed(2)}%
                          </td>
                          <td className="p-2 border border-slate-200 font-bold bg-white text-slate-800">
                            {formatCurrency(row.totalAmount || 0)}
                          </td>
                          <td className="p-2 border border-slate-200 text-center bg-white">
                            <button
                              type="button"
                              onClick={() => setSelectedItem(row)}
                              className="p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition border border-indigo-200 flex items-center gap-1 text-xs px-2 mx-auto"
                              title="פתח דף חישוב כמויות"
                            >
                              <FileDigit size={16} />
                              דף ריכוז
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td
                            className="p-3 border border-white/20"
                            colSpan={row.isSummary ? 9 : 11}
                          >
                            {row.description}
                          </td>
                          {row.isSummary && (
                            <td
                              className="p-3 border border-white/20 font-bold text-left pl-4"
                              colSpan={2}
                            >
                              {formatCurrency(row.totalAmount || 0)}
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* BOQ SELECTION MODAL */}
        {isBoqModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <Search size={20} className="text-blue-600" />
                  בחירת סעיפים להוספה לחשבון
                </h3>
                <button type="button" onClick={() => setIsBoqModalOpen(false)}>
                  <X className="text-slate-400 hover:text-slate-600" />
                </button>
              </div>

              <div className="p-4 bg-slate-100 border-b border-slate-200 flex gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="חפש לפי קוד או תיאור..."
                    className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    value={boqSearch}
                    onChange={(e) => setBoqSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={triggerFileUpload}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-green-700 flex items-center gap-2 text-sm"
                >
                  <Upload size={16} /> טען מקובץ
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <table className="w-full text-right text-sm">
                  <thead className="text-slate-500 bg-white sticky top-0">
                    <tr>
                      <th className="p-2 border-b">קוד</th>
                      <th className="p-2 border-b">תיאור</th>
                      <th className="p-2 border-b">יח'</th>
                      <th className="p-2 border-b">מחיר יח'</th>
                      <th className="p-2 border-b">פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedBoqItems
                      .filter(
                        (i) => i.code.includes(boqSearch) || i.description.includes(boqSearch)
                      )
                      .sort((a, b) =>
                        a.code.localeCompare(b.code, undefined, {
                          numeric: true,
                          sensitivity: 'base',
                        })
                      )
                      .map((item) => {
                        // Check if item already exists in active bill
                        const isAlreadyInBill = activeBill?.items.some(
                          (billItem) => billItem.code === item.code
                        );
                        const isException = (item as any).isException;

                        return (
                          <tr
                            key={item.code}
                            className={`border-b border-slate-100 ${isAlreadyInBill ? 'bg-slate-50 opacity-50' : isException ? 'bg-purple-50 hover:bg-purple-100 transition' : 'hover:bg-blue-50 transition'}`}
                          >
                            <td className="p-3 font-mono text-slate-600 font-bold">
                              {item.code}
                              {isException && (
                                <span className="ml-2 text-xs bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded">
                                  חריג
                                </span>
                              )}
                            </td>
                            <td className="p-3">{item.description}</td>
                            <td className="p-3">{item.unit}</td>
                            <td className="p-3">{item.unitPrice?.toLocaleString()} ₪</td>
                            <td className="p-3">
                              {isAlreadyInBill ? (
                                <span className="text-xs text-green-600 flex items-center gap-1 font-bold">
                                  <CheckCircle size={12} /> קיים בחשבון
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleAddItem(item)}
                                  className={`${isException ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition`}
                                >
                                  הוסף לחשבון
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {boqItems.length === 0 && (
                  <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
                    <AlertCircle size={32} />
                    <p>רשימת הסעיפים ריקה. טען קובץ כאן או דרך מסך ההגדרות.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ITEM MEASUREMENT SHEET MODAL */}
        {selectedItem && (
          <MeasurementSheetModal
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSave={(measurements) => handleUpdateMeasurements(selectedItem.id, measurements)}
            billNumber={activeBill?.number || 0}
            config={config}
            projectData={projectData}
            readOnly={false}
            billPeriods={billPeriodsMap}
            currentUser={currentUser}
            bill={activeBill || undefined}
          />
        )}

        {/* SETTINGS MODAL */}
        {isSettingsOpen && (
          <BillingSettingsModal
            config={config}
            onSave={(c) => {
              setConfig(c);
              setIsSettingsOpen(false);
            }}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}

        {/* EXPORT OPTIONS MODAL */}
        {isPrintModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden">
              <div className="p-4 bg-slate-800 text-white font-bold flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Download size={20} /> אפשרויות ייצוא והדפסה
                </div>
                <button onClick={() => setIsPrintModalOpen(false)}>
                  <X size={20} className="hover:text-slate-300" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-slate-600 mb-2 text-sm">בחר את הנתונים להכללה:</p>

                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-blue-600"
                      checked={printOptions.summary}
                      onChange={(e) =>
                        setPrintOptions((prev) => ({ ...prev, summary: e.target.checked }))
                      }
                    />
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800">ריכוז החשבון (טבלה ראשית)</span>
                      <span className="text-xs text-slate-500">
                        כולל סיכומים לפי פרקים, תתי פרקים ומבנים
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-blue-600"
                      checked={printOptions.measurements}
                      onChange={(e) =>
                        setPrintOptions((prev) => ({ ...prev, measurements: e.target.checked }))
                      }
                    />
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800">דפי מדידה (פירוט כמויות)</span>
                      <span className="text-xs text-slate-500">
                        פירוט מלא של כל חישובי הכמויות בכל סעיף
                      </span>
                    </div>
                  </label>
                </div>

                <div className="flex gap-3 mt-4 pt-2 border-t">
                  <button
                    onClick={handlePrintAction}
                    className="flex-1 bg-white border border-slate-300 text-slate-700 font-bold py-3 rounded-lg flex justify-center items-center gap-2 hover:bg-slate-50 transition"
                  >
                    <Printer size={18} />
                    הדפסה / PDF
                  </button>

                  <button
                    onClick={handleExportExcel}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 shadow-lg transition"
                  >
                    <FileSpreadsheet size={18} />
                    ייצוא לאקסל
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* HIDDEN PRINTABLE CONTENT (Only visible via CSS @media print) */}
      {/* Render only if modal is NOT open, to avoid double print content or conflicts */}
      <div className={`print-content ${!isPrintModalOpen ? 'hidden' : ''}`}>
        <PrintableContent
          activeBill={activeBill}
          tableData={tableData}
          projectData={projectData}
          options={printOptions}
          config={config}
        />
      </div>
    </>
  );
};

// --- SUB-COMPONENT: MEASUREMENT SHEET ---
const MeasurementSheetModal: React.FC<{
  item: BillItem;
  onClose: () => void;
  onSave: (rows: MeasurementRow[]) => void;
  billNumber: number;
  config: BillingStyleConfig;
  projectData: ProjectMetadata;
  readOnly?: boolean;
  billPeriods: Record<number, string>;
  currentUser?: User;
  bill?: Bill;
}> = ({
  item,
  onClose,
  onSave,
  billNumber,
  config: _config,
  projectData,
  readOnly,
  billPeriods,
  currentUser,
  bill,
}) => {
  // Initialize safely
  const [rows, setRows] = useState<MeasurementRow[]>(
    item.measurements.length > 0
      ? item.measurements
      : [
          {
            id: 'new-1',
            description: '',
            unit: item.unit,
            location: '',
            quantity: 0,
            partialPercentage: 100,
            total: 0,
            billNumber: billNumber,
          },
        ]
  );

  const isLocked = (row: MeasurementRow) => (row.billNumber || 0) < billNumber || readOnly;

  const updateRow = (id: string, field: keyof MeasurementRow, value: any) => {
    if (readOnly) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const isFieldLocked = isLocked(r) && field !== 'approvedQuantity';
          if (isFieldLocked) return r;

          const updated = { ...r, [field]: value };
          if (['quantity', 'partialPercentage'].includes(field)) {
            updated.total = (updated.quantity || 0) * ((updated.partialPercentage || 100) / 100);
          }
          return updated;
        }
        return r;
      })
    );
  };

  const addRow = () => {
    setRows([
      ...rows,
      {
        id: `new-${Date.now()}`,
        description: '',
        unit: item.unit,
        location: '',
        quantity: 0,
        partialPercentage: 100,
        total: 0,
        billNumber: billNumber,
      },
    ]);
  };

  const removeRow = (id: string) => {
    setRows(rows.filter((r) => r.id !== id));
  };

  let runningTotal = 0;
  const rowsWithCumulative = rows.map((r) => {
    runningTotal += r.total ?? 0;
    return { ...r, cumulativeCalculated: runningTotal };
  });

  const totalSubmitted = rows.reduce((sum, r) => sum + (r.total ?? 0), 0);

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white shadow-2xl w-full max-w-[95vw] h-[95vh] flex flex-col animate-in zoom-in-95 duration-200 border-t-8 border-blue-600">
        <div className="p-2 bg-slate-100 border-b border-slate-300 flex justify-between items-center no-print">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-slate-600 hover:text-slate-800 font-medium"
            >
              סגור
            </button>
            {!readOnly && (
              <button
                onClick={() => {
                  onSave(rows);
                  onClose();
                }}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 font-bold shadow-sm"
              >
                <Save size={16} /> שמור וצא
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded text-sm hover:bg-slate-50"
            >
              <Printer size={16} /> הדפס
            </button>
          </div>
          <div className="text-sm text-slate-500">עריכת דף ריכוז כמויות - חשבון #{billNumber}</div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-100 p-8" dir="rtl">
          <div
            className="bg-white mx-auto shadow-lg min-h-[1000px] max-w-[1200px] p-8 text-black text-right print-content"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            <div className="flex justify-between items-start mb-6 border-b-2 border-black pb-4">
              <div className="w-48 h-20 bg-slate-50 border border-slate-200 flex items-center justify-center">
                {projectData?.logoContractorUrl ? (
                  <img
                    src={projectData.logoContractorUrl}
                    alt="Contractor"
                    className="max-h-full max-w-full"
                  />
                ) : (
                  <span className="text-xs text-slate-400">לוגו קבלן</span>
                )}
              </div>
              <div className="text-center flex-1 px-4">
                <h1 className="text-xl font-bold underline mb-1">
                  פרויקט "{projectData?.name}" - חוזה {projectData?.contractNumber}
                </h1>
                <h2 className="text-lg font-bold">
                  ריכוז כמויות עבור סעיף מס': <span className="underline">{item.code}</span>
                </h2>
              </div>
              <div className="w-48 h-20 bg-slate-50 border border-slate-200 flex items-center justify-center">
                {projectData?.logoClientUrl ? (
                  <img
                    src={projectData.logoClientUrl}
                    alt="Client"
                    className="max-h-full max-w-full"
                  />
                ) : (
                  <span className="text-xs text-slate-400">לוגו מזמין</span>
                )}
              </div>
            </div>

            <div className="border-2 border-black mb-6">
              <div className="flex text-center font-bold bg-slate-100 border-b border-black">
                <div className="w-32 border-l border-black p-1">סעיף מס'</div>
                <div className="flex-1 border-l border-black p-1">תיאור הסעיף</div>
                <div className="w-20 border-l border-black p-1">יח'</div>
                <div className="w-32 p-1">כמות חוזה</div>
              </div>
              <div className="flex text-center font-medium">
                <div className="w-32 border-l border-black p-2" dir="ltr">
                  {item.code}
                </div>
                <div className="flex-1 border-l border-black p-2 text-right pr-4">
                  {item.description}
                </div>
                <div className="w-20 border-l border-black p-2">{item.unit}</div>
                <div className="w-32 p-2">{item.contractQuantity?.toLocaleString()}</div>
              </div>
            </div>

            <table className="w-full border-collapse border border-black text-sm">
              <thead className="bg-slate-100 text-center font-bold">
                <tr>
                  <th className="border border-black p-1 w-8 no-print"></th>
                  <th className="border border-black p-1 w-16">מס' חשבון</th>
                  <th className="border border-black p-1 w-12">דף מספר</th>
                  <th className="border border-black p-1">תאור העבודה (מיקום/חישוב)</th>
                  <th className="border border-black p-1 w-24">כמות מחושבת</th>
                  <th className="border border-black p-1 w-12">%</th>
                  <th className="border border-black p-1 w-20 bg-yellow-50">לשלם</th>
                  <th className="border border-black p-1 w-20 bg-slate-100">מצטברת</th>
                  <th className="border border-black p-1 w-20">מאושרת</th>
                  <th className="border border-black p-1 w-32">הערות מפקח</th>
                  <th className="border border-black p-1 w-24 bg-green-50">חתימת מפקח</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithCumulative.map((row) => {
                  const locked = isLocked(row);
                  return (
                    <tr
                      key={row.id}
                      className={locked ? 'bg-slate-100 text-slate-500' : 'hover:bg-blue-50'}
                    >
                      <td className="border border-black p-1 text-center no-print">
                        {!locked && !readOnly && (
                          <button
                            onClick={() => removeRow(row.id)}
                            className="text-slate-300 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>

                      {/* Bill Number + Period Column */}
                      <td className="border border-black p-1 text-center">
                        <div className="flex flex-col items-center justify-center leading-tight py-1">
                          {locked ? (
                            <>
                              <span className="font-bold flex items-center gap-1">
                                <Lock size={10} /> {row.billNumber}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {billPeriods[row.billNumber!] || ''}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-bold">{billNumber}</span>
                              <span className="text-[10px] text-blue-600 font-medium">
                                {billPeriods[billNumber] || 'נוכחי'}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="border border-black p-1 text-center">
                        <input
                          disabled={locked}
                          type="text"
                          className="w-full bg-transparent outline-none text-center"
                          value={row.sheetId || '1'}
                          onChange={(e) => updateRow(row.id, 'sheetId', e.target.value)}
                        />
                      </td>

                      <td className="border border-black p-1">
                        <input
                          disabled={locked}
                          type="text"
                          className="w-full bg-transparent outline-none font-medium text-right"
                          value={row.description}
                          onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                          placeholder={locked ? '' : 'תיאור העבודה...'}
                        />
                      </td>

                      <td className="border border-black p-1 text-center">
                        <input
                          disabled={locked}
                          type="number"
                          className="w-full bg-transparent outline-none text-center font-bold"
                          value={row.quantity || ''}
                          onChange={(e) =>
                            updateRow(row.id, 'quantity', parseFloat(e.target.value))
                          }
                          placeholder="0"
                        />
                      </td>

                      <td className="border border-black p-1 text-center relative">
                        <div className="flex items-center justify-center">
                          <input
                            disabled={locked}
                            type="number"
                            className="w-10 bg-transparent outline-none text-center"
                            value={row.partialPercentage}
                            onChange={(e) =>
                              updateRow(row.id, 'partialPercentage', parseFloat(e.target.value))
                            }
                            placeholder="100"
                          />
                          <span className="text-slate-500 text-xs">%</span>
                        </div>
                      </td>

                      <td className="border border-black p-1 text-center font-bold bg-yellow-50">
                        {(row.total ?? 0).toFixed(2)}
                      </td>
                      <td className="border border-black p-1 text-center bg-slate-100 font-medium text-slate-600">
                        {(row.cumulativeCalculated ?? 0).toFixed(2)}
                      </td>

                      <td className="border border-black p-1 text-center">
                        <input
                          type="number"
                          className="w-full bg-transparent outline-none text-center text-green-700 font-bold placeholder-slate-300"
                          value={row.approvedQuantity || ''}
                          onChange={(e) =>
                            updateRow(row.id, 'approvedQuantity', parseFloat(e.target.value))
                          }
                          placeholder="-"
                        />
                      </td>

                      {/* הערות מפקח */}
                      <td className="border border-black p-1">
                        <input
                          type="text"
                          className="w-full bg-transparent outline-none text-center text-xs"
                          value={row.approvalSignature?.approverRemarks || row.remarks || ''}
                          onChange={(e) => {
                            // Update approverRemarks if there's a signature, otherwise update remarks
                            if (row.approvalSignature) {
                              const newSig = {
                                ...row.approvalSignature,
                                approverRemarks: e.target.value,
                              };
                              updateRow(row.id, 'approvalSignature', newSig);
                            } else {
                              updateRow(row.id, 'remarks', e.target.value);
                            }
                          }}
                          placeholder="הערות..."
                        />
                      </td>

                      {/* חתימת מפקח */}
                      <td className="border border-black p-1 text-center bg-green-50">
                        {row.approvalSignature ? (
                          <div className="flex flex-col items-center">
                            <img
                              src={row.approvalSignature.signatureDataUrl}
                              alt={row.approvalSignature.userName}
                              className="h-6 max-w-full object-contain"
                            />
                            <span className="text-[8px] text-slate-500">
                              {row.approvalSignature.userName}
                            </span>
                          </div>
                        ) : currentUser?.signature && row.approvedQuantity ? (
                          <button
                            onClick={() => {
                              const sig = {
                                userId: currentUser.id,
                                userName: currentUser.name,
                                userTitle: currentUser.workerTitle,
                                signatureDataUrl: currentUser.signature!,
                                approvedAt: new Date().toISOString(),
                                approverRemarks: row.remarks,
                              };
                              updateRow(row.id, 'approvalSignature', sig);
                            }}
                            className="text-[10px] text-green-600 hover:underline no-print"
                          >
                            חתום
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!readOnly && (
                  <tr className="no-print bg-slate-50">
                    <td colSpan={11} className="border border-black p-2 text-center">
                      <button
                        onClick={addRow}
                        className="text-blue-600 hover:underline text-sm font-bold flex items-center justify-center gap-1 w-full"
                      >
                        <Plus size={14} /> הוסף שורת מדידה לחשבון נוכחי (#{billNumber})
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-green-100 border-t-2 border-black font-bold">
                <tr>
                  <td colSpan={6} className="border border-black p-2 text-left pl-4">
                    סה"כ כמות מצטברת לחשבון זה (מוגש):
                  </td>
                  <td className="border border-black p-2 text-center text-lg">
                    {(totalSubmitted ?? 0).toFixed(2)}
                  </td>
                  <td colSpan={4} className="border border-black p-2"></td>
                </tr>
              </tfoot>
            </table>

            <div className="mt-8 flex justify-between items-end border-t border-black pt-4">
              {/* חתימת קבלן */}
              <div className="text-sm">
                <div className="font-bold">חתימת המודד/קבלן:</div>
                {bill?.contractorSignature ? (
                  <div className="border border-slate-300 rounded p-2 bg-blue-50 w-48">
                    <img
                      src={bill.contractorSignature.signatureDataUrl}
                      alt={bill.contractorSignature.userName}
                      className="h-10 object-contain mx-auto"
                    />
                    <div className="text-xs text-center text-slate-600 mt-1">
                      {bill.contractorSignature.userName}
                    </div>
                    <div className="text-[10px] text-center text-slate-400">
                      {new Date(bill.contractorSignature.signedAt).toLocaleDateString('he-IL')}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="h-10 border-b border-slate-400 w-48 mb-2"></div>
                    <div>שם: ________________</div>
                  </>
                )}
              </div>

              {/* חותמת הפרויקט */}
              <div className="text-sm text-center">
                <div className="font-bold mb-8">חותמת הפרויקט</div>
              </div>

              {/* חתימת מפקח - מי שאישר את החשבון */}
              <div className="text-sm">
                <div className="font-bold">אישור המפקח/מזמין:</div>
                {bill?.approverSignature ? (
                  <div className="border border-slate-300 rounded p-2 bg-green-50 w-48">
                    <img
                      src={bill.approverSignature.signatureDataUrl}
                      alt={bill.approverSignature.userName}
                      className="h-10 object-contain mx-auto"
                    />
                    <div className="text-xs text-center text-slate-600 mt-1">
                      {bill.approverSignature.userName}
                    </div>
                    <div className="text-[10px] text-center text-slate-400">
                      {new Date(bill.approverSignature.approvedAt).toLocaleDateString('he-IL')}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="h-10 border-b border-slate-400 w-48 mb-2"></div>
                    <div>תאריך: ________________</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ADDED: BillingSettingsModal
const BillingSettingsModal: React.FC<{
  config: BillingStyleConfig;
  onSave: (c: BillingStyleConfig) => void;
  onClose: () => void;
}> = ({ config, onSave, onClose }) => {
  const [localConfig, setLocalConfig] = useState<BillingStyleConfig>(config);

  const handleChange = (key: keyof BillingStyleConfig, value: string) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const HEBREW_LABELS: Record<string, string> = {
    structureBg: 'רקע כותרת מבנה',
    structureText: 'טקסט כותרת מבנה',
    chapterBg: 'רקע כותרת פרק',
    chapterText: 'טקסט כותרת פרק',
    subChapterBg: 'רקע כותרת תת-פרק',
    subChapterText: 'טקסט כותרת תת-פרק',
    summaryStructureBg: 'רקע סיכום מבנה',
    summaryChapterBg: 'רקע סיכום פרק',
    summarySubChapterBg: 'רקע סיכום תת-פרק',
    summaryTotalBg: 'רקע סה"כ לתשלום (מודגש)',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Palette size={18} className="text-blue-600" />
            הגדרות עיצוב חשבון
          </h3>
          <button onClick={onClose}>
            <X className="text-slate-400 hover:text-slate-600" />
          </button>
        </div>
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-slate-500 mb-2">התאם את צבעי הטבלה והדוחות:</p>

          {Object.keys(localConfig).map((key) => (
            <div
              key={key}
              className="flex justify-between items-center border-b border-slate-50 pb-2 last:border-0"
            >
              <label className="text-sm text-slate-600">{HEBREW_LABELS[key] || key}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={(localConfig as any)[key]}
                  onChange={(e) => handleChange(key as keyof BillingStyleConfig, e.target.value)}
                  className="h-8 w-14 rounded cursor-pointer border-0 p-0"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium"
          >
            ביטול
          </button>
          <button
            onClick={() => onSave(localConfig)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm"
          >
            שמור שינויים
          </button>
        </div>
      </div>
    </div>
  );
};

// ADDED: PrintableContent
const PrintableContent: React.FC<{
  activeBill: Bill | null;
  tableData: any[];
  projectData: ProjectMetadata;
  options: { summary: boolean; measurements: boolean };
  config: BillingStyleConfig;
}> = ({ activeBill, tableData, projectData, options, config }) => {
  if (!activeBill) return null;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 2,
    }).format(val);

  const getRowStyle = (row: any) => {
    if (row.isHeader) {
      switch (row.type) {
        case 'structure':
          return {
            backgroundColor: config.structureBg,
            color: config.structureText,
            fontWeight: 'bold',
          };
        case 'chapter':
          return {
            backgroundColor: config.chapterBg,
            color: config.chapterText,
            fontWeight: 'bold',
          };
        case 'subchapter':
          return {
            backgroundColor: config.subChapterBg,
            color: config.subChapterText,
            fontWeight: 'bold',
          };
      }
    }
    if (row.isSummary) {
      // Force lighter/white backgrounds for print to save ink, or stick to config?
      // Sticking to config as requested, but maybe override for print readability if needed.
      // For now using inline styles directly.
      return { fontWeight: 'bold', backgroundColor: '#f1f5f9' };
    }
    return {};
  };

  return (
    <div
      className="p-8 bg-white text-black text-right"
      dir="rtl"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      {/* Print Header */}
      <div className="flex justify-between items-start mb-8 border-b-2 border-slate-800 pb-4">
        <div className="w-32">
          {projectData.logoContractorUrl && (
            <img
              src={projectData.logoContractorUrl}
              alt="Contractor"
              className="max-w-full max-h-16 object-contain"
            />
          )}
        </div>
        <div className="text-center flex-1">
          <h1 className="text-2xl font-black mb-1">{projectData.name}</h1>
          <h2 className="text-xl font-bold mb-2">חשבון חלקי מס' {activeBill.number}</h2>
          <div className="text-sm flex justify-center gap-4">
            <span>תקופה: {activeBill.period}</span>
            <span>תאריך: {activeBill.date}</span>
            <span>חוזה: {projectData.contractNumber}</span>
          </div>
        </div>
        <div className="w-32 flex justify-end">
          {projectData.logoClientUrl && (
            <img
              src={projectData.logoClientUrl}
              alt="Client"
              className="max-w-full max-h-16 object-contain"
            />
          )}
        </div>
      </div>

      {options.summary && (
        <div className="mb-8">
          <h3 className="font-bold text-lg mb-2 underline decoration-2 decoration-blue-500">
            ריכוז החשבון
          </h3>
          <table className="w-full text-sm border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-200 text-slate-800">
                <th className="border border-slate-300 p-2">קוד</th>
                <th className="border border-slate-300 p-2 w-1/3">תיאור</th>
                <th className="border border-slate-300 p-2">יח'</th>
                <th className="border border-slate-300 p-2">כמות חוזה</th>
                <th className="border border-slate-300 p-2">מצטבר</th>
                <th className="border border-slate-300 p-2">מחיר יח'</th>
                <th className="border border-slate-300 p-2">סה"כ</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => {
                const style = getRowStyle(row);
                return (
                  <tr
                    key={idx}
                    style={style}
                    className={
                      row.isSummary ? 'border-t-2 border-slate-400' : 'border-b border-slate-100'
                    }
                  >
                    {row.isItem ? (
                      <>
                        <td className="border border-slate-300 p-1.5 font-mono text-xs">
                          {row.code}
                        </td>
                        <td className="border border-slate-300 p-1.5">{row.description}</td>
                        <td className="border border-slate-300 p-1.5 text-center">{row.unit}</td>
                        <td className="border border-slate-300 p-1.5 text-center">
                          {row.contractQuantity?.toLocaleString()}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">
                          {row.currentQuantity?.toLocaleString()}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center">
                          {row.unitPrice?.toLocaleString()}
                        </td>
                        <td className="border border-slate-300 p-1.5 font-bold">
                          {formatCurrency(row.totalAmount || 0)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td
                          className="border border-slate-300 p-2 font-bold"
                          colSpan={row.isSummary ? 6 : 7}
                        >
                          {row.description}
                        </td>
                        {row.isSummary && (
                          <td className="border border-slate-300 p-2 font-bold">
                            {formatCurrency(row.totalAmount || 0)}
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {options.measurements && (
        <div>
          <h3 className="font-bold text-lg mb-4 underline decoration-2 decoration-green-500 break-before-page">
            פירוט מדידות (דפי ריכוז)
          </h3>
          {activeBill.items
            .filter((item) => item.measurements && item.measurements.length > 0)
            .map((item) => (
              <div
                key={item.id}
                className="mb-6 border border-slate-300 rounded overflow-hidden break-inside-avoid"
              >
                <div className="bg-slate-100 p-2 border-b border-slate-300 font-bold flex justify-between">
                  <span>
                    {item.code} - {item.description}
                  </span>
                  <span>סה"כ: {formatCurrency(item.totalAmount)}</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="p-1.5 text-right">תיאור/מיקום</th>
                      <th className="p-1.5 text-center w-16">מס' ח"ן</th>
                      <th className="p-1.5 text-center w-16">כמות</th>
                      <th className="p-1.5 text-center w-16">%</th>
                      <th className="p-1.5 text-center w-20">סה"כ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {item.measurements.map((m) => (
                      <tr key={m.id}>
                        <td className="p-1.5">{m.description}</td>
                        <td className="p-1.5 text-center text-slate-500">{m.billNumber}</td>
                        <td className="p-1.5 text-center">{m.quantity}</td>
                        <td className="p-1.5 text-center">{m.partialPercentage}%</td>
                        <td className="p-1.5 text-center font-bold">{(m.total ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      )}

      <div className="mt-12 text-center text-xs text-slate-400 border-t border-slate-200 pt-4">
        הופק באמצעות מערכת Geometrix | {new Date().toLocaleString()}
      </div>
    </div>
  );
};

// ADDED: RevisionViewerModal — read-only PDF-like preview of a saved bill revision
const RevisionViewerModal: React.FC<{
  bill: Bill;
  revision: BillRevision;
  revisionIndex: number;
  projectData: ProjectMetadata;
  config: BillingStyleConfig;
  onDuplicate: () => void;
  onClose: () => void;
}> = ({ bill, revision, revisionIndex, projectData, config, onDuplicate, onClose }) => {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 2,
    }).format(val);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // Build table data from revision items (same logic as main tableData)
  const tableData = useMemo(() => {
    const items = [...revision.items].sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
    );
    const rows: any[] = [];
    let curStruct = '',
      curChapter = '',
      curSubchap = '';
    let sumSubK = 0,
      sumChapK = 0,
      sumStructK = 0,
      totalK = 0;

    const pushSummary = (title: string, amount: number, type: string) => {
      rows.push({ isSummary: true, type, description: title, totalAmount: amount });
    };

    items.forEach((item) => {
      const parts = item.code.split('.');
      const struct = parts[0] || '',
        chapter = parts[1] || '',
        subchap = parts[2] || '';

      if (struct !== curStruct) {
        if (curStruct !== '') {
          pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
          pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
          pushSummary(`סך הכל מבנה ${curStruct}`, sumStructK, 'structure');
        }
        curStruct = struct;
        curChapter = '';
        curSubchap = '';
        sumStructK = 0;
        sumChapK = 0;
        sumSubK = 0;
        rows.push({ isHeader: true, type: 'structure', description: `מבנה ${struct}` });
      }
      if (chapter !== curChapter) {
        if (curChapter !== '') {
          pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
          pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
        }
        curChapter = chapter;
        curSubchap = '';
        sumChapK = 0;
        sumSubK = 0;
        rows.push({ isHeader: true, type: 'chapter', description: `פרק ${chapter}` });
      }
      if (subchap !== curSubchap) {
        if (curSubchap !== '') {
          pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
        }
        curSubchap = subchap;
        sumSubK = 0;
        rows.push({ isHeader: true, type: 'subchapter', description: `תת-פרק ${subchap}` });
      }

      rows.push({ ...item, isItem: true });
      sumSubK += item.totalAmount;
      sumChapK += item.totalAmount;
      sumStructK += item.totalAmount;
      totalK += item.totalAmount;
    });

    if (curStruct !== '') {
      pushSummary(`סך הכל תת-פרק ${curSubchap}`, sumSubK, 'subchapter');
      pushSummary(`סך הכל פרק ${curChapter}`, sumChapK, 'chapter');
      pushSummary(`סך הכל מבנה ${curStruct}`, sumStructK, 'structure');
    }
    rows.push({
      isSummary: true,
      type: 'total',
      description: 'סך הכל לחשבון מצטבר',
      totalAmount: totalK,
    });
    return rows;
  }, [revision.items]);

  const getRowStyle = (row: any) => {
    if (row.isHeader) {
      switch (row.type) {
        case 'structure':
          return {
            backgroundColor: config.structureBg,
            color: config.structureText,
            fontWeight: 'bold' as const,
          };
        case 'chapter':
          return {
            backgroundColor: config.chapterBg,
            color: config.chapterText,
            fontWeight: 'bold' as const,
          };
        case 'subchapter':
          return {
            backgroundColor: config.subChapterBg,
            color: config.subChapterText,
            fontWeight: 'bold' as const,
          };
      }
    }
    if (row.isSummary) return { fontWeight: 'bold' as const, backgroundColor: '#f1f5f9' };
    return {};
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <FileText size={18} className="text-blue-600" />
              חשבון #{bill.number} — גרסה {revisionIndex + 1}
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold ${
                revision.status === 'submitted'
                  ? 'bg-amber-100 text-amber-700'
                  : revision.status === 'approved'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              {revision.status === 'submitted'
                ? 'הוגש'
                : revision.status === 'approved'
                  ? 'אושר'
                  : 'טיוטה'}
            </span>
            <span className="text-xs text-slate-400">
              {new Date(revision.savedAt).toLocaleDateString('he-IL')}{' '}
              {new Date(revision.savedAt).toLocaleTimeString('he-IL', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {revision.savedBy && (
              <span className="text-xs text-slate-500">
                • נשמר ע״י: {revision.savedBy.userName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDuplicate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition"
            >
              <Copy size={14} /> שכפל לחשבון חדש
            </button>
            <button type="button" onClick={onClose}>
              <X className="text-slate-400 hover:text-slate-600" />
            </button>
          </div>
        </div>

        {/* Content — scrollable PDF-like view */}
        <div className="flex-1 overflow-y-auto p-6" dir="rtl">
          {/* Bill Header */}
          <div className="text-center mb-6 border-b-2 border-slate-800 pb-4">
            <h1 className="text-2xl font-black mb-1">{projectData.name}</h1>
            <h2 className="text-xl font-bold mb-2">
              חשבון חלקי מס' {bill.number} — גרסה {revisionIndex + 1}
            </h2>
            <div className="text-sm flex justify-center gap-4 text-slate-600">
              <span>תאריך שמירה: {new Date(revision.savedAt).toLocaleDateString('he-IL')}</span>
              <span>חוזה: {projectData.contractNumber}</span>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <div className="text-xs text-blue-600 mb-1">מצטבר</div>
              <div className="text-lg font-bold text-blue-800">
                {formatCurrency(revision.cumulativeAmount)}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-600 mb-1">מצטבר קודם</div>
              <div className="text-lg font-bold text-slate-800">
                {formatCurrency(revision.previousCumulativeAmount)}
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <div className="text-xs text-green-600 mb-1">לתשלום</div>
              <div className="text-lg font-bold text-green-800">
                {formatCurrency(revision.currentAmount)}
              </div>
            </div>
          </div>

          {revision.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-800">
              <strong>הערות:</strong> {revision.notes}
            </div>
          )}

          {/* Items Table */}
          <table className="w-full text-sm border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-200 text-slate-800">
                <th className="border border-slate-300 p-2">קוד</th>
                <th className="border border-slate-300 p-2 w-1/3">תיאור</th>
                <th className="border border-slate-300 p-2">יח'</th>
                <th className="border border-slate-300 p-2">כמות חוזה</th>
                <th className="border border-slate-300 p-2">מצטבר</th>
                <th className="border border-slate-300 p-2">מחיר יח'</th>
                <th className="border border-slate-300 p-2">סה"כ</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row: any, idx: number) => {
                const style = getRowStyle(row);
                const isExpanded = row.isItem && expandedItems.has(row.id);
                const hasMeasurements =
                  row.isItem && row.measurements && row.measurements.length > 0;
                return (
                  <React.Fragment key={idx}>
                    <tr
                      style={style}
                      className={`${row.isSummary ? 'border-t-2 border-slate-400' : 'border-b border-slate-100'} ${row.isItem ? 'cursor-pointer hover:bg-blue-50/50 transition' : ''}`}
                      onClick={row.isItem ? () => toggleItem(row.id) : undefined}
                    >
                      {row.isItem ? (
                        <>
                          <td className="border border-slate-300 p-1.5 font-mono text-xs">
                            <span className="flex items-center gap-1">
                              {hasMeasurements && (
                                <ChevronDown
                                  size={12}
                                  className={`text-blue-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                                />
                              )}
                              {row.code}
                            </span>
                          </td>
                          <td className="border border-slate-300 p-1.5">
                            {row.description}
                            {hasMeasurements && (
                              <span className="text-[10px] text-blue-500 mr-1">
                                ({row.measurements.length} שורות מדידה)
                              </span>
                            )}
                          </td>
                          <td className="border border-slate-300 p-1.5 text-center">{row.unit}</td>
                          <td className="border border-slate-300 p-1.5 text-center">
                            {row.contractQuantity?.toLocaleString()}
                          </td>
                          <td className="border border-slate-300 p-1.5 text-center font-bold">
                            {row.currentQuantity?.toLocaleString()}
                          </td>
                          <td className="border border-slate-300 p-1.5 text-center">
                            {row.unitPrice?.toLocaleString()}
                          </td>
                          <td className="border border-slate-300 p-1.5 font-bold">
                            {formatCurrency(row.totalAmount || 0)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td
                            className="border border-slate-300 p-2 font-bold"
                            colSpan={row.isSummary ? 6 : 7}
                          >
                            {row.description}
                          </td>
                          {row.isSummary && (
                            <td className="border border-slate-300 p-2 font-bold">
                              {formatCurrency(row.totalAmount || 0)}
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                    {/* Expanded measurement sheet */}
                    {isExpanded && hasMeasurements && (
                      <tr>
                        <td colSpan={7} className="bg-blue-50/30 border border-slate-300 p-0">
                          <div className="p-3">
                            <div className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1">
                              <Layers size={12} /> דף ריכוז כמויות — {row.code} {row.description}
                            </div>
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="bg-blue-100/60 text-slate-700">
                                  <th className="border border-blue-200 p-1.5 w-8">#</th>
                                  <th className="border border-blue-200 p-1.5">חשבון</th>
                                  <th className="border border-blue-200 p-1.5 w-1/4">תיאור</th>
                                  <th className="border border-blue-200 p-1.5">מיקום</th>
                                  <th className="border border-blue-200 p-1.5">כמות</th>
                                  <th className="border border-blue-200 p-1.5">% חלקי</th>
                                  <th className="border border-blue-200 p-1.5">סה"כ</th>
                                  <th className="border border-blue-200 p-1.5">הערות</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.measurements.map((m: any, mIdx: number) => (
                                  <tr
                                    key={m.id || mIdx}
                                    className="hover:bg-blue-50/50 border-b border-blue-100"
                                  >
                                    <td className="border border-blue-200 p-1 text-center text-slate-400">
                                      {mIdx + 1}
                                    </td>
                                    <td className="border border-blue-200 p-1 text-center">
                                      {m.billNumber ? `#${m.billNumber}` : '-'}
                                    </td>
                                    <td className="border border-blue-200 p-1">{m.description}</td>
                                    <td className="border border-blue-200 p-1">{m.location}</td>
                                    <td className="border border-blue-200 p-1 text-center font-medium">
                                      {m.quantity?.toLocaleString()}
                                    </td>
                                    <td className="border border-blue-200 p-1 text-center">
                                      {m.partialPercentage != null
                                        ? `${m.partialPercentage}%`
                                        : '100%'}
                                    </td>
                                    <td className="border border-blue-200 p-1 text-center font-bold">
                                      {m.total?.toLocaleString()}
                                    </td>
                                    <td className="border border-blue-200 p-1 text-slate-500">
                                      {m.remarks || ''}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="bg-blue-100/40 font-bold">
                                  <td
                                    colSpan={6}
                                    className="border border-blue-200 p-1.5 text-left"
                                  >
                                    סה"כ מדידות
                                  </td>
                                  <td className="border border-blue-200 p-1.5 text-center">
                                    {row.measurements
                                      .reduce((s: number, m: any) => s + (m.total || 0), 0)
                                      .toLocaleString()}
                                  </td>
                                  <td className="border border-blue-200 p-1.5"></td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Bill Approval Modal — review submitted bill and approve quantities per item
const BillApprovalModal: React.FC<{
  bill: Bill;
  approvedQuantities: Record<string, number>;
  setApprovedQuantities: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  config: BillingStyleConfig;
  onApprove: () => void;
  onClose: () => void;
}> = ({ bill, approvedQuantities, setApprovedQuantities, config: _config, onApprove, onClose }) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  // Per-measurement-row approved quantities: key = `${itemId}::${measurementId}`
  const [rowApprovedQtys, setRowApprovedQtys] = useState<Record<string, number>>(() => {
    // Initialize from measurement rows' approvedQuantity or total
    const init: Record<string, number> = {};
    bill.items.forEach((item) => {
      if (item.measurements?.length > 0) {
        item.measurements.forEach((m) => {
          const key = `${item.id}::${m.id}`;
          init[key] = m.approvedQuantity ?? m.total ?? 0;
        });
      }
    });
    return init;
  });
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0,
    }).format(val);

  const toggleItem = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateQty = (itemId: string, value: number) => {
    setApprovedQuantities((prev) => ({ ...prev, [itemId]: value }));
  };

  const updateRowQty = (itemId: string, measurementId: string, value: number) => {
    const key = `${itemId}::${measurementId}`;
    setRowApprovedQtys((prev) => ({ ...prev, [key]: value }));
  };

  // Sync row-level approved totals → parent item approved quantities (via useEffect to avoid setState-during-render)
  useEffect(() => {
    const updates: Record<string, number> = {};
    bill.items.forEach((item) => {
      if (item.measurements?.length) {
        const total = item.measurements.reduce((sum, m) => {
          const rowKey = `${item.id}::${m.id}`;
          return sum + (rowApprovedQtys[rowKey] ?? m.total ?? 0);
        }, 0);
        updates[item.id] = total;
      }
    });
    if (Object.keys(updates).length > 0) {
      setApprovedQuantities((prev) => ({ ...prev, ...updates }));
    }
  }, [rowApprovedQtys, bill.items, setApprovedQuantities]);

  // Group items by chapter (structure.chapter)
  const chapters = useMemo(() => {
    const map = new Map<string, BillItem[]>();
    bill.items.forEach((item) => {
      const parts = item.code.split('.');
      const chapterKey = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
      if (!map.has(chapterKey)) map.set(chapterKey, []);
      map.get(chapterKey)!.push(item);
    });
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }, [bill.items]);

  const totalApproved = useMemo(() => {
    return bill.items.reduce((sum, item) => {
      const qty = approvedQuantities[item.id] ?? 0;
      return sum + qty * item.unitPrice;
    }, 0);
  }, [bill.items, approvedQuantities]);

  const totalSubmitted = bill.currentAmount;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 text-white rounded-t-2xl flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl font-bold">אישור חשבון #{bill.number}</h3>
            <p className="text-green-100 text-sm">
              תקופה: {bill.period} | סטטוס: {bill.status === 'submitted' ? 'הוגש' : 'טיוטה'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-left">
              <p className="text-green-100 text-xs">מוגש</p>
              <p className="font-bold text-lg">{formatCurrency(totalSubmitted)}</p>
            </div>
            <div className="text-left bg-white/20 rounded-xl px-4 py-2">
              <p className="text-green-100 text-xs">מאושר</p>
              <p className="font-bold text-lg">{formatCurrency(totalApproved)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Items Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-300 p-2 w-10"></th>
                <th className="border border-slate-300 p-2 text-right">קוד</th>
                <th className="border border-slate-300 p-2 text-right w-1/4">תיאור</th>
                <th className="border border-slate-300 p-2 text-center">יחידה</th>
                <th className="border border-slate-300 p-2 text-center">כמות חוזה</th>
                <th className="border border-slate-300 p-2 text-center">כמות מוגשת</th>
                <th className="border border-slate-300 p-2 text-center bg-green-50 font-bold">
                  כמות מאושרת
                </th>
                <th className="border border-slate-300 p-2 text-center">מחיר יחידה</th>
                <th className="border border-slate-300 p-2 text-center bg-green-50 font-bold">
                  סכום מאושר
                </th>
              </tr>
            </thead>
            <tbody>
              {chapters.map(([chapterKey, items]) => {
                const chapterApproved = items.reduce(
                  (s, it) => s + (approvedQuantities[it.id] ?? 0) * it.unitPrice,
                  0
                );
                return (
                  <React.Fragment key={chapterKey}>
                    <tr className="bg-slate-50 border-t-2 border-slate-300">
                      <td colSpan={8} className="p-2 font-bold text-slate-700">
                        פרק {chapterKey}
                      </td>
                      <td className="border border-slate-300 p-2 font-bold text-green-700 text-center">
                        {formatCurrency(chapterApproved)}
                      </td>
                    </tr>
                    {items.map((item) => {
                      const isExpanded = expandedItems.has(item.id);
                      const hasMeasurements = item.measurements && item.measurements.length > 0;
                      const approvedQty = approvedQuantities[item.id] ?? 0;
                      const approvedAmount = approvedQty * item.unitPrice;
                      const diff = approvedQty - item.currentQuantity;

                      return (
                        <React.Fragment key={item.id}>
                          <tr className="hover:bg-slate-50 transition border-b border-slate-100">
                            <td className="border border-slate-200 p-1.5 text-center">
                              {hasMeasurements && (
                                <button
                                  type="button"
                                  onClick={() => toggleItem(item.id)}
                                  className="text-blue-500 hover:text-blue-700"
                                >
                                  <ChevronDown
                                    size={14}
                                    className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                                  />
                                </button>
                              )}
                            </td>
                            <td className="border border-slate-200 p-1.5 font-mono text-xs">
                              {item.code}
                            </td>
                            <td className="border border-slate-200 p-1.5">
                              {item.description}
                              {hasMeasurements && (
                                <span className="text-[10px] text-blue-500 mr-1">
                                  ({item.measurements.length} מדידות)
                                </span>
                              )}
                            </td>
                            <td className="border border-slate-200 p-1.5 text-center">
                              {item.unit}
                            </td>
                            <td className="border border-slate-200 p-1.5 text-center text-slate-500">
                              {item.contractQuantity?.toLocaleString()}
                            </td>
                            <td className="border border-slate-200 p-1.5 text-center font-medium text-blue-700">
                              {item.currentQuantity?.toLocaleString()}
                            </td>
                            <td className="border border-slate-200 p-1.5 text-center bg-green-50">
                              <input
                                type="number"
                                value={approvedQty}
                                onChange={(e) =>
                                  updateQty(item.id, parseFloat(e.target.value) || 0)
                                }
                                className="w-24 text-center border border-green-300 rounded px-2 py-1 text-sm font-bold focus:ring-2 focus:ring-green-500 outline-none"
                                step="any"
                              />
                              {diff !== 0 && (
                                <span
                                  className={`block text-[10px] mt-0.5 ${diff > 0 ? 'text-green-600' : 'text-red-500'}`}
                                >
                                  {diff > 0 ? '+' : ''}
                                  {diff.toLocaleString()}
                                </span>
                              )}
                            </td>
                            <td className="border border-slate-200 p-1.5 text-center text-slate-500">
                              {item.unitPrice?.toLocaleString()}
                            </td>
                            <td className="border border-slate-200 p-1.5 text-center font-bold text-green-700 bg-green-50">
                              {formatCurrency(approvedAmount)}
                            </td>
                          </tr>
                          {/* Expanded measurement rows */}
                          {isExpanded && hasMeasurements && (
                            <tr>
                              <td colSpan={9} className="bg-blue-50/30 border border-slate-200 p-0">
                                <div className="p-3">
                                  <div className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1">
                                    <Layers size={12} /> דף ריכוז כמויות — {item.code}{' '}
                                    {item.description}
                                  </div>
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-blue-100/60 text-slate-700">
                                        <th className="border border-blue-200 p-1.5 w-8">#</th>
                                        <th className="border border-blue-200 p-1.5">תיאור</th>
                                        <th className="border border-blue-200 p-1.5">מיקום</th>
                                        <th className="border border-blue-200 p-1.5">כמות</th>
                                        <th className="border border-blue-200 p-1.5">% חלקי</th>
                                        <th className="border border-blue-200 p-1.5">סה"כ מוגש</th>
                                        <th className="border border-blue-200 p-1.5 bg-green-100 font-bold">
                                          כמות מאושרת
                                        </th>
                                        <th className="border border-blue-200 p-1.5">הערות</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {item.measurements.map((m, mIdx) => {
                                        const rowKey = `${item.id}::${m.id}`;
                                        const rowApproved = rowApprovedQtys[rowKey] ?? m.total ?? 0;
                                        return (
                                          <tr
                                            key={m.id || mIdx}
                                            className="hover:bg-blue-50/50 border-b border-blue-100"
                                          >
                                            <td className="border border-blue-200 p-1 text-center text-slate-400">
                                              {mIdx + 1}
                                            </td>
                                            <td className="border border-blue-200 p-1">
                                              {m.description}
                                            </td>
                                            <td className="border border-blue-200 p-1">
                                              {m.location}
                                            </td>
                                            <td className="border border-blue-200 p-1 text-center font-medium">
                                              {m.quantity?.toLocaleString()}
                                            </td>
                                            <td className="border border-blue-200 p-1 text-center">
                                              {m.partialPercentage != null
                                                ? `${m.partialPercentage}%`
                                                : '100%'}
                                            </td>
                                            <td className="border border-blue-200 p-1 text-center font-bold">
                                              {m.total?.toLocaleString()}
                                            </td>
                                            <td className="border border-blue-200 p-1 text-center bg-green-50">
                                              <input
                                                type="number"
                                                value={rowApproved}
                                                onChange={(e) =>
                                                  updateRowQty(
                                                    item.id,
                                                    m.id,
                                                    parseFloat(e.target.value) || 0
                                                  )
                                                }
                                                className="w-20 text-center border border-green-300 rounded px-1 py-0.5 text-xs font-bold focus:ring-2 focus:ring-green-500 outline-none"
                                                step="any"
                                              />
                                            </td>
                                            <td className="border border-blue-200 p-1 text-slate-500">
                                              {m.remarks || ''}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                      <tr className="bg-blue-100/40 font-bold">
                                        <td
                                          colSpan={5}
                                          className="border border-blue-200 p-1.5 text-left"
                                        >
                                          סה"כ מדידות
                                        </td>
                                        <td className="border border-blue-200 p-1.5 text-center">
                                          {item.measurements
                                            .reduce((s, m) => s + (m.total || 0), 0)
                                            .toLocaleString()}
                                        </td>
                                        <td className="border border-blue-200 p-1.5 text-center text-green-700">
                                          {item.measurements
                                            .reduce(
                                              (s, m) =>
                                                s +
                                                (rowApprovedQtys[`${item.id}::${m.id}`] ??
                                                  m.total ??
                                                  0),
                                              0
                                            )
                                            .toLocaleString()}
                                        </td>
                                        <td className="border border-blue-200 p-1.5"></td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-green-50 border-t-2 border-green-300">
              <tr>
                <td colSpan={5} className="p-3 font-bold text-green-800 text-lg">
                  סה"כ מאושר
                </td>
                <td className="p-3 text-center font-bold text-blue-700">
                  {formatCurrency(totalSubmitted)}
                </td>
                <td className="p-3 text-center font-bold text-green-700 text-lg">
                  {formatCurrency(totalApproved)}
                </td>
                <td className="p-3"></td>
                <td className="p-3 text-center font-bold text-green-700 text-lg">
                  {formatCurrency(totalApproved)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex justify-between items-center shrink-0 bg-slate-50 rounded-b-2xl">
          <div className="text-sm text-slate-500">
            {totalApproved !== totalSubmitted && (
              <span className={totalApproved < totalSubmitted ? 'text-red-600' : 'text-green-600'}>
                הפרש: {formatCurrency(totalApproved - totalSubmitted)} (
                {((totalApproved / totalSubmitted) * 100).toFixed(1)}%)
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-slate-600 hover:bg-slate-200 rounded-lg transition"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={onApprove}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold shadow-sm flex items-center gap-2"
            >
              <CheckCircle size={18} /> אשר חשבון
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingView;
