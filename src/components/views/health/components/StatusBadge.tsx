import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'success' | 'warning' | 'destructive' | 'quarantine' | 'processing';
  label: string;
  className?: string;
}

const statusMap = {
  success: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  quarantine: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  processing: 'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className }) => {
  const translateLabel = (lbl: string) => {
    const map: Record<string, string> = {
      'success': 'Éxito',
      'warning': 'Advertencia',
      'destructive': 'Crítico',
      'quarantine': 'Cuarentena',
      'processing': 'Procesando',
      'Completado': 'Completado',
      'Crítico': 'Crítico',
      'Advertencia': 'Advertencia'
    };
    return map[lbl] || lbl;
  };

  return (
    <span className={cn(
      "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
      statusMap[status],
      className
    )}>
      {translateLabel(label)}
    </span>
  );
};
