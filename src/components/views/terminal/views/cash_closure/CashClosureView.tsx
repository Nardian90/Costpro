'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, CreditCard, Layers, Edit, History, Eye, CheckCircle2, RefreshCw, AlertTriangle, ShieldCheck, FileText, Clock, Wallet, ArrowRight, Play, Square } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';

import { useCashClosures, useCreateCashClosure, useUpdateCashClosure, useSalesSinceLastClosure } from '@/hooks/api/useCashClosures';
import { useAuthStore } from '@/store';
import { useUIStore } from '@/store';
import { CashClosure } from '@/types';

// ── Loading Skeleton ──
const ClosureLoadingSkeleton = () => (
  <div className="space-y-8">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Skeleton className="h-[420px] w-full rounded-2xl" />
      <Skeleton className="h-[420px] w-full rounded-2xl" />
    </div>
    <Skeleton className="h-[300px] w-full rounded-2xl" />
  </div>
);

// ── Access Denied ──
const AccessDenied = () => (
  <div className="text-center py-16 space-y-4">
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10">
      <ShieldCheck className="w-8 h-8 text-destructive" />
    </div>
    <div>
      <p className="text-sm font-black uppercase tracking-widest text-foreground">Acceso Restringido</p>
      <p className="text-xs text-muted-foreground mt-1">Solo administradores, gerentes y encargados pueden acceder al Arqueo de Caja.</p>
    </div>
  </div>
);

