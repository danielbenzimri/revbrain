/**
 * Signature Pad Component
 *
 * Canvas-based signature capture with:
 * - Touch and mouse drawing support
 * - Image upload alternative
 * - Clear and save actions
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PenTool, Upload, Trash2, X, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface SignaturePadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSignature?: string | null;
  onSave: (dataUrl: string) => void | Promise<void>;
  title?: string;
  isLoading?: boolean;
}

export function SignaturePad({
  open,
  onOpenChange,
  currentSignature,
  onSave,
  title,
  isLoading = false,
}: SignaturePadProps) {
  const { t } = useTranslation('execution');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'draw' | 'upload'>('draw');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Reset state when dialog is closed
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        // Reset state before closing
        setHasDrawing(false);
        setUploadedImage(null);
        setActiveTab('draw');
      }
      onOpenChange(newOpen);
    },
    [onOpenChange]
  );

  // Initialize canvas when opened or tab changes
  useEffect(() => {
    if (open && canvasRef.current && activeTab === 'draw') {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Set canvas size based on container
        const rect = canvas.parentElement?.getBoundingClientRect();
        canvas.width = rect?.width || 400;
        canvas.height = 200;

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Drawing settings
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [open, activeTab]);

  // Get cursor position relative to canvas
  const getCursorPosition = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      let clientX: number, clientY: number;

      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    []
  );

  // Start drawing
  const startDrawing = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      setIsDrawing(true);
      const pos = getCursorPosition(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    },
    [getCursorPosition]
  );

  // Continue drawing
  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const pos = getCursorPosition(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      setHasDrawing(true);
    },
    [isDrawing, getCursorPosition]
  );

  // Stop drawing
  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Clear canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setUploadedImage(dataUrl);
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    let dataUrl: string | null = null;

    if (activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawing) return;
      dataUrl = canvas.toDataURL('image/png');
    } else if (activeTab === 'upload' && uploadedImage) {
      dataUrl = uploadedImage;
    }

    if (dataUrl) {
      await onSave(dataUrl);
      handleOpenChange(false);
    }
  }, [activeTab, hasDrawing, uploadedImage, onSave, handleOpenChange]);

  const canSave = (activeTab === 'draw' && hasDrawing) || (activeTab === 'upload' && uploadedImage);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <PenTool className="h-5 w-5" />
              {title || t('signatures.title')}
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('draw')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition flex items-center justify-center gap-2 ${
              activeTab === 'draw'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <PenTool className="h-4 w-4" />
            {t('signatures.sign')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition flex items-center justify-center gap-2 ${
              activeTab === 'upload'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Upload className="h-4 w-4" />
            {t('measurements.add')}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Current signature preview */}
          {currentSignature && (
            <div className="p-3 bg-slate-50 rounded shadow-sm border-slate-200">
              <p className="text-xs text-slate-500 mb-2">
                {t('signatures.signedBy', { name: '' })}
              </p>
              <img src={currentSignature} alt="Current signature" className="h-12 object-contain" />
            </div>
          )}

          {/* Draw Tab */}
          {activeTab === 'draw' && (
            <div>
              <p className="text-sm text-slate-600 mb-3">{t('signatures.instructions')}</p>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-1 bg-slate-50">
                <canvas
                  ref={canvasRef}
                  className="w-full h-[200px] bg-white rounded cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
              <button
                type="button"
                onClick={clearCanvas}
                className="mt-2 text-sm text-slate-500 hover:text-red-600 flex items-center gap-1 transition"
              >
                <Trash2 className="h-4 w-4" />
                {t('signatures.clear')}
              </button>
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />

              {!uploadedImage ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-[200px] border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition flex flex-col items-center justify-center gap-2 text-slate-500"
                >
                  <Upload className="h-8 w-8" />
                  <span className="text-sm">PNG, JPG, WebP</span>
                </button>
              ) : (
                <div className="border-2 border-slate-300 rounded-lg p-4 bg-white">
                  <img
                    src={uploadedImage}
                    alt="Uploaded signature"
                    className="max-h-[160px] mx-auto object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedImage(null);
                      fileInputRef.current?.click();
                    }}
                    className="mt-3 text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 mx-auto transition"
                  >
                    <Upload className="h-4 w-4" />
                    Change
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            <X className="h-4 w-4 me-1" />
            {t('actions.view')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || isLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin me-1" />
            ) : (
              <Save className="h-4 w-4 me-1" />
            )}
            {t('signatures.sign')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SignaturePad;
