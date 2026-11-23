'use client';

/**
 * SmartPurchaseOrder — «Orden de Compra Inteligente» (funcionalidad
 * preservada de StoreDashboardView, misión §1: no eliminar funcionalidades).
 *
 * Misma lógica y fórmulas: recomendación de reposición con cobertura de 30
 * días sobre el ritmo de venta real del período analizado
 * (cantidad_recomendada = venta_diaria × 30 − stock_actual; priorización
 * crítico ≤7d → urgente ≤14d → normal). Única diferencia: presentación
 * sobria y nota explícita de que es una PROPUESTA para evaluar (no crea la
 * OC automáticamente — el botón final lleva a Órdenes de Compra).
 */

import React, { useMemo, useState } from 'react';
import { Zap, ChevronRight, CheckCircle2, BookOpen, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { BaseModal } from '@/components/ui/BaseModal';
import { useUIStore } from '@/store';
import type { StoreAnalytics } from '@/hooks/api/useStoreAnalytics';

interface SmartPOItem {
  product_id: string;
  name: string;
  sku: string | null;
  stock_current: number;
  avg_daily_sales: number;
  days_until_out: number | null;
  recommended_qty: number;
  stock_needed_30d: number;
  urgency: 'critical' | 'warning' | 'normal';
  reason: string;
}

export function SmartPurchaseOrder({ analytics }: { analytics: StoreAnalytics }) {
  const [showModal, setShowModal] = useState(false);
  const [generated, setGenerated] = useState(false);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const recommendedItems: SmartPOItem[] = useMemo(() => {
    const periodDays = Math.max(1, analytics.period_days);
    const stockMap = new Map<string, number>();
    for (const ls of analytics.low_stock) stockMap.set(ls.product_id, ls.stock_current);
    for (const sm of analytics.slow_movers) {
      if (!stockMap.has(sm.product_id)) stockMap.set(sm.product_id, sm.stock_current);
    }
    for (const os of analytics.overstock) {
      if (!stockMap.has(os.product_id)) stockMap.set(os.product_id, os.stock_current);
    }

    return analytics.top_products_revenue
      .map((p) => {
        const avgDaily = p.quantity / periodDays;
        const stockCurrent = stockMap.get(p.product_id) ?? 0;
        const stockNeeded30d = Math.ceil(avgDaily * 30);
        const daysUntilOut = avgDaily > 0 ? Math.round(stockCurrent / avgDaily) : null;
        const recommendedQty = Math.max(0, stockNeeded30d - stockCurrent);
        let urgency: 'critical' | 'warning' | 'normal' = 'normal';
        if (daysUntilOut !== null && daysUntilOut <= 7) urgency = 'critical';
        else if (daysUntilOut !== null && daysUntilOut <= 14) urgency = 'warning';
        const needsReplenish = avgDaily > 0 && recommendedQty > 0;
        let reason = '';
        if (urgency === 'critical') {
          reason = `Se agota en ${daysUntilOut}d. Vende ${avgDaily.toFixed(1)}/día. Reposición prioritaria.`;
        } else if (urgency === 'warning') {
          reason = `Cobertura ${daysUntilOut}d. Vende ${avgDaily.toFixed(1)}/día. Reponer pronto.`;
        } else if (needsReplenish) {
          reason = `Vende ${avgDaily.toFixed(1)}/día. Para 30d de cobertura: ${stockNeeded30d} uds.`;
        } else {
          reason = 'Stock suficiente para 30+ días.';
        }
        return {
          product_id: p.product_id,
          name: p.name,
          sku: p.sku,
          stock_current: stockCurrent,
          avg_daily_sales: avgDaily,
          days_until_out: daysUntilOut,
          recommended_qty: recommendedQty,
          stock_needed_30d: stockNeeded30d,
          urgency,
          reason,
        };
      })
      .filter((item) => item.avg_daily_sales > 0 && item.recommended_qty > 0)
      .sort((a, b) => {
        const urgencyOrder = { critical: 0, warning: 1, normal: 2 } as const;
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return b.recommended_qty - a.recommended_qty;
      })
      .slice(0, 15);
  }, [analytics]);

  const totalUnits = recommendedItems.reduce((s, i) => s + i.recommended_qty, 0);
  const criticalCount = recommendedItems.filter((i) => i.urgency === 'critical').length;

  const handleEvaluate = () => {
    setGenerated(true);
    toast.success(`Propuesta evaluada: ${recommendedItems.length} productos, ${totalUnits} unidades recomendadas`);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card p-3.5 flex-wrap" data-testid="executive-smart-po">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground leading-tight">Orden de Compra Inteligente</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Propuesta de reposición con 30 días de cobertura según el ritmo de venta real del período.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="shrink-0 px-4 py-2.5 min-h-[44px] rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1.5"
        aria-label="Evaluar propuesta de orden de compra"
      >
        <Zap className="w-3.5 h-3.5" aria-hidden />
        Evaluar propuesta
      </button>

      {showModal && (
        <BaseModal
          open={showModal}
          onOpenChange={() => { setShowModal(false); setGenerated(false); }}
          aria-label="Orden de Compra Inteligente"
          title={
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" aria-hidden />
              <span className="text-base font-black uppercase tracking-tight">Orden de Compra Inteligente</span>
            </div>
          }
          description="Propuesta basada en el ritmo de venta real del período — revisa cada item antes de crear la OC"
          maxWidth="sm:max-w-2xl"
          footer={
            <div className="flex items-center justify-between gap-3 w-full">
              <p className="text-xs text-muted-foreground">
                {recommendedItems.length} productos · {totalUnits} unidades · {criticalCount} críticos
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setGenerated(false); }}
                  className="px-4 min-h-[44px] py-2.5 border border-border rounded-xl font-medium text-sm hover:bg-muted transition-colors"
                >
                  Cerrar
                </button>
                {generated ? (
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setCurrentView('purchase-orders'); }}
                    className="px-4 min-h-[44px] py-2.5 bg-primary text-primary-foreground font-medium rounded-xl hover:bg-primary/90 transition-colors text-sm flex items-center gap-1.5"
                  >
                    Ir a Órdenes de Compra
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEvaluate}
                    className="px-4 min-h-[44px] py-2.5 bg-primary text-primary-foreground font-medium rounded-xl hover:bg-primary/90 transition-colors text-sm flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" aria-hidden />
                    Generar propuesta
                  </button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex gap-2">
              <BookOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
              <div className="text-xs text-foreground/80 leading-relaxed space-y-1">
                <p><strong className="text-primary">Cómo funciona:</strong> identifica productos con venta real y calcula las unidades para 30 días de cobertura.</p>
                <p><strong className="text-primary">Fórmula:</strong> cantidad_recomendada = (venta_diaria × 30) − stock_actual</p>
                <p><strong className="text-primary">Priorización:</strong> crítico (≤7 días) → urgente (≤14 días) → normal (15-30 días). Solo productos con rotación.</p>
              </div>
            </div>

            {recommendedItems.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success" aria-hidden />
                <p className="text-sm font-bold text-success uppercase tracking-wider">Todo bien</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No hay productos que requieran reposición: el stock cubre 30+ días para todo lo que rota.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {recommendedItems.map((item) => (
                  <div
                    key={item.product_id}
                    className={cn(
                      'rounded-xl border p-3',
                      item.urgency === 'critical' && 'border-destructive/30 bg-destructive/5',
                      item.urgency === 'warning' && 'border-warning/30 bg-warning/5',
                      item.urgency === 'normal' && 'border-border/50 bg-card',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-foreground truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.sku || 'Sin SKU'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-lg tabular-nums text-primary">{item.recommended_qty}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">uds</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{item.reason}</p>
                      <span
                        className={cn(
                          'text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border shrink-0',
                          item.urgency === 'critical' && 'text-destructive border-destructive/30 bg-destructive/5',
                          item.urgency === 'warning' && 'text-warning border-warning/30 bg-warning/5',
                          item.urgency === 'normal' && 'text-muted-foreground border-border/50 bg-card',
                        )}
                      >
                        {item.urgency === 'critical' ? 'CRÍTICO' : item.urgency === 'warning' ? 'URGENTE' : 'NORMAL'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">Cobertura:</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            item.urgency === 'critical' ? 'bg-destructive' : item.urgency === 'warning' ? 'bg-warning' : 'bg-success',
                          )}
                          style={{ width: `${Math.min(100, ((item.days_until_out ?? 0) / 30) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-black tabular-nums text-muted-foreground shrink-0">
                        {item.days_until_out ?? '∞'}d / 30d
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </BaseModal>
      )}
    </div>
  );
}
