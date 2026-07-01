'use client';

import React from 'react';
import { AlertTriangle, X, Package, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StockAlert } from '@/hooks/logic/useStockAlerts';
import { Product } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion, motionSafe } from '@/hooks/ui/useReducedMotion';
import { useFocusTrap } from '@/hooks/ui/useFocusTrap';

interface StockAlertsPanelProps {
  alerts: StockAlert[];
  isOpen: boolean;
  onClose: () => void;
  onReceive: (product: Product) => void;
}

/**
 * Slide-in panel for stock alerts.
 *
 * This component is the panel-only version — no FAB.
 * The FAB / trigger is handled externally (e.g. InventoryFab).
 *
 * Props:
 *  - `isOpen` / `onClose`: controlled open state
 *  - `alerts`: array of stock alerts to display
 *  - `onReceive`: callback when user clicks "Recibir" on an alert
 */
export default function StockAlertsPanel({ alerts, isOpen, onClose, onReceive }: StockAlertsPanelProps) {
  const prefersReduced = useReducedMotion();
  const panelRef = useFocusTrap(isOpen);

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  // Close on Escape
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            {...motionSafe(prefersReduced, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } })}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            {...motionSafe(prefersReduced, {
              initial: { x: '100%' },
              animate: { x: 0 },
              exit: { x: '100%' },
              transition: { type: 'spring', damping: 25, stiffness: 200 } as any
            })}
            ref={panelRef}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-card border-l border-border shadow-xl flex flex-col"
            role="dialog"
            aria-label="Panel de alertas de stock"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-black text-sm uppercase tracking-tight">Alertas de Stock</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {criticalCount > 0 && `${criticalCount} agotado(s)`}
                  {criticalCount > 0 && warningCount > 0 && ' · '}
                  {warningCount > 0 && `${warningCount} en mínimo`}
                </p>
              </div>
              <button type="button"
                onClick={onClose}
                aria-label="Cerrar panel de alertas"
                className="w-11 h-11 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              {alerts.map(alert => (
                <div
                  key={alert.product.id}
                  className={cn(
                    'p-4 rounded-xl border',
                    alert.severity === 'critical'
                      ? 'bg-destructive/5 border-destructive/20'
                      : 'bg-warning/5 border-warning/20'
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Package className={cn(
                        'w-4 h-4 flex-shrink-0',
                        alert.severity === 'critical' ? 'text-destructive' : 'text-warning'
                      )} />
                      <span className="font-black text-xs uppercase tracking-tight line-clamp-1">
                        {alert.product.name}
                      </span>
                    </div>
                    <span className={cn(
                      'text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded flex-shrink-0',
                      alert.severity === 'critical'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-warning/10 text-warning'
                    )}>
                      {alert.severity === 'critical' ? 'Agotado' : 'En mínimo'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Stock: <strong className="tabular-nums">{alert.currentStock}</strong>
                      {alert.minStock > 0 && <span> / Mín: <strong className="tabular-nums">{alert.minStock}</strong></span>}
                    </span>
                    <button type="button"
                      onClick={() => { onReceive(alert.product); onClose(); }}
                      aria-label={`Recibir mercancía para ${alert.product.name}`}
                      className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:underline min-h-[44px] px-3"
                    >
                      Recibir <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
