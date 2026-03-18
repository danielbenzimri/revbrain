/**
 * BOQ Import Sheet
 *
 * A slide-out sheet for importing BOQ items from Excel files.
 * Features:
 * - Drag and drop file upload
 * - Import options (replace/merge, column mapping)
 * - Import progress and results
 */
import { useState, useCallback } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useImportBOQ, type ImportOptions, type ImportResult } from '../hooks/use-boq';

interface BOQImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSuccess?: () => void;
}

type ImportStep = 'select' | 'configure' | 'importing' | 'result';

export function BOQImportSheet({ open, onOpenChange, projectId, onSuccess }: BOQImportSheetProps) {
  const importMutation = useImportBOQ();

  const [step, setStep] = useState<ImportStep>('select');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [options, setOptions] = useState<ImportOptions>({
    replace: false,
    startRow: 2,
    codeColumns: ['A', 'B', 'C', 'D'],
    columns: {
      description: 'E',
      unit: 'F',
      quantity: 'G',
      unitPrice: 'H',
    },
  });
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && /\.xlsx?$/i.test(droppedFile.name)) {
      setFile(droppedFile);
      setStep('configure');
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStep('configure');
    }
  }, []);

  const handleImport = async () => {
    if (!file) return;

    setStep('importing');
    try {
      const importResult = await importMutation.mutateAsync({
        projectId,
        file,
        options,
      });

      setResult(importResult);
      setStep('result');

      if (importResult.success) {
        onSuccess?.();
      }
    } catch (err) {
      setResult({
        success: false,
        imported: 0,
        errors: [{ row: 0, message: (err as Error).message || 'שגיאה בלתי צפויה' }],
        items: [],
      });
      setStep('result');
    }
  };

  const handleClose = () => {
    // Reset state on close
    setStep('select');
    setFile(null);
    setResult(null);
    onOpenChange(false);
  };

  const handleBack = () => {
    if (step === 'configure') {
      setStep('select');
      setFile(null);
    } else if (step === 'result') {
      setStep('select');
      setFile(null);
      setResult(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
        <SheetHeader>
          <SheetTitle>ייבוא כתב כמויות</SheetTitle>
          <SheetDescription>קבצי Excel (.xlsx, .xls) נתמכים</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Step 1: Select File */}
          {step === 'select' && (
            <div className="space-y-4">
              {/* Format instructions */}
              <div className="bg-blue-50 p-3 text-xs text-blue-800 border border-blue-100 rounded-lg flex items-start gap-2">
                <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">הנחיות לפורמט טעינה (Excel):</span>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>
                      עמודות A, B, C, D: מרכיבות את מספר הסעיף (מבנה, פרק, תת-פרק, מס&apos; סעיף).
                      אלו יאוחדו לקוד אחד (לדוגמה: 01.02.01.010).
                    </li>
                    <li>עמודה E: תיאור הסעיף</li>
                    <li>עמודה F: יחידת מידה</li>
                    <li>עמודה G: כמות חוזה</li>
                    <li>עמודה H: מחיר יחידה</li>
                  </ul>
                </div>
              </div>

              <div
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                  isDragging
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-neutral-300 hover:border-blue-400'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto h-12 w-12 text-neutral-400 mb-4" />
                <p className="text-sm text-neutral-600 mb-2">גרור קובץ לכאן או לחץ לבחירה</p>
                <p className="text-xs text-neutral-400 mb-4">קבצי Excel (.xlsx, .xls)</p>
                <label className="inline-block">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button variant="outline" asChild>
                    <span className="cursor-pointer">בחר קובץ</span>
                  </Button>
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Configure Options */}
          {step === 'configure' && file && (
            <div className="space-y-6">
              {/* Selected File */}
              <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-xs text-neutral-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>

              {/* Format instructions */}
              <div className="bg-blue-50 p-3 text-xs text-blue-800 border border-blue-100 rounded-lg flex items-start gap-2">
                <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">הנחיות לפורמט טעינה:</span>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>עמודות A-D: מרכיבות את מספר הסעיף (לדוגמה: 01.02.01.010)</li>
                    <li>עמודה E: תיאור | עמודה F: יחידה | עמודה G: כמות | עמודה H: מחיר</li>
                  </ul>
                </div>
              </div>

              {/* Import Options */}
              <div className="space-y-4">
                <h4 className="font-medium">הגדרות ייבוא</h4>

                {/* Replace Mode */}
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="replace"
                    checked={options.replace}
                    onCheckedChange={(checked) =>
                      setOptions((prev) => ({ ...prev, replace: checked === true }))
                    }
                  />
                  <div>
                    <Label htmlFor="replace" className="cursor-pointer">
                      החלף סעיפים קיימים
                    </Label>
                    <p className="text-xs text-neutral-500">
                      מחק את כל הסעיפים הקיימים והחלף בנתונים מהקובץ
                    </p>
                  </div>
                </div>

                {/* Start Row */}
                <div className="space-y-2">
                  <Label htmlFor="startRow">שורת התחלה</Label>
                  <Input
                    id="startRow"
                    type="number"
                    min={1}
                    value={options.startRow}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, startRow: parseInt(e.target.value) || 2 }))
                    }
                    className="w-24"
                  />
                  <p className="text-xs text-neutral-500">
                    שורה 1 בדרך כלל היא כותרות — התחל משורה 2
                  </p>
                </div>

                {/* Column Mapping */}
                <div className="space-y-3">
                  <Label>מיפוי עמודות</Label>
                  <p className="text-xs text-neutral-500">התאם את העמודות בקובץ שלך</p>

                  {/* Code columns (A-D) */}
                  <div>
                    <Label className="text-xs font-bold">מספר סעיף (מרכיבי קוד)</Label>
                    <div className="grid grid-cols-4 gap-2 mt-1">
                      {(options.codeColumns || ['A', 'B', 'C', 'D']).map((col, idx) => (
                        <div key={idx}>
                          <Label className="text-[10px] text-neutral-400">
                            {idx === 0 ? 'מבנה' : idx === 1 ? 'פרק' : idx === 2 ? 'תת-פרק' : 'סעיף'}
                          </Label>
                          <Input
                            value={col}
                            onChange={(e) => {
                              const newCols = [...(options.codeColumns || ['A', 'B', 'C', 'D'])];
                              newCols[idx] = e.target.value.toUpperCase();
                              setOptions((prev) => ({ ...prev, codeColumns: newCols }));
                            }}
                            className="text-center uppercase"
                            maxLength={2}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Data columns */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">תיאור</Label>
                      <Input
                        value={options.columns?.description || 'E'}
                        onChange={(e) =>
                          setOptions((prev) => ({
                            ...prev,
                            columns: {
                              ...prev.columns,
                              description: e.target.value.toUpperCase(),
                            },
                          }))
                        }
                        className="text-center uppercase"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">יחידה</Label>
                      <Input
                        value={options.columns?.unit || 'F'}
                        onChange={(e) =>
                          setOptions((prev) => ({
                            ...prev,
                            columns: { ...prev.columns, unit: e.target.value.toUpperCase() },
                          }))
                        }
                        className="text-center uppercase"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">כמות</Label>
                      <Input
                        value={options.columns?.quantity || 'G'}
                        onChange={(e) =>
                          setOptions((prev) => ({
                            ...prev,
                            columns: { ...prev.columns, quantity: e.target.value.toUpperCase() },
                          }))
                        }
                        className="text-center uppercase"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">מחיר יחידה</Label>
                      <Input
                        value={options.columns?.unitPrice || 'H'}
                        onChange={(e) =>
                          setOptions((prev) => ({
                            ...prev,
                            columns: { ...prev.columns, unitPrice: e.target.value.toUpperCase() },
                          }))
                        }
                        className="text-center uppercase"
                        maxLength={2}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack}>
                  חזור
                </Button>
                <Button onClick={handleImport} className="flex-1">
                  ייבא כתב כמויות
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="py-12 text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-500 mb-4" />
              <p className="text-neutral-600">מעבד את הקובץ...</p>
            </div>
          )}

          {/* Step 4: Result */}
          {step === 'result' && result && (
            <div className="space-y-6">
              {/* Success/Failure Banner */}
              <div
                className={cn(
                  'flex items-center gap-3 p-4 rounded-lg',
                  result.success ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
                )}
              >
                {result.success ? (
                  <CheckCircle className="h-6 w-6" />
                ) : (
                  <AlertCircle className="h-6 w-6" />
                )}
                <div>
                  <p className="font-medium">
                    {result.success ? 'הייבוא הושלם בהצלחה' : 'שגיאה בייבוא'}
                  </p>
                  <p className="text-sm">
                    {`יובאו ${result.imported} סעיפים`}
                    {result.errors.length > 0 && ` — ${result.errors.length} שגיאות`}
                  </p>
                </div>
              </div>

              {/* Error Details */}
              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-red-700">פרטי שגיאות</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {result.errors.map((error, idx) => (
                      <div key={idx} className="text-sm p-2 bg-red-50 rounded text-red-700">
                        <span className="font-mono">{error.row > 0 && `שורה ${error.row}: `}</span>
                        {error.code && <span className="font-medium">[{error.code}] </span>}
                        {error.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack}>
                  ייבא שוב
                </Button>
                <Button onClick={handleClose} className="flex-1">
                  סיום
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default BOQImportSheet;
