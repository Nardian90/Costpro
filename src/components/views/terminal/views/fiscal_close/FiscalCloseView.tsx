'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Lock, CheckCircle2, AlertTriangle, Calendar } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore } from '@/store';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';

const touch = 'min-h-[44px]';
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function FiscalCloseView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [closing, setClosing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const isAdmin = user?.role === 'admin';

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/fiscal-close?store_id=${storeId}&year=${year}&month=${month}`);
      setClosing(data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [storeId, year, month]);

  useEffect(() => { load(); }, [load]);

  async function handleClose() {
    setActionLoading(true);
    try {
      await apiFetch('/api/fiscal-close', {
        method: 'POST',
        body: JSON.stringify({ store_id: storeId, year, month, action: 'close' }),
      });
      toast.success(`Periodo ${MONTHS[month - 1]} ${year} cerrado`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(false); }
  }

  async function handleLock() {
    setActionLoading(true);
    try {
      await apiFetch('/api/fiscal-close', {
        method: 'POST',
        body: JSON.stringify({ store_id: storeId, year, month, action: 'lock' }),
      });
      toast.success(`Periodo ${MONTHS[month - 1]} ${year} bloqueado`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(false); }
  }

  const status = closing?.status || 'open';
  const closingData = closing?.closing;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl font-black uppercase tracking-tight">Cierre Fiscal</h1>
        <p className="text-xs text-muted-foreground">Cierre y bloqueo de periodos mensuales</p>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
        <Calendar className="w-5 h-5 text-muted-foreground" />
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className={cn('px-3 rounded-xl border border-border bg-background text-sm font-bold', touch)}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className={cn('px-3 rounded-xl border border-border bg-background text-sm font-bold', touch)}>
          {[0, 1, 2].map(i => { const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option>; })}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Status badge */}
          <div className={cn('p-4 rounded-xl border-2 flex items-center gap-3',
            status === 'open' ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800' :
            status === 'closed' ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800' :
            'border-destructive/30 bg-destructive/5'
          )}>
            {status === 'open' ? <AlertTriangle className="w-6 h-6 text-amber-600" /> :
             status === 'closed' ? <CheckCircle2 className="w-6 h-6 text-blue-600" /> :
             <Lock className="w-6 h-6 text-destructive" />}
            <div>
              <p className="font-black text-sm uppercase">
                {status === 'open' ? 'Periodo Abierto' : status === 'closed' ? 'Periodo Cerrado' : 'Periodo Bloqueado'}
              </p>
              <p className="text-xs text-muted-foreground">
                {status === 'open' ? 'Las transacciones pueden modificarse libremente' :
                 status === 'closed' ? 'Periodo cerrado. Bloquear para impedir cambios.' :
                 'Periodo bloqueado. No se permiten modificaciones.'}
              </p>
            </div>
          </div>

          {/* Totales */}
          {closingData && (
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Ventas Totales" value={formatCurrency(Number(closingData.total_sales || 0))} />
              <StatCard label="Devoluciones" value={formatCurrency(Number(closingData.total_devolutions || 0))} />
              <StatCard label="Compras" value={formatCurrency(Number(closingData.total_purchases || 0))} />
              <StatCard label="Comisiones" value={formatCurrency(Number(closingData.total_commissions || 0))} />
              <div className="col-span-2 p-3 rounded-xl bg-muted/30 border border-border">
                <div className="flex justify-between">
                  <span className="text-sm font-black uppercase">Balance de Caja</span>
                  <span className="font-mono font-black text-lg">{formatCurrency(Number(closingData.total_cash_balance || 0))}</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {status === 'open' && (
              <Button onClick={handleClose} disabled={actionLoading}
                className={cn('flex-1 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2', touch)}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Cerrar Periodo
              </Button>
            )}
            {status === 'closed' && isAdmin && (
              <Button onClick={handleLock} disabled={actionLoading}
                className={cn('flex-1 rounded-xl bg-destructive text-destructive-foreground text-sm font-black uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2', touch)}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Bloquear Periodo (Admin)
              </Button>
            )}
            {status === 'locked' && (
              <p className="text-xs text-muted-foreground text-center py-4">
                El periodo está bloqueado por <strong>{closingData?.locked_by ? 'un administrador' : 'el sistema'}</strong>.
                Solo un admin puede desbloquearlo.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border border-border bg-card">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono font-black text-sm mt-1">{value}</p>
    </div>
  );
}
