/**
 * Bill Measurement Modal Component
 *
 * Full-page modal for managing bill item measurements matching legacy layout:
 * - Header with item details
 * - Measurement rows table
 * - Add/remove rows
 * - Cumulative calculations
 * - Print functionality
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Save, Printer, Trash2, Lock } from 'lucide-react';
import { useAppDialog } from '@/contexts/AppDialogContext';
import {
  useAddMeasurement,
  useDeleteMeasurement,
  useMeasurements,
  type BillItem,
  type BillWithItems,
} from '../hooks/use-execution-bills';

// ============================================================================
// TYPES
// ============================================================================

interface ProjectMetadata {
  name?: string;
  contractNumber?: string;
  contractorName?: string;
  clientName?: string;
  logoContractorUrl?: string;
  logoClientUrl?: string;
}

interface BillMeasurementModalProps {
  item: BillItem;
  bill: BillWithItems;
  projectData?: ProjectMetadata;
  readOnly?: boolean;
  onClose: () => void;
}

interface LocalMeasurement {
  id: string;
  location: string;
  quantity: number;
  remarks: string;
  isNew: boolean;
  isDeleting?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BillMeasurementModal({
  item,
  bill,
  projectData,
  readOnly = false,
  onClose,
}: BillMeasurementModalProps) {
  const { t } = useTranslation('execution');
  const dialog = useAppDialog();

  // Data
  const { data: measurements = [], isLoading } = useMeasurements(item.id);

  // Mutations
  const addMeasurement = useAddMeasurement();
  const deleteMeasurement = useDeleteMeasurement();

  // Local state for new rows
  const [localRows, setLocalRows] = useState<LocalMeasurement[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Combined rows (existing + new)
  const allRows = useMemo(() => {
    const existingRows: LocalMeasurement[] = measurements.map((m) => ({
      id: m.id,
      location: m.location || '',
      quantity: m.quantity,
      remarks: m.remarks || '',
      isNew: false,
    }));
    return [...existingRows, ...localRows];
  }, [measurements, localRows]);

  // Calculate totals
  const totalQuantity = allRows.reduce((sum, r) => sum + r.quantity, 0);

  // Handlers
  const handleAddRow = () => {
    setLocalRows([
      ...localRows,
      {
        id: `new-${Date.now()}`,
        location: '',
        quantity: 0,
        remarks: '',
        isNew: true,
      },
    ]);
  };

  const handleUpdateLocalRow = (
    id: string,
    field: keyof LocalMeasurement,
    value: string | number
  ) => {
    setLocalRows(localRows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleDeleteLocalRow = (id: string) => {
    setLocalRows(localRows.filter((r) => r.id !== id));
  };

  const handleDeleteExistingRow = async (measurementId: string) => {
    if (
      !(await dialog.confirm(
        t('confirmDeleteMeasurement') || 'האם אתה בטוח שברצונך למחוק שורה זו?'
      ))
    )
      return;
    try {
      await deleteMeasurement.mutateAsync({
        measurementId,
        itemId: item.id,
        billId: bill.id,
      });
    } catch (error) {
      console.error('Failed to delete measurement:', error);
    }
  };

  const handleSaveAndClose = async () => {
    if (localRows.length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      // Save all new rows
      for (const row of localRows) {
        if (row.quantity > 0) {
          await addMeasurement.mutateAsync({
            itemId: item.id,
            billId: bill.id,
            data: {
              location: row.location || null,
              quantity: row.quantity,
              remarks: row.remarks || null,
            },
          });
        }
      }
      onClose();
    } catch (error) {
      console.error('Failed to save measurements:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Running cumulative calculation
  let runningTotal = 0;
  const rowsWithCumulative = allRows.map((r) => {
    runningTotal += r.quantity;
    return { ...r, cumulative: runningTotal };
  });

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white shadow-2xl w-full max-w-[95vw] h-[95vh] flex flex-col animate-in zoom-in-95 duration-200 border-t-8 border-blue-600">
        {/* Header */}
        <div className="p-2 bg-slate-100 border-b border-slate-300 flex justify-between items-center print:hidden">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-slate-600 hover:text-slate-800 font-medium"
            >
              {t('close') || 'סגור'}
            </button>
            {!readOnly && (
              <button
                onClick={handleSaveAndClose}
                disabled={isSaving}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 font-bold shadow-sm disabled:opacity-50"
              >
                <Save size={16} />
                {t('saveAndClose') || 'שמור וצא'}
              </button>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded text-sm hover:bg-slate-50"
            >
              <Printer size={16} />
              {t('print') || 'הדפס'}
            </button>
          </div>
          <div className="text-sm text-slate-500">
            {t('editMeasurementSheet') || 'עריכת דף ריכוז כמויות'} - {t('bill') || 'חשבון'} #
            {bill.billNumber}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-100 p-8" dir="rtl">
          <div
            className="bg-white mx-auto shadow-lg min-h-[1000px] max-w-[1200px] p-8 text-black text-right print-content"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            {/* Header with logos */}
            <div className="flex justify-between items-start mb-6 border-b-2 border-black pb-4">
              <div className="w-48 h-20 bg-slate-50 border border-slate-200 flex items-center justify-center">
                {projectData?.logoContractorUrl ? (
                  <img
                    src={projectData.logoContractorUrl}
                    alt="Contractor"
                    className="max-h-full max-w-full"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-xs text-slate-400">
                    {t('contractorLogo') || 'לוגו קבלן'}
                  </span>
                )}
              </div>
              <div className="text-center flex-1 px-4">
                <h1 className="text-xl font-bold underline mb-1">
                  {t('projectTitle', { name: projectData?.name || '' }) ||
                    `פרויקט "${projectData?.name || ''}" - חוזה ${projectData?.contractNumber || ''}`}
                </h1>
                <h2 className="text-lg font-bold">
                  {t('quantitySummaryForItem') || "ריכוז כמויות עבור סעיף מס'"}:{' '}
                  <span className="underline">{item.boqCode}</span>
                </h2>
              </div>
              <div className="w-48 h-20 bg-slate-50 border border-slate-200 flex items-center justify-center">
                {projectData?.logoClientUrl ? (
                  <img
                    src={projectData.logoClientUrl}
                    alt="Client"
                    className="max-h-full max-w-full"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-xs text-slate-400">{t('clientLogo') || 'לוגו מזמין'}</span>
                )}
              </div>
            </div>

            {/* Item details */}
            <div className="border-2 border-black mb-6">
              <div className="flex text-center font-bold bg-slate-100 border-b border-black">
                <div className="w-32 border-l border-black p-1">{t('itemCode') || "סעיף מס'"}</div>
                <div className="flex-1 border-l border-black p-1">
                  {t('itemDescription') || 'תיאור הסעיף'}
                </div>
                <div className="w-20 border-l border-black p-1">{t('unit') || "יח'"}</div>
                <div className="w-32 p-1">{t('contractQuantity') || 'כמות חוזה'}</div>
              </div>
              <div className="flex text-center font-medium">
                <div className="w-32 border-l border-black p-2" dir="ltr">
                  {item.boqCode}
                </div>
                <div className="flex-1 border-l border-black p-2 text-right pr-4">
                  {item.description}
                </div>
                <div className="w-20 border-l border-black p-2">{item.unit || '-'}</div>
                <div className="w-32 p-2">-</div>
              </div>
            </div>

            {/* Measurements table */}
            <table className="w-full border-collapse border border-black text-sm">
              <thead className="bg-slate-100 text-center font-bold">
                <tr>
                  <th className="border border-black p-1 w-8 print:hidden"></th>
                  <th className="border border-black p-1 w-16">{t('billNumber') || "מס' חשבון"}</th>
                  <th className="border border-black p-1 w-12">{t('sheetNumber') || 'דף מספר'}</th>
                  <th className="border border-black p-1">
                    {t('workDescription') || 'תאור העבודה (מיקום/חישוב)'}
                  </th>
                  <th className="border border-black p-1 w-24">
                    {t('calculatedQuantity') || 'כמות מחושבת'}
                  </th>
                  <th className="border border-black p-1 w-20 bg-yellow-50">
                    {t('toPay') || 'לשלם'}
                  </th>
                  <th className="border border-black p-1 w-20 bg-slate-100">
                    {t('cumulative') || 'מצטברת'}
                  </th>
                  <th className="border border-black p-1 w-32">
                    {t('inspectorRemarks') || 'הערות מפקח'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      {t('loading') || 'טוען...'}
                    </td>
                  </tr>
                ) : rowsWithCumulative.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      {t('noMeasurements') || 'אין שורות מדידה. לחץ על "הוסף שורה" כדי להתחיל.'}
                    </td>
                  </tr>
                ) : (
                  rowsWithCumulative.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={row.isNew ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50'}
                    >
                      <td className="border border-black p-1 text-center print:hidden">
                        {!readOnly && row.isNew ? (
                          <button
                            onClick={() => handleDeleteLocalRow(row.id)}
                            className="text-slate-300 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : !readOnly && !row.isNew ? (
                          <button
                            onClick={() => handleDeleteExistingRow(row.id)}
                            className="text-slate-300 hover:text-red-500"
                            disabled={deleteMeasurement.isPending}
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </td>

                      {/* Bill Number */}
                      <td className="border border-black p-1 text-center">
                        <div className="flex flex-col items-center justify-center leading-tight py-1">
                          {row.isNew ? (
                            <span className="font-bold text-blue-600">{bill.billNumber}</span>
                          ) : (
                            <span className="font-bold flex items-center gap-1">
                              <Lock size={10} /> {bill.billNumber}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sheet Number */}
                      <td className="border border-black p-1 text-center">{idx + 1}</td>

                      {/* Location/Description */}
                      <td className="border border-black p-1">
                        {row.isNew ? (
                          <input
                            type="text"
                            className="w-full bg-transparent outline-none font-medium text-right focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1"
                            value={row.location}
                            onChange={(e) =>
                              handleUpdateLocalRow(row.id, 'location', e.target.value)
                            }
                            placeholder={t('locationPlaceholder') || 'תיאור העבודה...'}
                          />
                        ) : (
                          <span className="font-medium">{row.location || '-'}</span>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="border border-black p-1 text-center">
                        {row.isNew ? (
                          <input
                            type="number"
                            className="w-full bg-transparent outline-none text-center font-bold focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1"
                            value={row.quantity || ''}
                            onChange={(e) =>
                              handleUpdateLocalRow(
                                row.id,
                                'quantity',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            placeholder="0"
                          />
                        ) : (
                          <span className="font-bold">{row.quantity.toFixed(2)}</span>
                        )}
                      </td>

                      {/* To Pay */}
                      <td className="border border-black p-1 text-center font-bold bg-yellow-50">
                        {row.quantity.toFixed(2)}
                      </td>

                      {/* Cumulative */}
                      <td className="border border-black p-1 text-center bg-slate-100 font-medium text-slate-600">
                        {row.cumulative.toFixed(2)}
                      </td>

                      {/* Remarks */}
                      <td className="border border-black p-1">
                        {row.isNew ? (
                          <input
                            type="text"
                            className="w-full bg-transparent outline-none text-center text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1"
                            value={row.remarks}
                            onChange={(e) =>
                              handleUpdateLocalRow(row.id, 'remarks', e.target.value)
                            }
                            placeholder={t('remarksPlaceholder') || 'הערות...'}
                          />
                        ) : (
                          <span className="text-xs">{row.remarks || '-'}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}

                {/* Add Row Button */}
                {!readOnly && (
                  <tr className="print:hidden bg-slate-50">
                    <td colSpan={8} className="border border-black p-2 text-center">
                      <button
                        onClick={handleAddRow}
                        className="text-blue-600 hover:underline text-sm font-bold flex items-center justify-center gap-1 w-full"
                      >
                        <Plus size={14} />
                        {t('addMeasurementRow') ||
                          `הוסף שורת מדידה לחשבון נוכחי (#${bill.billNumber})`}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Footer with totals */}
              <tfoot className="bg-green-100 border-t-2 border-black font-bold">
                <tr>
                  <td colSpan={5} className="border border-black p-2 text-left pl-4">
                    {t('totalCumulativeQuantity') || 'סה"כ כמות מצטברת לחשבון זה (מוגש)'}:
                  </td>
                  <td className="border border-black p-2 text-center text-lg">
                    {totalQuantity.toFixed(2)}
                  </td>
                  <td colSpan={2} className="border border-black p-2"></td>
                </tr>
              </tfoot>
            </table>

            {/* Signatures Section */}
            <div className="mt-8 flex justify-between items-end border-t border-black pt-4">
              {/* Contractor Signature */}
              <div className="text-sm">
                <div className="font-bold">{t('contractorSignature') || 'חתימת המודד/קבלן'}:</div>
                <div className="h-10 border-b border-slate-400 w-48 mb-2"></div>
                <div>{t('name') || 'שם'}: ________________</div>
              </div>

              {/* Project Stamp */}
              <div className="text-sm text-center">
                <div className="font-bold mb-8">{t('projectStamp') || 'חותמת הפרויקט'}</div>
              </div>

              {/* Inspector Signature */}
              <div className="text-sm">
                <div className="font-bold">{t('inspectorApproval') || 'אישור המפקח/מזמין'}:</div>
                <div className="h-10 border-b border-slate-400 w-48 mb-2"></div>
                <div>{t('date') || 'תאריך'}: ________________</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
