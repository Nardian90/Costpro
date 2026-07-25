'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Banknote, X } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
const touch = 'min-h-[44px]';

export function BankReconciliationView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [statements, setStatements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try { const data = await apiFetch(`/api/bank-reconciliation?store_id=${storeId}`); setStatements(data.data || []); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  }, [storeId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div><h1 className="text-xl font-black uppercase tracking-tight">Conciliación Bancaria</h1><p className="text-xs text-muted-foreground">Carga de extractos bancarios y conciliación con transferencias</p></div>
      {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      : statements.length === 0 ? <div className="text-center py-20"><Banknote className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" /><p className="text-sm font-bold text-muted-foreground">No hay extractos bancarios cargados</p><p className="text-xs text-muted-foreground mt-1">Usa el endpoint POST /api/bank-reconciliation para cargar un extracto</p></div>
      : <div className="grid gap-2">{statements.map(s => (
          <div key={s.id} className="p-4 rounded-xl border border-border bg-card">
            <div className="flex items-start justify-between gap-3">
              <div><div className="flex items-center gap-2 mb-1"><span className="font-mono text-xs font-black text-primary">{new Date(s.statement_date).toLocaleDateString('es-CU')}</span><span className={cn('text-[10px] font-black uppercase px-1.5 py-0.5 rounded', s.status === 'reconciled' ? 'bg-success/10 text-success' : s.status === 'discrepancy' ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 text-amber-700')}>{s.status}</span></div>{s.bank_account && <p className="text-xs text-muted-foreground">Cuenta: {s.bank_account}</p>}<p className="text-xs text-muted-foreground">{s.items?.length || 0} movimientos</p></div>
              <div className="text-right"><p className="font-mono font-black text-sm">Saldo: {formatCurrency(Number(s.closing_balance))}</p><p className="text-xs text-muted-foreground">Cr: {formatCurrency(Number(s.total_credits))} · Db: {formatCurrency(Number(s.total_debits))}</p></div>
            </div>
          </div>
        ))}</div>}
    </div>
  );
}
