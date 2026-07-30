'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { formatCurrency } from '@/lib/utils';
import { Calendar, DollarSign, RefreshCw, TrendingUp, Wallet, ArrowLeftRight, Banknote } from 'lucide-react';
import { StateRenderer } from '@/components/ui/StateRenderer';

interface DaySummary {
  fecha: string;
  efectivo_cup: number;
  transf_cup: number;
  usd: number;
  comision: number;
  total_ventas: number;
}

interface SalesSummaryTabProps {
  dateFrom: string;
  dateTo: string;
  storeId: string;
}

export function SalesSummaryTab({ dateFrom, dateTo, storeId }: SalesSummaryTabProps) {
  const [data, setData] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore.getState().token;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ store_id: storeId });
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      const res = await fetch(`/api/sales/summary?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.days || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, storeId, token]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  // Calcular totales
  const totals = useMemo(() => {
    return data.reduce(
      (acc, d) => ({
        efectivo_cup: acc.efectivo_cup + d.efectivo_cup,
        transf_cup: acc.transf_cup + d.transf_cup,
        usd: acc.usd + d.usd,
        comision: acc.comision + d.comision,
        total_ventas: acc.total_ventas + d.total_ventas,
      }),
      { efectivo_cup: 0, transf_cup: 0, usd: 0, comision: 0, total_ventas: 0 }
    );
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <StateRenderer
        state="error"
        title="Error al cargar resumen"
        message={error}
        onRetry={fetchData}
      />
    );
  }

  if (data.length === 0) {
    return (
      <StateRenderer
        state="empty"
        title="Sin ventas en el período"
        message="No hay ventas registradas en el rango de fechas seleccionado."
        icon={Calendar}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Cards de totales */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl bg-success/5 border border-success/10 p-3 text-center">
          <Banknote className="w-5 h-5 text-success mx-auto mb-1" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">Efectivo CUP</p>
          <p className="text-base sm:text-lg font-black text-success tabular-nums">{formatCurrency(totals.efectivo_cup)}</p>
        </div>
        <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-center">
          <ArrowLeftRight className="w-5 h-5 text-primary mx-auto mb-1" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">Transferencia CUP</p>
          <p className="text-base sm:text-lg font-black text-primary tabular-nums">{formatCurrency(totals.transf_cup)}</p>
        </div>
        <div className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-3 text-center">
          <DollarSign className="w-5 h-5 text-blue-500 mx-auto mb-1" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">USD</p>
          <p className="text-base sm:text-lg font-black text-blue-500 tabular-nums">$ {totals.usd.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 text-center">
          <Wallet className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">Comisiones</p>
          <p className="text-base sm:text-lg font-black text-amber-500 tabular-nums">{formatCurrency(totals.comision)}</p>
        </div>
        <div className="rounded-xl bg-foreground/5 border border-foreground/10 p-3 text-center col-span-2 lg:col-span-1">
          <TrendingUp className="w-5 h-5 text-foreground mx-auto mb-1" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">Total Ventas</p>
          <p className="text-base sm:text-lg font-black tabular-nums">{totals.total_ventas}</p>
        </div>
      </div>

      {/* Tabla consolidada por día */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/30 border-b border-border">
            <tr className="text-muted-foreground font-black uppercase text-[10px] tracking-widest">
              <th className="p-3 text-left min-h-[44px]">Fecha</th>
              <th className="p-3 text-right">Efectivo CUP</th>
              <th className="p-3 text-right">Transf CUP</th>
              <th className="p-3 text-right">USD</th>
              <th className="p-3 text-right hidden sm:table-cell">Comisión</th>
              <th className="p-3 text-right">N° Ventas</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={d.fecha} className={cn(
                'border-b border-border/30 hover:bg-muted/20 transition-colors',
                i % 2 === 1 && 'bg-muted/5'
              )}>
                <td className="p-3 font-bold whitespace-nowrap">
                  {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CU', {
                    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
                  })}
                </td>
                <td className="p-3 text-right tabular-nums font-bold text-success">
                  {d.efectivo_cup > 0 ? formatCurrency(d.efectivo_cup) : '—'}
                </td>
                <td className="p-3 text-right tabular-nums font-bold text-primary">
                  {d.transf_cup > 0 ? formatCurrency(d.transf_cup) : '—'}
                </td>
                <td className="p-3 text-right tabular-nums font-bold text-blue-500">
                  {d.usd > 0 ? `$ ${d.usd.toFixed(2)}` : '—'}
                </td>
                <td className="p-3 text-right tabular-nums hidden sm:table-cell text-amber-500">
                  {d.comision > 0 ? formatCurrency(d.comision) : '—'}
                </td>
                <td className="p-3 text-right tabular-nums font-bold">{d.total_ventas}</td>
              </tr>
            ))}
          </tbody>
          {/* Total general */}
          <tfoot>
            <tr className="bg-foreground/10 border-t-2 border-foreground/30 font-black">
              <td className="p-3 uppercase text-xs tracking-widest">Total General</td>
              <td className="p-3 text-right tabular-nums text-success">{formatCurrency(totals.efectivo_cup)}</td>
              <td className="p-3 text-right tabular-nums text-primary">{formatCurrency(totals.transf_cup)}</td>
              <td className="p-3 text-right tabular-nums text-blue-500">$ {totals.usd.toFixed(2)}</td>
              <td className="p-3 text-right tabular-nums hidden sm:table-cell text-amber-500">{formatCurrency(totals.comision)}</td>
              <td className="p-3 text-right tabular-nums">{totals.total_ventas}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Botón refrescar */}
      <div className="flex justify-end">
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 h-10 rounded-xl border border-border text-xs font-black uppercase hover:bg-muted transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>
    </div>
  );
}

// Helper cn (si no está importado desde utils)
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
