/**
 * Toaster Component
 *
 * Global toast notifications using sonner.
 * Supports RTL layout for Hebrew.
 *
 * Note: For toast() function, import from '@/components/ui/toast-utils'
 */
import { Toaster as Sonner } from 'sonner';
import { useTranslation } from 'react-i18next';

interface ToasterProps {
  richColors?: boolean;
}

export function Toaster({ richColors = true }: ToasterProps) {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'he';

  return (
    <Sonner
      position={isRTL ? 'top-left' : 'top-right'}
      richColors={richColors}
      closeButton
      dir={isRTL ? 'rtl' : 'ltr'}
      toastOptions={{
        classNames: {
          toast: 'font-sans',
          title: 'font-medium',
          description: 'text-sm',
        },
      }}
    />
  );
}
