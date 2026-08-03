'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { BookOpen, X, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Product } from '@/types';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { toast } from 'sonner';
import { useKardex, type KardexEntry } from '@/hooks/api/useKardex';

interface KardexModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function KardexModal({ product, isOpen, onClose }: KardexModalProps) {
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading, error } = useKardex(
    product?.id || null,
    undefined,
    page,
    pageSize
  );

  // FIX H-12 (Iteración 11.1): Usar running_balance directamente del RPC
  // (balance_after), que es el saldo DESPUÉS de cada movimiento calculado
  // server-side. Antes se recalculaba client-side partiendo de
  // product.stock_current hacia atrás, lo que rompía en paginación
  // (páginas 2+ mostraban saldos incorrectos porque solo usaba los items
  // de la página actual).
  const entries: KardexEntry[] = useMemo(() => {
    if (!data?.data || data.data.length === 0) return [];
    return data.data;
  }, [data]);

  const totalPages = data?.pagination?.totalPages || 1;
  const totalItems = data?.pagination?.totalItems || 0;

  // Reset page when modal opens or product changes
  const prevProductId = React.useRef<string | null>(null);

  useEffect(() => {
    if (isOpen && product?.id && prevProductId.current !== product.id) {
      prevProductId.current = product.id;
      requestAnimationFrame(() => setPage(1));
    }
  }, [isOpen, product?.id]);

  // Export CSV
  const handleExport = () => {
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
      e.reference_doc || '',
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
  };

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Stock Actual</div>
            <div className="text-2xl font-black text-primary tabular-nums">{product.stock_current || 0}</div>
          </div>
          <div className="p-3 rounded-xl bg-success/5 border border-success/10 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Costo Prom.</div>
            <div className="text-sm font-bold text-success tabular-nums">{formatCurrency(product.cost_average || product.cost_price || 0)}</div>
          </div>
          <div className="p-3 rounded-xl bg-muted/50 border border-border text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor Total</div>
            <div className="text-sm font-bold tabular-nums">{formatCurrency((product.stock_current || 0) * (product.cost_average || product.cost_price || 0))}</div>
          </div>
        </div>

        {/* Kardex Table */}
        <div className="overflow-x-auto">
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-right">Entrada</th>
                <th className="px-3 py-2 text-right">Salida</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2 text-left">Referencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-destructive font-bold">
                    Error al cargar los datos
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="font-bold">Sin movimientos registrados</p>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  // V2.2: mapa completo de movement_type con colores + etiquetas legibles
                  const mt = entry.movement_type || '';
                  const isReversal = entry.reference_type === 'reversal';
                  const MOVEMENT_INFO: Record<string, { label: string; color: string }> = {
                    sale:          { label: 'Venta',        color: 'text-primary' },
                    purchase:      { label: 'Compra',       color: 'text-success' },
                    adjustment:    { label: 'Ajuste',       color: 'text-warning' },
                    return:        { label: 'Devolución',   color: 'text-blue-500' },
                    initial:       { label: 'Inicial',      color: 'text-muted-foreground' },
                    transfer:      { label: 'Transferencia',color: 'text-blue-500' },
                    void:          { label: 'Anulación',    color: 'text-destructive' },
                    devolution_in: { label: 'Dev. entrada', color: 'text-success' },
                    transfer_in:   { label: 'Transf. ent.', color: 'text-success' },
                    transfer_out:  { label: 'Transf. sal.', color: 'text-destructive' },
                    out:           { label: 'Salida',       color: 'text-destructive' },
                    production:    { label: 'Producción',   color: 'text-purple-500' },
                  };
                  const info = MOVEMENT_INFO[mt] || { label: mt || '—', color: 'text-muted-foreground' };
                  return (
                  <tr key={entry.id} className={cn('hover:bg-muted/30 transition-colors', isReversal && 'bg-purple-500/5')}>
                    <td className="px-3 py-2 font-mono text-[11px]">{formatDate(entry.created_at)}</td>
                    <td className="px-3 py-2">
                      <span className={cn('font-black uppercase text-[10px]', info.color)}>
                        {info.label}
                        {isReversal && (
                          <span className="ml-1 px-1 py-0.5 rounded bg-purple-500/20 text-purple-500 dark:text-purple-400 text-[9px]">
                            REVERSIÓN
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-success tabular-nums">
                      {entry.entry > 0 ? `+${entry.entry}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-destructive">
                      {entry.exit > 0 ? `-${entry.exit}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-black tabular-nums">{entry.running_balance}</td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground truncate max-w-[120px]">
                      {entry.reference_doc || (isReversal ? 'Reversión contable' : '—')}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <SecondaryButton
              label=""
              icon={ChevronLeft}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2 min-w-[44px] min-h-[44px]"
            />
            <span className="flex items-center text-xs font-bold text-muted-foreground">
              {page} / {totalPages}
            </span>
            <SecondaryButton
              label=""
              icon={ChevronRight}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2 min-w-[44px] min-h-[44px]"
            />
          </div>
        )}
      </div>
    </BaseModal>
  );
}
