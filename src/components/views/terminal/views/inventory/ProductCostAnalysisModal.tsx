'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calculator, Truck, Package, Shield, FileText, TrendingUp, X, RefreshCw } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { BaseModal } from '@/components/ui/BaseModal';
import { toast } from 'sonner';

/**
 * F4: ProductCostAnalysisModal — Análisis de formación de costo por producto.
 * Muestra: Costo Base, Transporte, Manipulación, Seguro, Otros, Costo Total, % Incremento.
 */

interface ProductCostAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  storeId?: string;
  // GAP-3: Lista de productos para selector
  products?: { id: string; name: string }[];
  // GAP-3: Callback cuando se cambia de producto
  onProductChange?: (product: { id: string; name: string }) => void;
}

interface AnalysisEntry {
  receipt_id: string;
  receipt_date: string;
  quantity: number;
  unit_cost: number;
  base_cost: number;
  services: { type: string; amount: number }[];
  total_services: number;
  total_cost: number;
  unit_cost_final: number;
}

export function ProductCostAnalysisModal({
  isOpen, onClose, productId, productName, storeId, products, onProductChange,
}: ProductCostAnalysisModalProps) {
  const [data, setData] = useState<AnalysisEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnalysis = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ product_id: productId });
      if (storeId) params.set('store_id', storeId);
      const res = await fetch(`/api/received-services/analysis?${params}`);
      if (!res.ok) throw new Error('Error al cargar análisis');
      const result = await res.json();
      setData(result.data || []);
    } catch (e: any) {
      console.warn('[CostAnalysis] Error:', e.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [productId, storeId]);

  useEffect(() => {
    if (isOpen) fetchAnalysis();
  }, [isOpen, fetchAnalysis]);

  // Aggregate totals
  const totals = data.reduce((acc, entry) => {
    acc.base += entry.base_cost;
    acc.services += entry.total_services;
    acc.total += entry.total_cost;
    // By type
    for (const svc of entry.services) {
      const key = svc.type.toLowerCase();
      acc.byType[key] = (acc.byType[key] || 0) + svc.amount;
    }
    return acc;
  }, { base: 0, services: 0, total: 0, byType: {} as Record<string, number> });

  const incrementPct = totals.base > 0 ? (totals.services / totals.base) * 100 : 0;

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight">Análisis de Costos</h3>
            <p className="text-xs text-muted-foreground">{productName}</p>
          </div>
        </div>
      }
      maxWidth="sm:max-w-3xl"
    >
      <div className="space-y-6">
        {/* GAP-3: Selector de producto */}
        {products && products.length > 1 && (
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground block mb-2">Cambiar producto</label>
            <select
              value={productId}
              onChange={e => {
                const p = products.find(p => p.id === e.target.value);
                if (p && onProductChange) onProductChange(p);
              }}
              className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold min-h-[44px]"
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Analizando costos...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="py-12 text-center">
            <Package className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-sm font-bold text-muted-foreground">No hay recepciones con costos asociados</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Los servicios vinculados a recepciones aparecerán aquí</p>
          </div>
        ) : (
          <>
            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label="Costo Base" value={formatCurrency(totals.base)} icon={Package} color="text-blue-400" bg="bg-blue-500/10" />
              <SummaryCard label="Transporte" value={formatCurrency(totals.byType['transporte'] || 0)} icon={Truck} color="text-orange-400" bg="bg-orange-500/10" />
              <SummaryCard label="Manipulación" value={formatCurrency(totals.byType['manipulación'] || 0)} icon={Package} color="text-purple-400" bg="bg-purple-500/10" />
              <SummaryCard label="Seguro" value={formatCurrency(totals.byType['seguro'] || 0)} icon={Shield} color="text-cyan-400" bg="bg-cyan-500/10" />
            </div>

            {/* ── Incremento total ── */}
            <div className={cn(
              "rounded-xl p-4 border-2 flex items-center justify-between",
              incrementPct > 20 ? "bg-warning/10 border-warning/30" : "bg-primary/10 border-primary/30"
            )}>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Incremento por Costos Asociados</p>
                <p className="text-2xl font-black font-mono text-foreground">
                  +{incrementPct.toFixed(1)}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Costo Total: <span className="font-black text-primary">{formatCurrency(totals.total)}</span></p>
                <p className="text-xs text-muted-foreground">Costos Asociados: <span className="font-black text-warning">{formatCurrency(totals.services)}</span></p>
              </div>
            </div>

            {/* ── Detail by reception ── */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Detalle por Recepción</h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {data.map((entry, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-4 rounded-xl bg-muted/30 border border-border"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono text-muted-foreground">
                        {new Date(entry.receipt_date).toLocaleDateString('es-CU')}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground">
                        {entry.quantity} unidades
                      </span>
                    </div>
                    {/* Cost breakdown */}
                    <div className="space-y-1.5">
                      <CostRow label="Costo Base" amount={entry.base_cost} color="text-blue-400" />
                      {entry.services.map((svc, j) => (
                        <CostRow key={j} label={svc.type} amount={svc.amount} color="text-orange-400" />
                      ))}
                      <div className="border-t border-border/50 pt-1.5 mt-1.5">
                        <div className="flex justify-between">
                          <span className="text-xs font-black uppercase tracking-widest text-foreground">Costo Total</span>
                          <span className="text-sm font-black font-mono text-primary">{formatCurrency(entry.total_cost)}</span>
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-xs text-muted-foreground">Costo Unitario Final</span>
                          <span className="text-sm font-bold font-mono text-foreground">{formatCurrency(entry.unit_cost_final)}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </BaseModal>
  );
}

function SummaryCard({ label, value, icon: Icon, color, bg }: any) {
  return (
    <div className={cn("rounded-xl p-3 border border-border", bg)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-black font-mono text-foreground">{value}</p>
    </div>
  );
}

function CostRow({ label, amount, color }: any) {
  return (
    <div className="flex justify-between">
      <span className={cn("text-xs", color)}>{label}</span>
      <span className="text-xs font-mono font-bold text-muted-foreground">{formatCurrency(amount)}</span>
    </div>
  );
}

export default ProductCostAnalysisModal;
