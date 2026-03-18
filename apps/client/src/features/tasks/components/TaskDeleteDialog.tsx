/**
 * TaskDeleteDialog Component
 *
 * Delete confirmation dialog matching the legacy layout:
 * - Warning icon and message
 * - Reason textarea
 * - Signature canvas for authorization
 * - Clear signature button
 * - Cancel and confirm buttons
 */
import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Task } from '../hooks/use-tasks';

interface TaskDeleteDialogProps {
  open: boolean;
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, signatureUrl?: string) => Promise<void>;
  isLoading: boolean;
}

export function TaskDeleteDialog({
  open,
  task,
  onOpenChange,
  onConfirm,
  isLoading,
}: TaskDeleteDialogProps) {
  const { t } = useTranslation('tasks');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [reason, setReason] = useState('');

  // Reset state when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setReason('');
      clearSignature();
    }
    onOpenChange(isOpen);
  };

  // Get coordinates from mouse or touch event
  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { offsetX: 0, offsetY: 0 };

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
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
    };
  };

  // Start drawing
  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const { offsetX, offsetY } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
  };

  // Draw
  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { offsetX, offsetY } = getCoordinates(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
  };

  // Stop drawing
  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Clear signature
  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Handle confirm
  const handleConfirm = async () => {
    let signatureUrl: string | undefined;
    if (canvasRef.current) {
      signatureUrl = canvasRef.current.toDataURL();
    }
    await onConfirm(reason, signatureUrl);
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="bg-red-100 p-3 rounded-full text-red-600 shrink-0">
              <AlertCircle size={24} />
            </div>
            <div>
              <DialogTitle className="text-lg">{t('delete.title')}</DialogTitle>
              <p
                className="text-sm text-slate-600 mt-1"
                dangerouslySetInnerHTML={{
                  __html: t('delete.message', { title: task.title }),
                }}
              />
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">{t('delete.reasonLabel')}</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('delete.reasonPlaceholder')}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Signature Canvas */}
          <div className="space-y-2">
            <Label>{t('delete.signatureLabel')}</Label>
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50 relative">
              <canvas
                ref={canvasRef}
                width={400}
                height={150}
                className="w-full touch-none cursor-crosshair bg-white"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              <button
                onClick={clearSignature}
                className="absolute top-2 start-2 text-xs bg-white/80 hover:bg-white border border-slate-200 px-2 py-1 rounded text-slate-600"
              >
                {t('delete.clearSignature')}
              </button>
            </div>
            <p className="text-xs text-slate-500">{t('delete.signatureHint')}</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('delete.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading && <Loader2 size={16} className="me-2 animate-spin" />}
            {t('delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
