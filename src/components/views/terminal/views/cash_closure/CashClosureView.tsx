'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, CreditCard, Layers, Edit, History, Eye, CheckCircle2, RefreshCw } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';

import { useCashClosures, useCreateCashClosure, useUpdateCashClosure, useSalesSinceLastClosure } from '@/hooks/api/useCashClosures';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';

export default function CashClosureView() {
  const { user } = useAuthStore();
  const {
    data: cashClosuresData,
    isLoading: isLoadingClosures,
    refetch: refetchClosures,
    isRefetching: isRefetchingClosures
  } = useCashClosures(user?.storeId, user?.role === 'admin');

  const {
    data: salesData,
    isLoading: isLoadingSales,
    refetch: refetchSales,
    isRefetching: isRefetchingSales
  } = useSalesSinceLastClosure(user?.storeId);

  const createClosure = useCreateCashClosure();
  const updateClosure = useUpdateCashClosure();

  const [declaredCash, setDeclaredCash] = useState<number>(0);
  const [declaredVouchers, setDeclaredVouchers] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  const cashClosures = cashClosuresData || [];
  const pendingClosure = cashClosures.find(c => c.status === 'pendiente');
  const finalizedClosures = cashClosures.filter(c => c.status === 'cerrado');

  const summaryItems = [
    { label: 'Ventas Totales Esperadas', value: salesData?.total_sales || 0, color: 'text-foreground' },
    { label: 'Efectivo Declarado (Sistema)', value: salesData?.total_cash || 0, color: 'text-green-600' },
    { label: 'Transferencias (Sistema)', value: salesData?.total_transfer || 0, color: 'text-primary' },
  ];

  const summary = {
    total_billed: salesData?.total_sales || 0,
    total_cash: salesData?.total_cash || 0,
    total_transfer: salesData?.total_transfer || 0,
  };

  useEffect(() => {
    requestAnimationFrame(() => {
      if (pendingClosure) {
        setDeclaredCash(Number(pendingClosure.declared_cash) || 0);
        setDeclaredVouchers(Number(pendingClosure.declared_vouchers) || 0);
        setNotes(pendingClosure.notes || '');
      } else {
        setDeclaredCash(0);
        setDeclaredVouchers(0);
        setNotes('');
      }
    });
  }, [pendingClosure]);

  const totalDeclared = declaredCash + declaredVouchers;
  const difference = totalDeclared - summary.total_billed;

  const canClose = ['admin', 'manager', 'encargado'].includes(user?.role || '');

  const handleProcessClosure = async () => {
    if (!user?.storeId) return;

    if (pendingClosure) {
      // If user is manager/admin, they finalize. If clerk, they update declaration.
      const shouldFinalize = canClose;

      updateClosure.mutate({
        id: pendingClosure.id,
        closure: {
          status: shouldFinalize ? 'cerrado' : 'pendiente',
          closed_at: shouldFinalize ? new Date().toISOString() : null,
          declared_cash: declaredCash,
          declared_vouchers: declaredVouchers,
          declared_total: totalDeclared,
          system_expected_total: summary.total_billed,
          difference: totalDeclared - summary.total_billed,
          notes: notes
        }
      });
    } else {
      // Create declaration (Operator flow)
      createClosure.mutate({
        store_id: user.storeId,
        user_id: user.id,
        declared_cash: declaredCash,
        declared_vouchers: declaredVouchers,
        declared_total: totalDeclared,
        system_expected_total: summary.total_billed,
        difference: totalDeclared - summary.total_billed,
        notes: notes,
        status: 'pendiente'
      });
    }
  };

  const isProcessing = createClosure.isPending || updateClosure.isPending;
  const isRefreshing = isRefetchingClosures || isRefetchingSales;

  const handleRefresh = async () => {
    await Promise.all([refetchClosures(), refetchSales()]);
  };

  const buttonLabel = !pendingClosure
    ? 'Declarar Fondos'
    : canClose
      ? 'Cerrar Caja'
      : 'Actualizar Declaración';

  const buttonIcon = !pendingClosure ? DollarSign : CheckCircle2;
  const buttonVariant = (pendingClosure && canClose ? 'success' : 'primary') as 'success' | 'primary';

  const actions: Action[] = [
    {
      id: 'refresh',
      label: isRefreshing ? 'Actualizando...' : 'Actualizar',
      icon: RefreshCw,
      onClick: handleRefresh,
      disabled: isRefreshing,
      className: isRefreshing ? "animate-spin-slow" : ""
    },
    {
      id: 'process',
      label: buttonLabel,
      icon: buttonIcon,
      onClick: handleProcessClosure,
      variant: buttonVariant,
      disabled: isProcessing || isLoadingSales
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Cierre de Caja</h2>
        <div className="w-full sm:w-auto">
          <ActionMenu
            actions={actions}
            sticky={false}
            className="shadow-none bg-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="p-8 rounded-2xl border border-border bg-card shadow-sm space-y-8">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/10 rounded-xl"><Edit className="w-5 h-5 text-primary" /></div>
             <h3 className="font-black text-lg uppercase tracking-widest">Declaración de Fondos</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-1.5">
              <label htmlFor="cash-declared" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">Efectivo Físico</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                <input
                  id="cash-declared"
                  type="number"
                  aria-label="Efectivo Físico"
                  value={declaredCash || ''}
                  onChange={(e) => setDeclaredCash(Number(e.target.value))}
                  className="w-full p-4 pl-12 rounded-xl border border-border bg-background text-2xl font-black font-mono focus:ring-1 focus:ring-primary outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cash-vouchers" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">Transferencias / Otros</label>
              <div className="relative">
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                <input
                  id="cash-vouchers"
                  type="number"
                  aria-label="Transferencias / Otros"
                  value={declaredVouchers || ''}
                  onChange={(e) => setDeclaredVouchers(Number(e.target.value))}
                  className="w-full p-4 pl-12 rounded-xl border border-border bg-background text-2xl font-black font-mono focus:ring-1 focus:ring-primary outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cash-notes" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">Observaciones</label>
              <textarea
                id="cash-notes"
                aria-label="Observaciones del cierre"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-4 rounded-xl border border-border bg-background text-sm font-medium resize-none h-24 focus:ring-1 focus:ring-primary outline-none"
                placeholder="Notas del turno..."
              />
            </div>
          </div>
        </div>

        <div className="p-8 rounded-2xl border border-primary/20 bg-primary/5 shadow-sm space-y-8">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/20 rounded-xl"><Layers className="w-5 h-5 text-primary" /></div>
             <h3 className="font-black text-lg uppercase tracking-widest">Balance del Sistema</h3>
          </div>

          <div className="space-y-4">
            {summaryItems.map((row, i) => (
              <div key={i} className="flex justify-between items-center p-4 rounded-xl bg-background/50 border border-border">
                <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">{row.label}</span>
                <span className={cn("text-xl font-black font-mono", row.color)}>{formatCurrency(row.value)}</span>
              </div>
            ))}

            <div className={cn(
              "flex justify-between items-center p-6 rounded-2xl mt-8 shadow-xl transition-colors",
              difference === 0 ? "bg-green-600 shadow-green-500/20" :
              difference < 0 ? "bg-destructive shadow-destructive/20" : "bg-amber-600 shadow-amber-500/20"
            )}>
              <span className="text-xs font-black uppercase tracking-widest text-foreground">Diferencia de Arqueo</span>
              <span className="text-3xl font-black font-mono text-foreground">{formatCurrency(difference)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 rounded-2xl border border-border bg-card shadow-sm">
        <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3 mb-8">
          <History className="w-6 h-6 text-primary" />
          Registros de Cierre
        </h3>

        <div className="table-scroll-wrapper rounded-xl border border-border">
          <table className="data-table sticky-column-1 w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
                <th className="p-4 text-left">Fecha</th>
                <th className="p-4 text-left">Operador</th>
                <th className="p-4 text-right">Monto Sistema</th>
                <th className="p-4 text-right">Diferencia</th>
                <th className="p-4 text-center">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {finalizedClosures.map((closure) => (
                <tr key={closure.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-xs">{formatDate(closure.created_at)}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {formatTime(closure.created_at)}
                    </div>
                  </td>
                  <td className="p-4 font-bold text-xs uppercase">{closure.profile?.full_name}</td>
                  <td className="p-4 text-right font-black text-base">{formatCurrency(Number(closure.system_expected_total) || Number(closure.system_total) || 0)}</td>
                  <td className="p-4 text-right">
                    <span className={cn(
                      "font-black text-xs px-2 py-1 rounded",
                      (Number(closure.difference) || 0) < 0 ? 'text-destructive bg-destructive/10' :
                      (Number(closure.difference) || 0) === 0 ? 'text-green-600 bg-green-500/10' : 'text-amber-600 bg-amber-500/10'
                    )}>
                      {formatCurrency(Number(closure.difference) || 0)}
                    </span>
                  </td>
                  <td className="p-4" aria-label="Ver detalles del cierre">
                    <div className="flex justify-center">
                      <button disabled title="Detalle no disponible" aria-label="Ver detalles" className="w-11 h-11 flex items-center justify-center rounded-xl border border-border opacity-50 cursor-not-allowed text-foreground">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {finalizedClosures.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground uppercase font-black tracking-widest text-xs">
                    Sin registros de cierre
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