export default function CashClosureView() {
  const { user } = useAuthStore();
  const { setCurrentView } = useUIStore();
  const {
    data: cashClosuresData,
    isLoading: isLoadingClosures,
    refetch: refetchClosures,
    isRefetching: isRefetchingClosures
  } = useCashClosures(user?.activeStoreId, user?.role === 'admin');

  const {
    data: salesData,
    isLoading: isLoadingSales,
    refetch: refetchSales,
    isRefetching: isRefetchingSales
  } = useSalesSinceLastClosure(user?.activeStoreId);

  const createClosure = useCreateCashClosure();
  const updateClosure = useUpdateCashClosure();

  const [declaredCash, setDeclaredCash] = useState<number>(0);
  const [declaredVouchers, setDeclaredVouchers] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');

  // ── Confirmation modal ──
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [showOpenConfirm, setShowOpenConfirm] = useState(false);

  const cashClosures = cashClosuresData || [];
  const pendingClosure = cashClosures.find(c => c.status === 'pendiente');
  const finalizedClosures = cashClosures.filter(c => c.status === 'cerrado');

  const summaryItems = [
    { label: 'Ventas Totales del Turno', value: salesData?.total_sales || 0, color: 'text-foreground' },
    { label: 'Efectivo Esperado (Sistema)', value: salesData?.total_cash || 0, color: 'text-success' },
    { label: 'Transferencias (Sistema)', value: salesData?.total_transfer || 0, color: 'text-primary' },
  ];

  const summary = {
    total_billed: salesData?.total_sales || 0,
    total_cash: salesData?.total_cash || 0,
    total_transfer: salesData?.total_transfer || 0,
  };

  // Restore pending closure state — no requestAnimationFrame needed
  useEffect(() => {
    queueMicrotask(() => {
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

  // Q7: Reconciliación por método de pago (no total vs total).
  // Antes: difference = totalDeclared - summary.total_billed (comparaba efectivo+vouchers
  //   con TODAS las ventas incluyendo tarjeta/transferencia → diferencias falsas).
  // Ahora: comparamos efectivo declarado vs efectivo esperado del sistema,
  //   y vouchers declarados vs transferencias del sistema.
  const systemCash = summary.total_cash || 0;
  const systemVouchers = summary.total_transfer || 0;
  const cashDiff = pendingClosure ? declaredCash - systemCash : 0;
  const voucherDiff = pendingClosure ? declaredVouchers - systemVouchers : 0;
  // Diferencia total sigue siendo la suma para compatibilidad con BD
  const difference = pendingClosure ? cashDiff + voucherDiff : 0;

  const canClose = useMemo(
    () => ['admin', 'manager', 'encargado'].includes(user?.role || ''),
    [user?.role]
  );

  const allowedRoles = ['admin', 'manager', 'encargado', 'clerk'];
  const isAuthorized = user?.roles?.some(r => allowedRoles.includes(r)) ?? false;

  // ── Process Closure ──
  const executeProcessClosure = async () => {
    if (!user?.activeStoreId) return;

    if (pendingClosure) {
      const shouldFinalize = canClose;
      updateClosure.mutate({
        id: pendingClosure.id,
        closure: {
          status: shouldFinalize ? 'cerrado' : 'pendiente',
          closed_at: shouldFinalize ? new Date().toISOString() : null,
          declared_cash: declaredCash,
          declared_vouchers: declaredVouchers,
          declared_total: totalDeclared,
          // Q7: usar system_cash + system_vouchers (no total_billed que incluye todo)
          system_expected_total: systemCash + systemVouchers,
          difference: difference, // cashDiff + voucherDiff
          notes: notes
        }
      });
    } else {
      createClosure.mutate({
        store_id: user.activeStoreId,
        user_id: user.id,
        declared_cash: declaredCash,
        declared_vouchers: declaredVouchers,
        declared_total: totalDeclared,
        system_expected_total: 0, // Al abrir, no hay ventas todavía
        difference: 0,
        notes: notes,
        status: 'pendiente'
      });
    }
  };

  const handleProcessClosure = () => {
    // Show confirmation modal before proceeding
    if (!pendingClosure) {
      // Apertura de turno
      setShowOpenConfirm(true);
    } else if (pendingClosure && canClose) {
      // Cierre (admin/manager)
      setShowCloseConfirm(true);
    } else if (pendingClosure && !canClose) {
      // Actualizar declaración (clerk)
      setShowUpdateConfirm(true);
    }
  };

  const handleConfirmOpen = () => {
    setShowOpenConfirm(false);
    executeProcessClosure();
    // POS-3a: tras abrir turno, regresar al POS automáticamente
    setTimeout(() => setCurrentView('pos'), 800);
  };

  const handleConfirmClose = () => {
    setShowCloseConfirm(false);
    executeProcessClosure();
  };

  const isProcessing = createClosure.isPending || updateClosure.isPending;
  const isRefreshing = isRefetchingClosures || isRefetchingSales;
  const isLoading = isLoadingClosures || isLoadingSales;

  const handleRefresh = async () => {
    await Promise.all([refetchClosures(), refetchSales()]);
  };

  // POS-3a: Labels dinámicos según contexto (apertura vs cierre)
  const isOpening = !pendingClosure;
  const buttonLabel = isOpening
    ? 'Abrir Turno'
    : canClose
      ? 'Cerrar Turno'
      : 'Actualizar Declaración';
  const buttonIcon = isOpening ? Play : (canClose ? Square : Edit);
  const buttonVariant = (pendingClosure && canClose ? 'success' : 'primary') as 'success' | 'primary';

  // Labels de campos según contexto
  const cashInputLabel = isOpening ? 'Fondo Inicial de Efectivo' : 'Efectivo Contado (Final)';
  const cashInputPlaceholder = isOpening ? 'Ej. 100.00 (cambio inicial)' : '0.00';
  const cashInputHint = isOpening
    ? 'Cuánto efectivo dejas en la caja para dar vueltos.'
    : 'Cuenta el efectivo físico al final del turno.';
  const vouchersInputLabel = isOpening ? 'Otros Fondos Iniciales (opcional)' : 'Transferencias Contadas (Final)';
  const notesLabel = isOpening ? 'Notas de Apertura' : 'Observaciones del Cierre';

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

  // ── Guard: unauthorized access ──
  if (!isAuthorized) return <AccessDenied />;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tighter uppercase">Arqueo de Caja</h2>
            {pendingClosure ? (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-success font-bold">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                Turno abierto desde {formatDate(pendingClosure.created_at)} {formatTime(pendingClosure.created_at)}
              </div>
            ) : salesData?.last_closure_at ? (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Último cierre: {formatDate(salesData.last_closure_at)} {formatTime(salesData.last_closure_at)}
              </div>
            ) : null}
          </div>
          <div className="w-full sm:w-auto">
            <ActionMenu
              actions={actions}
              sticky={false}
              className="shadow-none bg-transparent"
            />
          </div>
        </div>

        {/* Loading skeleton */}
        {isLoading ? (
          <ClosureLoadingSkeleton />
        ) : (
          <>
            {/* ── EMPTY STATE: No hay turno abierto ── */}
            {!pendingClosure && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-6 sm:p-8 shadow-md"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="p-3 rounded-2xl bg-primary/10 text-primary shrink-0">
                    <Wallet className="w-7 h-7 sm:w-8 sm:h-8" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg sm:text-xl font-black text-foreground uppercase tracking-tight">
                      No tienes turno abierto
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      Abre un turno declarando el fondo inicial de caja para empezar a vender.
                      El turno se cerrará al final del día contando el efectivo y comparándolo con el sistema.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOpenConfirm(true)}
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-xs sm:text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    <Play className="w-4 h-4" />
                    Abrir Turno
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── BANNER: Turno activo ── */}
            {pendingClosure && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-2xl border-2 p-4 sm:p-5 shadow-md flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4",
                  "border-success/30 bg-success/5"
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-xl bg-success/10 text-success shrink-0">
                    <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-widest text-success">
                      Turno Activo
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {salesData?.total_sales !== undefined && (
                        <>Ventas: <span className="font-black text-foreground">{formatCurrency(salesData.total_sales)}</span> · </>
                      )}
                      Efectivo: <span className="font-black text-foreground">{formatCurrency(salesData?.total_cash || 0)}</span> · Transf: <span className="font-black text-foreground">{formatCurrency(salesData?.total_transfer || 0)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCurrentView('pos')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
                  >
                    Vender
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  {canClose ? (
                    <button
                      type="button"
                      onClick={() => setShowCloseConfirm(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-success/15 text-success border border-success/30 text-xs font-black uppercase tracking-widest hover:bg-success/25 transition-colors"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Cerrar Turno
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-widest"
                      title="Solo admin/manager/encargado pueden cerrar el turno"
                    >
                      Pide a un encargado cerrar
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            {/* Two-panel layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
              {/* Left: Declaration Form */}
              <div className="p-4 sm:p-6 lg:p-8 rounded-2xl border border-border bg-card shadow-sm space-y-6 lg:space-y-8">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-primary/10 rounded-xl">
                     {isOpening ? <Play className="w-5 h-5 text-primary" /> : <Edit className="w-5 h-5 text-primary" />}
                   </div>
                   <div>
                     <h3 className="font-black text-lg uppercase tracking-widest">
                       {isOpening ? 'Apertura de Turno' : 'Declaración de Cierre'}
                     </h3>
                     <p className="text-xs text-muted-foreground mt-0.5">
                       {isOpening
                         ? 'Registra el fondo inicial con el que abres la caja.'
                         : 'Cuenta el efectivo y registra los montos finales del turno.'}
                     </p>
                   </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <label htmlFor="cash-declared" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">
                      {cashInputLabel}
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                      <input
                        id="cash-declared"
                        type="number"
                        min={0}
                        step={0.01}
                        aria-label={cashInputLabel}
                        value={declaredCash || ''}
                        onChange={(e) => setDeclaredCash(Math.max(0, Number(e.target.value)))}
                        className="w-full p-4 pl-12 rounded-xl border border-border bg-background text-2xl font-black font-mono focus:ring-1 focus:ring-primary outline-none"
                        placeholder={cashInputPlaceholder}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-1">{cashInputHint}</p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="cash-vouchers" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">
                      {vouchersInputLabel}
                    </label>
                    <div className="relative">
                      <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                      <input
                        id="cash-vouchers"
                        type="number"
                        min={0}
                        step={0.01}
                        aria-label={vouchersInputLabel}
                        value={declaredVouchers || ''}
                        onChange={(e) => setDeclaredVouchers(Math.max(0, Number(e.target.value)))}
                        className="w-full p-4 pl-12 rounded-xl border border-border bg-background text-2xl font-black font-mono focus:ring-1 focus:ring-primary outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Declared total preview */}
                  <div className="p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">
                        {isOpening ? 'Fondo Total Inicial' : 'Total Declarado'}
                      </span>
                      <span className="text-2xl font-black font-mono text-primary">{formatCurrency(totalDeclared)}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="cash-notes" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">
                      {notesLabel}
                    </label>
                    <textarea
                      id="cash-notes"
                      aria-label={notesLabel}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full p-4 rounded-xl border border-border bg-background text-sm font-medium resize-none h-24 focus:ring-1 focus:ring-primary outline-none"
                      placeholder={isOpening ? 'Ej. Fondo de cambio entregado por el encargado...' : 'Notas del turno...'}
                    />
                  </div>
                </div>
              </div>

              {/* Right: System Balance (solo si hay turno) */}
              <div className={cn(
                "p-4 sm:p-6 lg:p-8 rounded-2xl border shadow-sm space-y-6 lg:space-y-8",
                pendingClosure ? "border-primary/20 bg-primary/5" : "border-border bg-muted/20"
              )}>
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-primary/20 rounded-xl">
                     <Layers className="w-5 h-5 text-primary" />
                   </div>
                   <div>
                     <h3 className="font-black text-lg uppercase tracking-widest">Balance del Sistema</h3>
                     <p className="text-xs text-muted-foreground mt-0.5">
                       {pendingClosure ? 'Resumen de ventas del turno actual.' : 'Aún no hay ventas — abre un turno para ver el balance.'}
                     </p>
                   </div>
                </div>

                {pendingClosure ? (
                  <div className="space-y-4">
                    {summaryItems.map((row, i) => (
                      <div key={i} className="flex justify-between items-center p-4 rounded-xl bg-background/50 border border-border">
                        <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">{row.label}</span>
                        <span className={cn("text-xl font-black font-mono tabular-nums", row.color)}>{formatCurrency(row.value)}</span>
                      </div>
                    ))}

                    <div className={cn(
                      "flex justify-between items-center p-6 rounded-2xl mt-4 shadow-xl transition-colors border-2",
                      difference === 0 ? "bg-success/15 border-success/30" :
                      difference < 0 ? "bg-destructive/15 border-destructive/30" : "bg-warning/15 border-warning/30"
                    )}>
                      <div className="text-left">
                        <span className="text-xs font-black uppercase tracking-widest text-foreground block">Diferencia de Arqueo</span>
                        <span className="text-[10px] text-foreground/70 block mt-0.5">
                          {difference === 0 ? 'Cuadre perfecto' :
                           difference < 0 ? 'Faltante en caja' : 'Sobrante en caja'}
                        </span>
                      </div>
                      <span className="text-3xl font-black font-mono text-foreground tabular-nums">{formatCurrency(difference)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                      <Layers className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Sin datos</p>
                      <p className="text-xs text-muted-foreground mt-1">El balance aparecerá cuando abras un turno y empieces a vender.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* History Table */}
            <div className="p-4 sm:p-6 lg:p-8 rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between mb-6 lg:mb-8">
                <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3">
                  <History className="w-6 h-6 text-primary" />
                  Registros de Cierre
                  {finalizedClosures.length > 0 && (
                    <span className="text-xs font-bold text-muted-foreground ml-1">({finalizedClosures.length})</span>
                  )}
                </h3>
              </div>

              {finalizedClosures.length === 0 ? (
                <div className="text-center py-12 sm:py-16 space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted">
                    <FileText className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Sin registros de cierre</p>
                    <p className="text-xs text-muted-foreground mt-1">Los cierres finalizados aparecerán aquí.</p>
                  </div>
                </div>
              ) : (
                <div className="table-scroll-wrapper overflow-x-auto rounded-xl border border-border">
                  <table className="data-table sticky-column-1 w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 text-muted-foreground font-black uppercase text-xs tracking-widest border-b border-border">
                        <th className="p-4 text-left">Fecha</th>
                        <th className="p-4 text-left">Operador</th>
                        <th className="p-4 text-right">Monto Sistema</th>
                        <th className="p-4 text-right">Monto Declarado</th>
                        <th className="p-4 text-right">Diferencia</th>
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
                          <td className="p-4 font-bold text-xs uppercase">{closure.profile?.full_name || 'N/A'}</td>
                          <td className="p-4 text-right font-black">{formatCurrency(Number(closure.system_expected_total) || Number(closure.system_total) || 0)}</td>
                          <td className="p-4 text-right font-black text-primary tabular-nums">{formatCurrency(Number(closure.declared_total) || 0)}</td>
                          <td className="p-4 text-right">
                            <span className={cn(
                              "font-black text-xs px-2 py-1 rounded tabular-nums",
                              (Number(closure.difference) || 0) < 0 ? 'text-destructive bg-destructive/10' :
                              (Number(closure.difference) || 0) === 0 ? 'text-success bg-success/10' : 'text-warning bg-warning/10'
                            )}>
                              {formatCurrency(Number(closure.difference) || 0)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Confirmation: Open Shift ── */}
      <BaseModal
        open={showOpenConfirm}
        onOpenChange={(open) => { if (!open) setShowOpenConfirm(false); }}
        title={
          <div className="flex items-center gap-2 text-primary">
            <Play className="w-6 h-6" />
            <span>Abrir Turno</span>
          </div>
        }
        footer={
          <>
            <SecondaryButton
              label="Cancelar"
              onClick={() => setShowOpenConfirm(false)}
              className="flex-1"
            />
            <PrimaryButton
              label="Sí, Abrir Turno"
              onClick={handleConfirmOpen}
              disabled={isProcessing}
              className="flex-1"
            />
          </>
        }
      >
        <div className="py-4 space-y-4">
          <p className="font-bold text-center text-sm">
            ¿Confirmas la <span className="text-primary uppercase">apertura de turno</span>?
          </p>
          <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground uppercase">Fondo Inicial</span>
              <span className="text-xs font-black text-primary tabular-nums">{formatCurrency(totalDeclared)}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Este fondo se usará como base para calcular la diferencia al cerrar el turno.
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Tras abrir el turno podrás vender en el POS. Al final del día, vuelve aquí para cerrar y contar el efectivo.
          </p>
        </div>
      </BaseModal>

      {/* ── Confirmation: Close Cash Register ── */}
      <BaseModal
        open={showCloseConfirm}
        onOpenChange={(open) => { if (!open) setShowCloseConfirm(false); }}
        title={
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-6 h-6" />
            <span>Confirmar Cierre de Turno</span>
          </div>
        }
        footer={
          <>
            <SecondaryButton
              label="No, Volver"
              onClick={() => setShowCloseConfirm(false)}
              className="flex-1"
            />
            <PrimaryButton
              label="Sí, Cerrar Turno"
              onClick={handleConfirmClose}
              disabled={isProcessing}
              className="flex-1 !bg-success/15 !text-success border !border-success/30 hover:!bg-success/25"
            />
          </>
        }
      >
        <div className="py-4 space-y-4">
          <p className="font-bold text-center text-sm">
            ¿Estás seguro de que deseas <span className="text-destructive uppercase">cerrar el turno</span>?
          </p>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Esta acción <span className="font-bold text-foreground">finaliza el turno</span>. Las ventas desde la última apertura se consolidarán
            y no podrás modificar esta declaración después.
          </p>

          <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground uppercase">Esperado por Sistema</span>
              <span className="text-xs font-black tabular-nums">{formatCurrency(summary.total_billed)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground uppercase">Total Declarado</span>
              <span className="text-xs font-black text-primary tabular-nums">{formatCurrency(totalDeclared)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-xs font-black uppercase">Diferencia</span>
              <span className={cn(
                "text-lg font-black tabular-nums",
                difference === 0 ? "text-success" :
                difference < 0 ? "text-destructive" : "text-warning"
              )}>{formatCurrency(difference)}</span>
            </div>
          </div>

          {difference !== 0 && (
            <div className={cn(
              "p-3 rounded-xl text-xs font-bold text-center",
              difference < 0
                ? "bg-destructive/10 text-destructive border border-destructive/20"
                : "bg-warning/10 text-warning border border-warning/20"
            )}>
              {difference < 0
                ? `Faltante de ${formatCurrency(Math.abs(difference))}`
                : `Sobrante de ${formatCurrency(difference)}`}
            </div>
          )}
        </div>
      </BaseModal>

      {/* ── Confirmation: Update Declaration ── */}
      <BaseModal
        open={showUpdateConfirm}
        onOpenChange={(open) => { if (!open) setShowUpdateConfirm(false); }}
        title="Actualizar Declaración"
        footer={
          <>
            <SecondaryButton
              label="Cancelar"
              onClick={() => setShowUpdateConfirm(false)}
              className="flex-1"
            />
            <PrimaryButton
              label="Actualizar"
              onClick={() => { setShowUpdateConfirm(false); executeProcessClosure(); }}
              disabled={isProcessing}
              className="flex-1"
            />
          </>
        }
      >
        <div className="py-4 space-y-3">
          <p className="font-bold text-center text-sm">
            ¿Deseas actualizar los montos de tu declaración?
          </p>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            La declaración pendiente será actualizada con los nuevos valores. Un administrador o encargado deberá aprobar el cierre.
          </p>
        </div>
      </BaseModal>
    </>
  );
}
