'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { BookOpen, X, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Product } from '@/types';
import { formatDate } from '@/lib/utils';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { toast } from 'sonner';

interface KardexEntry {
  created_at: string;
  movement_type: string;
  quantity_change: number;
  entry: number;
  exit: number;
  running_balance: number;
  reference_id: string | null;
}

interface KardexModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function KardexModal({ product, isOpen, onClose }: KardexModalProps) {
  const [entries, setEntries] = useState<KardexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 25;

  const fetchKardex = useCallback(async (p: number) => {
    if (!product?.id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        pageSize: pageSize.toString(),
        page: p.toString(),
      });

      const res = await fetch(`/api/inventory/${product.id}/history?${params}`);
      if (!res.ok) throw new Error('Error al cargar Kardex');

      const result = await res.json();

      // Map to kardex format
      const kardexEntries: KardexEntry[] = (result.data || []).map((item: any) => ({
        created_at: item.timestamp || item.created_at,
        movement_type: item.movementType || item.movement_type,
        quantity_change: item.quantityChange || item.quantity_change || 0,
        entry: Math.max(0, item.quantityChange ?? item.quantity_change ?? 0),
        exit: Math.min(0, item.quantityChange ?? item.quantity_change ?? 0) * -1,
        running_balance: item.running_balance || 0,
        reference_id: item.reference_id || null,
      }));

      // Calculate running balance
      let balance = (product.stock_current || 0);
      // We go from bottom to top to calculate historical balances
      // Since data comes newest first, reverse to oldest first
      const reversed = [...kardexEntries].reverse();
      for (let i = 0; i < reversed.length; i++) {
        balance -= reversed[i].quantity_change;
        reversed[i].running_balance = balance;
      }
      // Reverse back
      const withBalance = reversed.reverse();

      setEntries(withBalance);
      setTotalPages(result.pagination?.totalPages || 1);
      setTotalItems(result.pagination?.totalItems || 0);
    } catch (err: any) {
      toast.error(err?.message || 'Error al cargar el Kardex');
    } finally {
      setLoading(false);
    }
  }, [product?.id, product?.stock_current]);

  useEffect(() => {
    if (isOpen && product) {
      setPage(1);
      fetchKardex(1);
    }
  }, [isOpen, product, fetchKardex]);

  // Export CSV
  const handleExport = useCallback(() => {
    if (entries.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const headers = ['Fecha', 'Tipo', 'Entrada', 'Salida', 'Saldo', 'Referencia'];
    const rows = entries.map(e => [
      formatDate(e.created_at),
      e.movement_type === 'sale' ? 'Venta' : e.movement_type === 'purchase' ? 'Compra' : e.movement_type === 'adjustment' ? 'Ajuste' : e.movement_type,
      e.entry.toString(),
      e.exit.toString(),
      e.running_balance.toString(),
      e.reference_id || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kardex_${product?.sku || 'producto'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Kardex exportado');
  }, [entries, product?.sku]);

  if (!product) return null;

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-primary" />
          <div>
            <span className="text-base">Kardex</span>
            <span className="text-xs font-bold text-muted-foreground ml-2">{product.name}</span>
            <span className="text-xs font-mono text-muted-foreground/60 ml-1">({product.sku})</span>
          </div>
        </div>
      }
      maxWidth="sm:max-w-3xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-muted-foreground">
            {totalItems} movimiento{totalItems !== 1 ? 's' : ''}
            {totalPages > 1 && ` — Pág. ${page}/${totalPages}`}
          </div>
          <div className="flex gap-2">
            <SecondaryButton onClick={handleExport} label="Exportar CSV" icon={Download} className="gap-1.5" />
            <SecondaryButton onClick={onClose} label="Cerrar" />
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Current stock header */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Stock Actual</div>
            <div className="text-2xl font-black text-primary">{product.stock_current || 0}</div>
          </div>
          <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/10 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Costo Prom.</div>
            <div className="text-sm font-bold text-green-600">{(product.cost_average || product.cost_price || 0).toFixed(2)}</div>
          </div>
          <div className="p-3 rounded-xl bg-muted/50 border border-border text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor Total</div>
            <div className="text-sm font-bold">{((product.stock_current || 0) * (product.cost_average || product.cost_price || 0)).toFixed(2)}</div>
          </div>
        </div>

        {/* Kardex Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-right">Entrada</th>
                <th className="px-3 py-2 text-right">Salida</th>
                <th className="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" />
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="font-bold">Sin movimientos registrados</p>
                  </td>
                </tr>
              ) : (
                entries.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-[11px]">{formatDate(entry.created_at)}</td>
                    <td className="px-3 py-2">
                      <span className={
                        entry.movement_type === 'sale' ? 'text-primary' :
                        entry.movement_type === 'purchase' ? 'text-green-600' : 'text-amber-600'
                      }>
                        {entry.movement_type === 'sale' ? 'Venta' :
                         entry.movement_type === 'purchase' ? 'Compra' : 'Ajuste'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-green-600">
                      {entry.entry > 0 ? `+${entry.entry}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-destructive">
                      {entry.exit > 0 ? `-${entry.exit}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-black">{entry.running_balance}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <SecondaryButton
              label=""
              icon={ChevronLeft}
              onClick={() => { setPage(p => Math.max(1, p - 1)); fetchKardex(Math.max(1, page - 1)); }}
              disabled={page <= 1}
              className="px-2"
            />
            <span className="flex items-center text-xs font-bold text-muted-foreground">
              {page} / {totalPages}
            </span>
            <SecondaryButton
              label=""
              icon={ChevronRight}
              onClick={() => { setPage(p => Math.min(totalPages, p + 1)); fetchKardex(Math.min(totalPages, page + 1)); }}
              disabled={page >= totalPages}
              className="px-2"
            />
          </div>
        )}
      </div>
    </BaseModal>
  );
}
