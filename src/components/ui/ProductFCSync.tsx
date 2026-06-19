'use client';

import { useState, useCallback } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAutoGenerateFC } from '@/hooks/api/useProductCostSheet';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { CostSheetSyncStatus } from '@/contracts/product-cost-sheet';

// ============================================
// Props
// ============================================

interface ProductFCSyncProps {
  productId: string;
  storeId: string;
  syncStatus: CostSheetSyncStatus;
  costPrice?: number;
  className?: string;
  compact?: boolean; // default false
}

// ============================================
// Internal state that extends CostSheetSyncStatus
// ============================================

type InternalSyncState = CostSheetSyncStatus | 'syncing';

// ============================================
// Status configuration
// ============================================

interface StatusConfig {
  icon: typeof CheckCircle2;
  label: string;
  tooltip: string;
  iconClassName: string;
  labelClassName: string;
}

const STATUS_CONFIG: Record<InternalSyncState, StatusConfig> = {
  synced: {
    icon: CheckCircle2,
    label: 'Sincronizado',
    tooltip: 'FC actualizada con el precio actual',
    iconClassName: 'text-success',
    labelClassName: 'text-success',
  },
  pending: {
    icon: Loader2,
    label: 'Calculando...',
    tooltip: 'FC siendo recalculada',
    iconClassName: 'text-warning animate-spin',
    labelClassName: 'text-warning',
  },
  conflict: {
    icon: AlertTriangle,
    label: 'Desactualizada',
    tooltip: 'El precio cambio desde la ultima FC',
    iconClassName: 'text-amber-500',
    labelClassName: 'text-amber-500',
  },
  syncing: {
    icon: Loader2,
    label: 'Sincronizando...',
    tooltip: 'Sincronizando FC con el precio actual',
    iconClassName: 'text-primary animate-spin',
    labelClassName: 'text-primary',
  },
};

// ============================================
// Component
// ============================================

export function ProductFCSync({
  productId,
  storeId,
  syncStatus,
  costPrice,
  className,
  compact = false,
}: ProductFCSyncProps) {
  // Internal state allows overriding the visual state during sync operations
  const [internalState, setInternalState] = useState<InternalSyncState>(syncStatus);
  const [flashClass, setFlashClass] = useState<string>('');

  const autoGenerate = useAutoGenerateFC();

  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4';

  // Sync internal state with prop changes
  const currentState: InternalSyncState =
    internalState === 'syncing' ? internalState : syncStatus;

  const config = STATUS_CONFIG[currentState];
  const Icon = config.icon;

  // Flash animation helper
  const triggerFlash = useCallback((success: boolean) => {
    const flashColor = success
      ? 'bg-success/20 outline-success/40'
      : 'bg-red-500/20 outline-red-500/40';
    setFlashClass(flashColor);
    const timer = setTimeout(() => setFlashClass(''), 600);
    return () => clearTimeout(timer);
  }, []);

  // Handle manual recalculation
  const handleRecalc = useCallback(async () => {
    setInternalState('syncing');
    try {
      await autoGenerate.mutateAsync({
        product_id: productId,
        store_id: storeId,
      });
      setInternalState('synced');
      triggerFlash(true);
    } catch {
      setInternalState('conflict');
      triggerFlash(false);
    }
  }, [autoGenerate, productId, storeId, triggerFlash]);

  // Build the content element
  const content = (
    <span
      className={cn(
        'fc-sync-compact inline-flex items-center gap-1 transition-colors duration-200 rounded-sm px-1 py-0.5 outline-none',
        flashClass && `outline-2 outline ${flashClass}`,
        className,
      )}
      aria-label={`Estado FC: ${config.label}`}
      role="status"
    >
      <Icon className={cn(iconSize, 'shrink-0', config.iconClassName)} />
      {!compact && (
        <span className={cn('text-[10px] font-semibold leading-none', config.labelClassName)}>
          {config.label}
        </span>
      )}
      {currentState === 'conflict' && !compact && (
        <button
          type="button"
          onClick={handleRecalc}
          disabled={autoGenerate.isPending}
          className={cn(
            'inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold',
            'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20',
            'transition-colors duration-200',
            'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 focus-visible:outline-none',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          aria-label="Recalcular FC"
        >
          <RefreshCw className={cn('w-2.5 h-2.5', autoGenerate.isPending && 'animate-spin')} />
          Recalcular
        </button>
      )}
      {currentState === 'conflict' && compact && (
        <button
          type="button"
          onClick={handleRecalc}
          disabled={autoGenerate.isPending}
          className={cn(
            'inline-flex items-center justify-center',
            'rounded p-0.5',
            'text-amber-500 hover:bg-amber-500/10',
            'transition-colors duration-200',
            'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 focus-visible:outline-none',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          aria-label="Recalcular FC"
        >
          <RefreshCw className={cn('w-3 h-3', autoGenerate.isPending && 'animate-spin')} />
        </button>
      )}
    </span>
  );

  // Wrap in tooltip
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {content}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <p>{config.tooltip}</p>
        {costPrice !== undefined && currentState !== 'syncing' && (
          <p className="text-[10px] opacity-70 mt-0.5">
            Costo: ${costPrice.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export default ProductFCSync;
