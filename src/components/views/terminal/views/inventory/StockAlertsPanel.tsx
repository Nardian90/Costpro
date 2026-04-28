'use client';

import React, { useState } from 'react';
import { AlertTriangle, X, Package, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StockAlert } from '@/hooks/logic/useStockAlerts';
import { Product } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

interface StockAlertsPanelProps {
  alerts: StockAlert[];
  onReceive: (product: Product) => void;
}

export default function StockAlertsPanel({ alerts, onReceive }: StockAlertsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  const fabColor = criticalCount > 0
    ? 'bg-destructive text-white shadow-destructive/30'
    : 'bg-amber-500 text-white shadow-amber-500/30';

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label={`${alerts.length} alertas de stock. ${criticalCount} críticas, ${warningCount} en mínimo`}
        className={cn(
          'fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-lg',
          'font-black text-xs uppercase tracking-widest transition-all active:scale-95',
          fabColor
        )}
      >
        <AlertTriangle className="w-4 h-4" />
        {alerts.length} alerta{alerts.length !== 1 ? 's' : ''}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
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
                <button
                  onClick={() => setIsOpen(false)}
                  aria-label="Cerrar panel de alertas"
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Lista */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {alerts.map(alert => (
                  <div
                    key={alert.product.id}
                    className={cn(
                      'p-4 rounded-xl border',
                      alert.severity === 'critical'
                        ? 'bg-destructive/5 border-destructive/20'
                        : 'bg-amber-500/5 border-amber-500/20'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Package className={cn(
                          'w-4 h-4 flex-shrink-0',
                          alert.severity === 'critical' ? 'text-destructive' : 'text-amber-500'
                        )} />
                        <span className="font-black text-xs uppercase tracking-tight line-clamp-1">
                          {alert.product.name}
                        </span>
                      </div>
                      <span className={cn(
                        'text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded flex-shrink-0',
                        alert.severity === 'critical'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-amber-500/10 text-amber-600'
                      )}>
                        {alert.severity === 'critical' ? 'Agotado' : 'En mínimo'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Stock: <strong>{alert.currentStock}</strong>
                        {alert.minStock > 0 && ` / Mín: ${alert.minStock}`}
                      </span>
                      <button
                        onClick={() => { onReceive(alert.product); setIsOpen(false); }}
                        aria-label={`Recibir mercancía para ${alert.product.name}`}
                        className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:underline"
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
    </>
  );
}
