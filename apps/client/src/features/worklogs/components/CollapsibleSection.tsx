/**
 * CollapsibleSection Component
 *
 * Matches legacy WorkLogsView CollapsibleSection exactly
 */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded shadow-sm border-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex justify-between items-center bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 hover:from-slate-100 hover:to-slate-150 transition"
      >
        <h3 className="text-lg font-bold text-slate-700">{title}</h3>
        <ChevronRight
          size={20}
          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>
      {isOpen && <div className="p-4">{children}</div>}
    </div>
  );
}
