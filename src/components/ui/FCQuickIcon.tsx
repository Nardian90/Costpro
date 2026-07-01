'use client';

import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductFCStatus } from '@/contracts/product-cost-sheet';
import type { FCResolutionResult } from '@/lib/integration/fc-automation';

export interface FCQuickIconProps {
  fcStatus: ProductFCStatus;
  fcResolution?: FCResolutionResult;
  onClick?: (action: 'view_pdf' | 'generate' | 'no_template') => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function FCQuickIcon({ fcStatus, fcResolution, onClick, className, size = 'sm' }: FCQuickIconProps) {
  // Don't render if FC automation is disabled for this product
  if (fcResolution?.status === 'disabled') return null;

  // Don't render if there's no resolution data at all
  if (!fcResolution) return null;

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  // Determine label and action based on fcStatus
  const config: Record<ProductFCStatus, {
    title: string;
    ariaLabel: string;
    action: 'view_pdf' | 'generate' | 'no_template';
    iconClassName: string;
    buttonClassName: string;
    animate?: boolean;
  }> = {
    vigente: {
      title: 'Ver Ficha de Costo (PDF)',
      ariaLabel: 'Ver Ficha de Costo (PDF)',
      action: 'view_pdf',
      iconClassName: 'text-primary/60',
      buttonClassName: 'hover:bg-primary/10 hover:text-primary',
    },
    pendiente: {
      title: 'Generar Ficha de Costo',
      ariaLabel: 'Generar Ficha de Costo',
      action: 'generate',
      iconClassName: 'text-primary/60',
      buttonClassName: 'hover:bg-primary/10 hover:text-primary',
      animate: true,
    },
    sin_fc: {
      title: 'Sin plantilla FC',
      ariaLabel: 'Sin plantilla FC',
      action: 'no_template',
      iconClassName: 'text-muted-foreground/40',
      buttonClassName: 'hover:bg-muted/30',
    },
  };

  const { title, ariaLabel, action, iconClassName, buttonClassName, animate } = config[fcStatus];

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(action) : undefined}
      className={cn(
        'fc-quick-icon p-1 rounded transition-colors',
        buttonClassName,
        !onClick && 'cursor-default',
        className,
      )}
      title={title}
      aria-label={ariaLabel}
    >
      <FileText
        className={cn(
          iconSize,
          iconClassName,
          animate && 'animate-pulse',
        )}
      />
    </button>
  );
}
