'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, BarChart3, Calculator } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';
const touch = 'min-h-[44px]';

export function ABCView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try { const data = await apiFetch(`/api/abc-analysis?store_id=${storeId}&year=${year}&month=${month}`); setItems(data.data || []); setSummary(data.summary || {}); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  }, [storeId, year, month]);
  useEffect(() => { load(); }, [load]);

  async function handleCalculate() {
    setCalculating(true);
    try { await apiFetch('/api/abc-analysis', { method: 'POST', body: JSON.stringify({ store_id: storeId, year, month }) }); toast.success('Clasificación ABC calculada'); load(); }
    catch (e: any) { toast.error(e.message); } finally { setCalculating(false); }
  }

  const classA = items.filter(i => i.classification === 'A');
  const classB = items.filter(i => i.classification === 'B');
  const classC = items.filter(i => i.classification === 'C');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div><h1 className="text-xl font-black uppercase tracking-tight">Clasificación ABC</h1><p className="text-xs text-muted-foreground">Análisis Pareto de productos por valor de consumo</p></div>
        <Button onClick={handleCalculate} disabled={calculating} className={cn('flex items-center gap-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 disabled:opacity-50', touch)}>{calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Calcular</Button>
      </div>
      <div className="flex gap-2 items-center">
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className={cn('px-3 rounded-xl border border-border bg-background text-sm font-bold', touch)}>{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className={cn('px-3 rounded-xl border border-border bg-background text-sm font-bold', touch)}>{[0, 1].map(i => { const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option>; })}</select>
      </div>
      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      : items.length === 0 ? <div className="text-center py-20"><BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" /><p className="text-sm font-bold text-muted-foreground">Sin clasificación. Click "Calcular" para generar.</p></div>
      : <>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl border-2 border-success/30 bg-success/5"><p className="text-[10px] font-black uppercase text-success">Clase A (80%)</p><p className="font-mono font-black text-lg">{classA.length}</p><p className="text-xs text-muted-foreground">{formatCurrency(classA.reduce((s, i) => s + Number(i.total_revenue || 0), 0))}</p></div>
          <div className="p-3 rounded-xl border-2 border-blue-300 bg-blue-50 dark:bg-blue-950/30"><p className="text-[10px] font-black uppercase text-blue-600">Clase B (95%)</p><p className="font-mono font-black text-lg">{classB.length}</p><p className="text-xs text-muted-foreground">{formatCurrency(classB.reduce((s, i) => s + Number(i.total_revenue || 0), 0))}</p></div>
          <div className="p-3 rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30"><p className="text-[10px] font-black uppercase text-amber-600">Clase C (100%)</p><p className="font-mono font-black text-lg">{classC.length}</p><p className="text-xs text-muted-foreground">{formatCurrency(classC.reduce((s, i) => s + Number(i.total_revenue || 0), 0))}</p></div>
        </div>
        <div className="grid gap-2">{items.map(i => (
          <div key={i.id} className={cn('p-3 rounded-xl border bg-card flex items-center justify-between', i.classification === 'A' ? 'border-success/30' : i.classification === 'B' ? 'border-blue-300' : 'border-amber-300')}>
            <div className="flex items-center gap-3"><span className={cn('w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm', i.classification === 'A' ? 'bg-success/10 text-success' : i.classification === 'B' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700')}>{i.classification}</span><div><p className="text-sm font-bold">{i.products?.name || 'Producto'}</p><p className="text-xs text-muted-foreground">Qty: {i.total_quantity_sold} · {i.cumulative_percentage?.toFixed(1)}% acum.</p></div></div>
            <p className="font-mono font-black text-sm">{formatCurrency(Number(i.total_revenue || 0))}</p>
          </div>
        ))}</div>
      </>}
    </div>
  );
}
