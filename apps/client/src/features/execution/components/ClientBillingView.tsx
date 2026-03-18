// ClientBillingView.tsx
// Read-only billing view for Client users (מזמין)
// Shows Submitted Bills, Approved Bills, and Supplier Bills tabs
// Inspector can edit approvedQuantity and remarks fields

/* eslint-disable react-hooks/immutability, @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from 'react';
import { useAppDialog } from '@/contexts/AppDialogContext';
import {
  FileText,
  CheckCircle,
  Send,
  Lock,
  Printer,
  FileDigit,
  Save,
  Edit,
  Eye,
} from 'lucide-react';
import type {
  Bill,
  BillItem,
  BOQItem,
  MeasurementRow,
  ProjectMetadata,
  ApprovedBillEntry,
  BillingStyleConfig,
  QuantityPage,
  User,
} from '../types';
import { DEFAULT_BILLING_CONFIG } from '../constants';

interface ClientBillingViewProps {
  bills: Bill[];
  boqItems: BOQItem[];
  projectData: ProjectMetadata;
  approvedBills: ApprovedBillEntry[];
  onUpdateApprovedBills?: (bills: ApprovedBillEntry[]) => void;
  onUpdateBills?: (bills: Bill[]) => void;
  quantityPages: QuantityPage[];
  currentUser: User;
  // Inspector can update approved quantities
  onUpdateBillMeasurements?: (
    billId: string,
    itemId: string,
    measurements: MeasurementRow[]
  ) => void;
}

type ClientTab = 'submitted' | 'approved' | 'suppliers';

const ClientBillingView: React.FC<ClientBillingViewProps> = ({
  bills,
  projectData,
  approvedBills,
  onUpdateApprovedBills,
  onUpdateBills,
  currentUser,
  onUpdateBillMeasurements,
}) => {
  const dialog = useAppDialog();
  const [activeTab, setActiveTab] = useState<ClientTab>('submitted');
  // Local state for bills to track edits
  const [localBills, setLocalBills] = useState<Bill[]>(() => bills);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [selectedItem, setSelectedItem] = useState<BillItem | null>(null);
  const [config] = useState<BillingStyleConfig>(() => DEFAULT_BILLING_CONFIG);

  // Update measurements in local bills state
  const handleLocalUpdateMeasurements = (
    billId: string,
    itemId: string,
    measurements: MeasurementRow[]
  ) => {
    setLocalBills((prev) =>
      prev.map((bill) => {
        if (bill.id !== billId) return bill;
        return {
          ...bill,
          items: bill.items.map((item) => {
            if (item.id !== itemId) return item;
            return { ...item, measurements };
          }),
        };
      })
    );
    // Also update selectedBill if it's the one being edited
    if (selectedBill?.id === billId) {
      setSelectedBill((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) => {
                if (item.id !== itemId) return item;
                return { ...item, measurements };
              }),
            }
          : null
      );
    }
    // Also update selectedItem if it's the one being edited
    if (selectedItem?.id === itemId) {
      setSelectedItem((prev) => (prev ? { ...prev, measurements } : null));
    }
  };

  // Check if current user is an inspector (can approve quantities)
  const isInspector =
    currentUser?.role === 'reviewer' ||
    currentUser?.role === 'org_owner' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'system_admin';

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 2,
    }).format(val);

  // Generate bill periods map for display
  const billPeriodsMap = useMemo(() => {
    const map: Record<number, string> = {};
    bills.forEach((b) => {
      map[b.number] = b.period;
    });
    return map;
  }, [bills]);

  // Calculate table data with hierarchical grouping
  const getTableData = (bill: Bill) => {
    const items = [...bill.items].sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
    );
    const rows: any[] = [];

    let curStruct = '';
    let curChapter = '';
    let curSubchap = '';
    let sumSubK = 0,
      sumChapK = 0,
      sumStructK = 0,
      totalK = 0;

    const pushSummary = (title: string, amount: number, type: string) => {
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
  };

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

  // Handle inspector updating approved quantity
  const handleUpdateApprovedQuantity = (
    billId: string,
    itemId: string,
    measurementId: string,
    value: number
  ) => {
    if (!isInspector) return;

    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;

    const item = bill.items.find((i) => i.id === itemId);
    if (!item) return;

    const updatedMeasurements = item.measurements.map((m) =>
      m.id === measurementId ? { ...m, approvedQuantity: value } : m
    );

    if (onUpdateBillMeasurements) {
      onUpdateBillMeasurements(billId, itemId, updatedMeasurements);
    }
  };

  // ============ RENDER ============

  return (
    <div className="animate-in fade-in duration-500 min-w-0">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">מעקב חשבונות - צד מזמין</h2>
          <p className="text-sm text-slate-500">צפייה בחשבונות מוגשים, מאושרים וחשבונות ספקים</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600 bg-blue-50 px-3 py-1.5 rounded-lg">
          <Lock size={14} />
          {isInspector ? 'מפקח - יכול לאשר כמויות' : 'צפייה בלבד'}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => {
            setActiveTab('submitted');
            setSelectedBill(null);
          }}
          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition ${
            activeTab === 'submitted'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <Send size={16} className="inline ml-2" />
          חשבונות מוגשים ({bills.filter((b) => b.status === 'submitted').length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('approved');
            setSelectedBill(null);
          }}
          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition ${
            activeTab === 'approved'
              ? 'bg-white text-green-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <CheckCircle size={16} className="inline ml-2" />
          חשבונות מאושרים ({approvedBills.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('suppliers');
            setSelectedBill(null);
          }}
          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition ${
            activeTab === 'suppliers'
              ? 'bg-white text-purple-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <FileText size={16} className="inline ml-2" />
          חשבונות ספקים
        </button>
      </div>

      {/* SUBMITTED BILLS TAB */}
      {activeTab === 'submitted' && !selectedBill && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-100">
              <tr>
                <th className="p-4 font-semibold">מס' חשבון</th>
                <th className="p-4 font-semibold">תקופה</th>
                <th className="p-4 font-semibold">תאריך הגשה</th>
                <th className="p-4 font-semibold">סכום מוגש</th>
                <th className="p-4 font-semibold">סטטוס</th>
                <th className="p-4 font-semibold">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bills.filter((b) => b.status === 'submitted').length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    <Send size={32} className="mx-auto mb-2 opacity-50" />
                    <p>אין חשבונות מוגשים לבדיקה</p>
                  </td>
                </tr>
              ) : (
                localBills
                  .filter((b) => b.status === 'submitted')
                  .map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-50 transition">
                      <td className="p-4 font-bold text-slate-800">#{bill.number}</td>
                      <td className="p-4">{bill.period}</td>
                      <td className="p-4 text-slate-500">{bill.date}</td>
                      <td className="p-4 font-medium text-blue-700">
                        {formatCurrency(bill.currentAmount)}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            bill.status === 'approved'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {bill.status === 'approved' ? 'אושר' : 'ממתין לבדיקה'}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => setSelectedBill(bill)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                        >
                          <Eye size={14} /> צפה ובדוק
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* BILL DETAIL VIEW (for submitted bills) */}
      {activeTab === 'submitted' && selectedBill && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Bill Header */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedBill(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition"
              >
                ← חזור
              </button>
              <div>
                <h3 className="text-lg font-bold text-slate-800">חשבון #{selectedBill.number}</h3>
                <p className="text-sm text-slate-500">
                  תקופה: {selectedBill.period} | תאריך: {selectedBill.date}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isInspector && (
                <>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded font-medium">
                    <Edit size={12} className="inline ml-1" />
                    ניתן לעריכת כמויות מאושרות
                  </span>
                  <button
                    onClick={() => {
                      // Calculate chapter breakdown from bill items - using APPROVED quantities
                      const chapterBreakdown: { [chapter: string]: number } = {};
                      selectedBill.items.forEach((item) => {
                        const parts = item.code.split('.');
                        if (parts.length >= 2) {
                          const chapter = parts[1];
                          // Calculate approved amount from measurements
                          const approvedQty =
                            item.measurements?.reduce(
                              (sum, m) => sum + (m.approvedQuantity ?? m.quantity),
                              0
                            ) ?? item.currentQuantity;
                          const discount = item.discount || 0;
                          const approvedAmount =
                            approvedQty * item.unitPrice * (1 - discount / 100);
                          chapterBreakdown[chapter] =
                            (chapterBreakdown[chapter] || 0) + approvedAmount;
                        }
                      });

                      // Add bill to approved bills
                      if (onUpdateApprovedBills) {
                        // Total approved amount is sum of all chapter approved amounts
                        const totalApprovedAmount = Object.values(chapterBreakdown).reduce(
                          (sum, amount) => sum + amount,
                          0
                        );
                        const newApproved: ApprovedBillEntry = {
                          billNumber: selectedBill.number,
                          approvalDate: new Date().toISOString().split('T')[0],
                          approvedAmount: totalApprovedAmount,
                          notes: `אושר ע"י ${currentUser?.name || 'מפקח'}`,
                          chapterBreakdown,
                        };
                        onUpdateApprovedBills([...approvedBills, newApproved]);
                      }

                      // Update bill status to approved - persist to App.tsx
                      if (onUpdateBills) {
                        const updatedBills = bills.map((b) =>
                          b.id === selectedBill.id ? { ...b, status: 'approved' as const } : b
                        );
                        onUpdateBills(updatedBills);
                      }
                      // Also update local state for immediate UI feedback
                      setLocalBills((prev) =>
                        prev.map((b) =>
                          b.id === selectedBill.id ? { ...b, status: 'approved' as const } : b
                        )
                      );

                      setSelectedBill(null);
                      dialog.alert('החשבון אושר בהצלחה!');
                    }}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition font-bold shadow-sm"
                  >
                    <CheckCircle size={18} />
                    אשר חשבון
                  </button>
                </>
              )}
              <span className="font-bold text-lg text-blue-700">
                {formatCurrency(selectedBill.currentAmount)}
              </span>
            </div>
          </div>

          {/* Bill Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right border-collapse">
              <thead className="bg-slate-100 text-slate-700 text-xs uppercase font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3 border border-slate-300">קוד סעיף</th>
                  <th className="p-3 border border-slate-300 min-w-[300px]">תיאור סעיף</th>
                  <th className="p-3 border border-slate-300">יח'</th>
                  <th className="p-3 border border-slate-300">כמות חוזה</th>
                  <th className="p-3 border border-slate-300 bg-slate-200">כמות קודמת</th>
                  <th className="p-3 border border-slate-300 bg-blue-50 text-blue-800">
                    לחשבון זה
                  </th>
                  <th className="p-3 border border-slate-300 bg-green-50 text-green-800">
                    מצטבר מוגש
                  </th>
                  {/* Inspector columns */}
                  <th className="p-3 border border-slate-300 bg-yellow-50 text-yellow-800">
                    כמות מאושרת
                  </th>
                  <th className="p-3 border border-slate-300">מחיר יח'</th>
                  <th className="p-3 border border-slate-300">סה"כ</th>
                  <th className="p-3 border border-slate-300 bg-emerald-100 text-emerald-800 font-bold">
                    סה"כ מאושר
                  </th>
                  <th className="p-3 border border-slate-300">דף ריכוז</th>
                </tr>
              </thead>
              <tbody>
                {getTableData(selectedBill).map((row, idx) => {
                  const style = getRowStyle(row);
                  return (
                    <tr key={idx} className="border-b border-slate-200" style={style}>
                      {row.isItem ? (
                        <>
                          <td className="p-2 border border-slate-200 font-mono text-xs font-semibold">
                            {row.code}
                          </td>
                          <td className="p-2 border border-slate-200 font-medium">
                            {row.description}
                          </td>
                          <td className="p-2 border border-slate-200 text-center">{row.unit}</td>
                          <td className="p-2 border border-slate-200">
                            {row.contractQuantity?.toLocaleString() || 0}
                          </td>
                          <td className="p-2 border border-slate-200 bg-slate-50">
                            {row.previousQuantity?.toLocaleString() || 0}
                          </td>
                          <td className="p-2 border border-slate-200 bg-blue-50 font-bold text-blue-700">
                            {(row.currentQuantity - row.previousQuantity).toLocaleString()}
                          </td>
                          <td className="p-2 border border-slate-200 bg-green-50 font-bold text-green-800">
                            {row.currentQuantity?.toLocaleString() || 0}
                          </td>
                          {/* Inspector editable column */}
                          <td className="p-2 border border-slate-200 bg-yellow-50">
                            {isInspector ? (
                              <span className="font-bold text-yellow-700">
                                {row.measurements?.reduce(
                                  (s: number, m: MeasurementRow) => s + (m.approvedQuantity || 0),
                                  0
                                ) || '-'}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-2 border border-slate-200">
                            {row.unitPrice?.toLocaleString() || 0}
                          </td>
                          <td className="p-2 border border-slate-200 font-bold">
                            {formatCurrency(row.totalAmount || 0)}
                          </td>
                          {/* Approved Total = approved qty × unit price × (1 - discount) */}
                          <td className="p-2 border border-slate-200 bg-emerald-50 font-bold text-emerald-800">
                            {(() => {
                              const approvedQty =
                                row.measurements?.reduce(
                                  (s: number, m: MeasurementRow) => s + (m.approvedQuantity || 0),
                                  0
                                ) || 0;
                              const unitPrice = row.unitPrice || 0;
                              const discount = row.discount || 0; // discount as percentage (e.g., 10 for 10%)
                              const approvedTotal = approvedQty * unitPrice * (1 - discount / 100);
                              return approvedQty > 0 ? formatCurrency(approvedTotal) : '-';
                            })()}
                          </td>
                          <td className="p-2 border border-slate-200 text-center">
                            <button
                              onClick={() => setSelectedItem(row)}
                              className="p-1.5 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition border border-indigo-200 text-xs px-2"
                            >
                              <FileDigit size={14} className="inline ml-1" />
                              צפה
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 border" colSpan={row.isSummary ? 9 : 11}>
                            {row.description}
                          </td>
                          {row.isSummary && (
                            <td className="p-3 border font-bold text-left pl-4" colSpan={2}>
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
      )}

      {/* APPROVED BILLS TAB */}
      {activeTab === 'approved' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CheckCircle size={20} className="text-green-600" />
              חשבונות מאושרים
            </h3>
          </div>

          {approvedBills.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle size={40} className="mx-auto mb-3 opacity-50" />
              <p className="text-lg">אין חשבונות מאושרים</p>
            </div>
          ) : (
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-3 font-semibold">מס' חשבון</th>
                  <th className="p-3 font-semibold">סכום חוזי</th>
                  <th className="p-3 font-semibold">סכום חריגים</th>
                  <th className="p-3 font-semibold">סה"כ מאושר</th>
                  <th className="p-3 font-semibold">תאריך אישור</th>
                  <th className="p-3 font-semibold">הערות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...approvedBills]
                  .sort((a, b) => a.billNumber - b.billNumber)
                  .map((ab) => (
                    <tr key={ab.billNumber} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-800">#{ab.billNumber}</td>
                      <td className="p-3 font-medium text-slate-700">
                        {formatCurrency(ab.contractAmount || 0)}
                      </td>
                      <td className="p-3 font-medium text-purple-600">
                        {formatCurrency(ab.exceptionalAmount || 0)}
                      </td>
                      <td className="p-3 font-bold text-green-700">
                        {formatCurrency(ab.approvedAmount)}
                      </td>
                      <td className="p-3 text-slate-500">{ab.approvalDate}</td>
                      <td className="p-3 text-slate-500 text-xs">{ab.notes || '-'}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot className="bg-green-50 border-t-2 border-green-200">
                <tr>
                  <td className="p-3 font-bold text-green-800">סה"כ מאושר</td>
                  <td className="p-3 font-bold text-green-700" colSpan={5}>
                    {formatCurrency(approvedBills.reduce((s, ab) => s + ab.approvedAmount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* SUPPLIERS TAB (Placeholder) */}
      {activeTab === 'suppliers' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <FileText size={48} className="mx-auto mb-4 text-slate-300" />
          <h3 className="text-lg font-bold text-slate-700 mb-2">חשבונות ספקים</h3>
          <p className="text-slate-500">
            מודול זה בפיתוח - יאפשר ניהול חשבונות מתכננים, יועצים וספקים
          </p>
        </div>
      )}

      {/* MEASUREMENT SHEET MODAL (Read-only with inspector edit for approved) */}
      {selectedItem && selectedBill && (
        <MeasurementViewModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          billNumber={selectedBill.number}
          billPeriods={billPeriodsMap}
          projectData={projectData}
          isInspector={isInspector}
          currentUser={currentUser}
          onUpdateApproved={(measurementId, value) => {
            handleUpdateApprovedQuantity(selectedBill.id, selectedItem.id, measurementId, value);
          }}
          onSaveDraft={(measurements) => {
            // Update local state to persist changes
            handleLocalUpdateMeasurements(selectedBill.id, selectedItem.id, measurements);
          }}
          onApproveItem={(measurements) => {
            // Save measurements
            handleLocalUpdateMeasurements(selectedBill.id, selectedItem.id, measurements);
            // Close item view and go back to bill
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
};

// ============ MEASUREMENT VIEW MODAL (Read-only with inspector approval) ============
interface ApprovalInfo {
  approvedBy: string;
  approvedDate: string;
  signature: string;
}

interface MeasurementViewModalProps {
  item: BillItem;
  onClose: () => void;
  billNumber: number;
  billPeriods: Record<number, string>;
  projectData: ProjectMetadata;
  isInspector: boolean;
  onUpdateApproved: (measurementId: string, value: number) => void;
  currentUser?: User;
  onApproveItem?: (measurements: MeasurementRow[], approvalInfo: ApprovalInfo) => void;
  onSaveDraft?: (measurements: MeasurementRow[]) => void;
}

const MeasurementViewModal: React.FC<MeasurementViewModalProps> = ({
  item,
  onClose,
  billNumber,
  billPeriods,
  projectData,
  isInspector,
  currentUser,
  onApproveItem,
  onSaveDraft,
}) => {
  const dialog = useAppDialog();
  // Local state for editable values
  const [localMeasurements, setLocalMeasurements] = useState<MeasurementRow[]>(() =>
    item.measurements.map((m) => ({ ...m }))
  );
  const [isApproved, setIsApproved] = useState(false);
  const [approvalDate, setApprovalDate] = useState<string | null>(null);

  // Update local measurement
  const updateLocalRow = (id: string, field: 'approvedQuantity' | 'remarks', value: any) => {
    setLocalMeasurements((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  let runningTotal = 0;
  const rowsWithCumulative = localMeasurements.map((r) => {
    runningTotal += r.total;
    return { ...r, cumulativeCalculated: runningTotal };
  });

  const totalSubmitted = localMeasurements.reduce((sum, r) => sum + r.total, 0);
  const totalApproved = localMeasurements.reduce((sum, r) => sum + (r.approvedQuantity || 0), 0);

  // Save draft - saves current values AND closes to return to bill
  const handleSaveDraft = () => {
    if (onSaveDraft) {
      onSaveDraft(localMeasurements);
    }
    dialog.alert('טיוטה נשמרה בהצלחה');
    onClose(); // Return to bill view
  };

  // Approve item - saves, adds signature, and closes
  const handleApprove = () => {
    const now = new Date().toLocaleDateString('he-IL');
    setIsApproved(true);
    setApprovalDate(now);

    if (onApproveItem) {
      onApproveItem(localMeasurements, {
        approvedBy: currentUser?.name || 'מפקח',
        approvedDate: now,
        signature: currentUser?.avatar || '',
      });
    }

    // Close modal and return to main bill view
    setTimeout(() => onClose(), 500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white shadow-2xl w-full max-w-[95vw] h-[95vh] flex flex-col animate-in zoom-in-95 duration-200 border-t-8 border-blue-600 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-3 bg-slate-100 border-b border-slate-300 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-slate-600 hover:text-slate-800 font-medium"
            >
              ← סגור
            </button>
            <div>
              <span className="font-bold text-slate-800">סעיף: {item.code}</span>
              <span className="mx-2 text-slate-400">|</span>
              <span className="text-slate-600">{item.description}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isInspector && (
              <>
                <button
                  onClick={handleSaveDraft}
                  className="flex items-center gap-1 bg-slate-100 border border-slate-300 text-slate-700 px-4 py-1.5 rounded text-sm hover:bg-slate-200 font-medium"
                >
                  <Save size={16} /> שמור טיוטה
                </button>
                <button
                  onClick={handleApprove}
                  className="flex items-center gap-1 bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 font-bold shadow-sm"
                >
                  <CheckCircle size={16} /> אשר סעיף
                </button>
              </>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded text-sm hover:bg-slate-50"
            >
              <Printer size={16} /> הדפס
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-100 p-8" dir="rtl">
          <div
            className="bg-white mx-auto shadow-lg max-w-[1200px] p-8 text-black text-right"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            {/* Project Header */}
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

            {/* Item Info */}
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

            {/* Measurements Table */}
            <table className="w-full border-collapse border border-black text-sm">
              <thead className="bg-slate-100 text-center font-bold">
                <tr>
                  <th className="border border-black p-1 w-16">מס' חשבון</th>
                  <th className="border border-black p-1 w-12">דף מספר</th>
                  <th className="border border-black p-1">תאור העבודה (מיקום/חישוב)</th>
                  <th className="border border-black p-1 w-24">כמות מחושבת</th>
                  <th className="border border-black p-1 w-12">%</th>
                  <th className="border border-black p-1 w-20 bg-yellow-50">לשלם</th>
                  <th className="border border-black p-1 w-20 bg-slate-100">מצטברת</th>
                  <th className="border border-black p-1 w-24 bg-green-50">מאושרת</th>
                  <th className="border border-black p-1 w-40">הערות מפקח</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithCumulative.map((row) => {
                  const isLocked = (row.billNumber || 0) < billNumber;
                  return (
                    <tr
                      key={row.id}
                      className={`${isLocked ? 'bg-slate-50 text-slate-500' : ''} ${row.supersededBy ? 'line-through opacity-50' : ''}`}
                    >
                      <td className="border border-black p-1 text-center">
                        <div className="flex flex-col items-center">
                          <span className="font-bold flex items-center gap-1">
                            {isLocked && <Lock size={10} />} {row.billNumber}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {billPeriods[row.billNumber!] || ''}
                          </span>
                        </div>
                      </td>
                      <td className="border border-black p-1 text-center">{row.sheetId || '1'}</td>
                      <td className="border border-black p-1">{row.description}</td>
                      <td className="border border-black p-1 text-center font-bold">
                        {row.quantity}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {row.partialPercentage}%
                      </td>
                      <td className="border border-black p-1 text-center font-bold bg-yellow-50">
                        {row.total.toFixed(2)}
                      </td>
                      <td className="border border-black p-1 text-center bg-slate-100">
                        {row.cumulativeCalculated.toFixed(2)}
                      </td>
                      {/* Approved Quantity - Editable by inspector */}
                      <td className="border border-black p-1 text-center bg-green-50">
                        {isInspector ? (
                          <input
                            type="number"
                            className="w-full bg-white border border-green-300 rounded px-1 outline-none text-center text-green-700 font-bold focus:ring-2 focus:ring-green-400"
                            value={row.approvedQuantity || ''}
                            onChange={(e) =>
                              updateLocalRow(
                                row.id,
                                'approvedQuantity',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-green-700 font-bold">
                            {row.approvedQuantity || '-'}
                          </span>
                        )}
                      </td>
                      {/* Remarks - Editable by inspector */}
                      <td className="border border-black p-1 bg-amber-50">
                        {isInspector ? (
                          <input
                            type="text"
                            className="w-full bg-white border border-amber-300 rounded px-1 outline-none text-amber-700 text-xs focus:ring-2 focus:ring-amber-400"
                            value={row.remarks || ''}
                            onChange={(e) => updateLocalRow(row.id, 'remarks', e.target.value)}
                            placeholder="הערה..."
                          />
                        ) : (
                          <span className="text-amber-700 text-xs">{row.remarks || '-'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-green-100 border-t-2 border-black font-bold">
                <tr>
                  <td colSpan={5} className="border border-black p-2 text-left pl-4">
                    סה"כ כמות מצטברת (מוגש):
                  </td>
                  <td className="border border-black p-2 text-center text-lg">
                    {totalSubmitted.toFixed(2)}
                  </td>
                  <td className="border border-black p-2"></td>
                  <td className="border border-black p-2 text-center text-lg text-green-700">
                    {totalApproved.toFixed(2)}
                  </td>
                  <td className="border border-black p-2"></td>
                </tr>
              </tfoot>
            </table>

            {/* Signatures */}
            <div className="mt-8 flex justify-between items-end border-t border-black pt-4">
              <div className="text-sm">
                <div className="font-bold">חתימת המודד/קבלן:</div>
                <div className="h-10 border-b border-slate-400 w-48 mb-2"></div>
                <div>שם: ________________</div>
              </div>
              <div className="text-sm text-center">
                <div className="font-bold mb-8">חותמת הפרויקט</div>
              </div>
              <div className="text-sm">
                <div className="font-bold">אישור המפקח/מזמין:</div>
                {isApproved ? (
                  <div className="border-2 border-green-500 bg-green-50 rounded p-2 w-48 mb-2">
                    {currentUser?.avatar && (
                      <img
                        src={currentUser.avatar}
                        alt="Signature"
                        className="h-8 w-8 rounded-full mx-auto mb-1"
                      />
                    )}
                    <div className="text-center text-xs text-green-700 font-bold">
                      {currentUser?.name}
                    </div>
                    <div className="text-center text-[10px] text-green-600">{approvalDate}</div>
                  </div>
                ) : (
                  <div className="h-10 border-b border-slate-400 w-48 mb-2"></div>
                )}
                <div>תאריך: {isApproved ? approvalDate : '________________'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientBillingView;
