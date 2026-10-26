'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DollarSign, CreditCard, Layers, Edit, History, Eye, CheckCircle2, RefreshCw, AlertTriangle, ShieldCheck, FileText, Clock, Wallet, ArrowRight, Play, Square, Printer } from 'lucide-react';
import { cn, formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { isAdminLevel } from '@/lib/roles';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import PageHeader from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
// CAMBIO 2026-10: el botón "Reporte Entrega" navega a la vista dedicada cash_report;
// el modal CashReportModal fue eliminado (fuente única = CashReportView).

import { useCashClosures, useCreateCashClosure, useUpdateCashClosure, useSalesSinceLastClosure, useCashShiftExpected, useOpenCashShift } from '@/hooks/api/useCashClosures';
import { computeArqueo, type CashShiftBreakdown } from '@/lib/cash-arqueo';
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
    isRefetching: isRefetchingClosures,
    // F3-B1: exponer errores de carga — antes no se desestructuraban y un fallo de red
    // dejaba la vista en silencio (sin turno + $0 en resumen parecían datos reales).
    error: closuresError,
  } = useCashClosures(user?.activeStoreId, isAdminLevel(user?.role));

  const {
    data: salesData,
    isLoading: isLoadingSales,
    refetch: refetchSales,
    isRefetching: isRefetchingSales,
    error: salesError,
  } = useSalesSinceLastClosure(user?.activeStoreId);

  // v2.18.0: desglose del turno con EGRESOS de efectivo (RPC get_cash_shift_expected).
  // Misma ventana y fórmula que close_cash_shift → lo mostrado = lo que el cierre calculará.
  const {
    data: shiftExpected,
    isLoading: isLoadingExpected,
    refetch: refetchExpected,
    isRefetching: isRefetchingExpected,
    error: expectedError,
  } = useCashShiftExpected(user?.activeStoreId);

  const createClosure = useCreateCashClosure();
  const updateClosure = useUpdateCashClosure();
  // MISIÓN CP-CASH-OPENING-001: apertura por la vía autoritativa (RPC
  // open_cash_shift vía /api/cash-closures/open) con degradación legada.
  const openShift = useOpenCashShift();

  const [declaredCash, setDeclaredCash] = useState<number>(0);
  // MISIÓN CAJA v2.24.0 (D8): lado USD FÍSICO — contado/apertura por moneda.
  const [declaredCashUsd, setDeclaredCashUsd] = useState<number>(0);
  const [declaredVouchers, setDeclaredVouchers] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  // MISIÓN CP-CASH-OPENING-001: causa de la diferencia de apertura (contado −
  // libro físico). Obligatoria cuando hay discrepancia — regla espejo del RPC
  // open_cash_shift (ERR_OPENING_DIFFERENCE_NOTE_REQUIRED).
  const [differenceNote, setDifferenceNote] = useState<string>('');
  // Clave de idempotencia estable por apertura lógica (patrón v2.26).
  const idempotenciaRef = useRef<{ firma: string; key: string } | null>(null);

  // ── Confirmation modal ──
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [showOpenConfirm, setShowOpenConfirm] = useState(false);

  const cashClosures = cashClosuresData || [];
  const pendingClosure = cashClosures.find(c => c.status === 'pendiente');
  const finalizedClosures = cashClosures.filter(c => c.status === 'cerrado');

  // FIX F3-01: Al cerrar, el efectivo declarado se compara con (fondo inicial + ventas cash - salidas)
  // NO con solo ventas cash. El fondo inicial se guarda en opening_balance al abrir.
  const openingBalance = Number(pendingClosure?.opening_balance) || Number(shiftExpected?.opening_balance) || 0;

  const summary = {
    total_billed: shiftExpected?.total_sales ?? salesData?.total_sales ?? 0,
    total_cash: shiftExpected?.cash_sales ?? salesData?.total_cash ?? 0,
    total_transfer: shiftExpected?.transfer_sales ?? salesData?.total_transfer ?? 0,
  };

  // ── v2.21.0 — Arqueo con desglose completo (fórmula espejo del RPC) ──
  // Efectivo esperado = Fondo + Ventas cash + Anticipos producción cash
  //                     + Ingresos de caja documentados (fondo de cambio y otros)
  //                     − Pagos proveedores cash − Comisiones cash
  //                     − Egresos de caja documentados (devolución del fondo y otros)
  // Transferencias y Zelle NO son efectivo (lado vouchers del arqueo).
  // MISIÓN INGRESOS/EGRESOS (2026-10-20): los documentos de caja entran UNA
  // vez (ref_type='cash_flow'); los anulados aportan neto cero (fila contra).
  const salesCash = summary.total_cash || 0;
  const salesTransfer = summary.total_transfer || 0;
  const cashOutflows = Number(shiftExpected?.cash_outflows) || 0;
  const cashCommissions = Number(shiftExpected?.cash_commissions) || 0;
  const cashProduction = Number(shiftExpected?.cash_production) || 0;
  const cashFlowIn = Number(shiftExpected?.cash_flow_in) || 0;
  const cashFlowOut = Number(shiftExpected?.cash_flow_out) || 0;
  const cashRefunds = Number((shiftExpected as { cash_refunds?: number } | null | undefined)?.cash_refunds) || 0;
  const voucherRefunds = Number((shiftExpected as { voucher_refunds?: number } | null | undefined)?.voucher_refunds) || 0;
  const systemVouchers = (Number(shiftExpected?.transfer_sales) || 0) + (Number(shiftExpected?.zelle_sales) || 0) - voucherRefunds;

  const arqueo = computeArqueo(
    (shiftExpected || {
      opening_balance: openingBalance,
      total_sales: 0,
      cash_sales: salesCash,
      cash_outflows: 0,
      cash_production: 0,
      cash_commissions: 0,
      cash_flow_in: 0,
      cash_flow_out: 0,
      cash_refunds: 0,
      voucher_refunds: 0,
      transfer_sales: salesTransfer,
      zelle_sales: 0,
    }) as CashShiftBreakdown,
    declaredCash,
    declaredVouchers,
  );
  const systemCash = arqueo.expected_cash;

  // Desglose del balance del sistema (solo cuando hay turno abierto) — cada
  // componente visible suma/resta exactamente al Efectivo Esperado (cifra
  // reconstruible a partir de los movimientos válidos).
  const summaryItems = pendingClosure ? [
    { label: 'Fondo Inicial', value: openingBalance, color: 'text-muted-foreground' },
    { label: 'Ventas en Efectivo', value: salesCash, color: 'text-foreground' },
    ...(cashProduction > 0 ? [{ label: 'Anticipos Producción (Efectivo)', value: cashProduction, color: 'text-foreground' }] : []),
    ...(cashFlowIn > 0 ? [{ label: 'Ingresos de Caja (Fondo y Otros)', value: cashFlowIn, color: 'text-success' }] : []),
    ...(cashOutflows > 0 ? [{ label: 'Pagos a Proveedores (Efectivo)', value: -cashOutflows, color: 'text-destructive' }] : []),
    ...(cashCommissions > 0 ? [{ label: 'Comisiones (Efectivo)', value: -cashCommissions, color: 'text-destructive' }] : []),
    ...(cashFlowOut > 0 ? [{ label: 'Egresos de Caja (Devolución y Otros)', value: -cashFlowOut, color: 'text-destructive' }] : []),
    ...(cashRefunds > 0 ? [{ label: 'Reembolsos de Devoluciones (Efectivo)', value: -cashRefunds, color: 'text-destructive' }] : []),
    { label: 'Efectivo Esperado', value: systemCash, color: 'text-success' },
    { label: 'Transferencias/Zelle (Sistema)', value: systemVouchers + voucherRefunds, color: 'text-primary' },
    ...(voucherRefunds > 0 ? [{ label: 'Reembolsos por Voucher (Transfer/Zelle)', value: -voucherRefunds, color: 'text-destructive' }] : []),
  ] : [];

  // Restore pending closure state
  useEffect(() => {
    queueMicrotask(() => {
      if (pendingClosure) {
        // FIX F3-01: al reabrir un turno pendiente, restaurar declared_cash
        // Si el turno está pendiente (no cerrado), declared_cash puede ser:
        //   - El fondo inicial (si se acaba de abrir y no se ha editado)
        //   - El efectivo contado (si el cajero lo actualizó)
        setDeclaredCash(Number(pendingClosure.declared_cash) || 0);
        setDeclaredCashUsd(Number(pendingClosure.declared_cash_usd) || 0);
        setDeclaredVouchers(Number(pendingClosure.declared_vouchers) || 0);
        setNotes(pendingClosure.notes || '');
      }
    });
  }, [pendingClosure]);

  // ═══ MISIÓN CP-CASH-OPENING-001: base de la apertura = LIBRO FÍSICO por
  // moneda (get_cash_shift_expected.physical_cash — migración 20261026200000),
  // NUNCA el esperado canónico. «Fondo Inicial de Efectivo» es una declaración
  // de BILLETES contados: prellenarla con la valoración canónica presentaba el
  // residuo de valoración (p. ej. 2.820,00 CUP con libro 0/0) como fondo
  // inicial y, tras un cierre, además omitía el efectivo heredado del cajón
  // (sin turno pendiente la ventana canónica no lleva base de apertura).
  // Degradación limpia: sin physical_cash (migración no aplicada) se usa el
  // saldo heredado estimado anterior y la UI lo declara en el hint.
  const libroFisicoApertura = shiftExpected?.physical_cash ?? null;
  const usaLibroFisico = !pendingClosure && libroFisicoApertura != null;
  const baseAperturaCup = usaLibroFisico
    ? Math.round((Number(libroFisicoApertura?.CUP) || 0) * 100) / 100
    : Math.round((Number(shiftExpected?.expected_cash) || 0) * 100) / 100;
  const baseAperturaUsd = usaLibroFisico
    ? Math.round((Number(libroFisicoApertura?.USD) || 0) * 100) / 100
    : Math.round((Number(shiftExpected?.expected_cash_usd) || 0) * 100) / 100;

  // MISIÓN CAJA v2.24.0 (§10): APERTURA con saldo heredado por moneda.
  // Se PRELLLENA para que el cajero CONFIRME el efectivo contado; si declara
  // otra cosa, la diferencia se DOCUMENTA (opening_difference_*) — jamás se
  // sobreescribe el saldo silenciosamente ni se impone cero por conveniencia.
  const prefillDoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (pendingClosure || isLoadingExpected || !shiftExpected) return;
    const key = `${user?.activeStoreId ?? ''}:${shiftExpected.window_start}`;
    if (prefillDoneRef.current === key) return;
    prefillDoneRef.current = key;
    // MISIÓN CP-CASH-OPENING-001: prellenar con el LIBRO FÍSICO por moneda
    // (lo que el cajón contiene según los movimientos persistidos) — nunca
    // con la valoración canónica. El cajero ajusta al conteo real.
    setDeclaredCash(baseAperturaCup);
    setDeclaredCashUsd(baseAperturaUsd);
    setDeclaredVouchers(0);
    setDifferenceNote('');
  }, [pendingClosure, isLoadingExpected, shiftExpected, user?.activeStoreId, baseAperturaCup, baseAperturaUsd]);

  const totalDeclared = declaredCash + declaredVouchers;

  // MISIÓN CAJA v2.24.0 (D8): arqueo USD — diferencia = contado − esperado.
  // Espejo del RPC close_cash_shift v2.24.0 (se registra tal cual, sin
  // autoajuste: no se marca cuadrado un turno con diferencia real).
  const expectedCashUsd = Number(shiftExpected?.expected_cash_usd) || 0;
  const openingUsdExpected = pendingClosure
    ? (Number(pendingClosure.opening_balance_usd) || 0)
    : expectedCashUsd;
  const usdDiff = pendingClosure
    ? Math.round((declaredCashUsd - expectedCashUsd) * 100) / 100
    : 0;
  // MISIÓN CP-CASH-OPENING-001: diferencias de APERTURA documentadas contra
  // el LIBRO FÍSICO por moneda (contado − libro) — la base correcta de una
  // declaración de billetes. Antes se comparaba contra el esperado canónico:
  // un conteo correcto de 0 con residuo 2.820 quedaba marcado como
  // «diferencia de apertura −2.820» (clasificación errónea de la valoración).
  const openingDiffCup = Math.round((declaredCash - baseAperturaCup) * 100) / 100;
  const openingDiffUsd = Math.round((declaredCashUsd - baseAperturaUsd) * 100) / 100;
  const hayDiferenciaApertura = !pendingClosure
    && (Math.abs(openingDiffCup) > 0.01 || Math.abs(openingDiffUsd) > 0.01);
  const motivoDiferencia = differenceNote.trim();
  // Regla espejo del RPC open_cash_shift: discrepancia contado vs libro exige
  // causa documentada (≥ 10 caracteres). JAMÁS ingresos/egresos automáticos.
  const motivoValido = motivoDiferencia.length >= 10;
  const aperturaBloqueada = hayDiferenciaApertura && !motivoValido;
  // Residuo de valoración INFORMATIVO en la apertura (esperado canónico −
  // libro físico CUP): visible y trazable, jamás fondo, jamás disponible.
  const aperturaResidualCup = !pendingClosure && shiftExpected?.physical_cash != null
    ? Math.round(((Number(shiftExpected.expected_cash) || 0) - (Number(shiftExpected.physical_cash.CUP) || 0)) * 100) / 100
    : null;
  const hayResidualApertura = aperturaResidualCup != null && Math.abs(aperturaResidualCup) >= 0.005;

  // MISIÓN CAJA v2.24.0 (§9): lado USD FÍSICO del arqueo — equivalente
  // contable identificado como tal; no reemplaza el control de cantidades
  // físicas en USD ni se suma al CUP como si fueran unidades iguales.
  const usdItems = pendingClosure ? [
    { label: 'Fondo Inicial USD', value: openingUsdExpected },
    { label: 'Efectivo USD Esperado (libro físico)', value: expectedCashUsd },
  ] : [];

  // v2.18.0: diferencia con convención explícita (contado − esperado),
  // espejo del cálculo server-side de close_cash_shift (fuente autoritativa).
  const cashDiff = pendingClosure ? arqueo.cash_diff : 0;
  const voucherDiff = pendingClosure ? arqueo.voucher_diff : 0;
  const difference = pendingClosure ? arqueo.difference : 0;

  // CP-ORG-002: 'superadmin' añadido — espejo EXACTO del bypass server-side
  // de has_store_role_as (profiles.role IN ('admin','superadmin') → cierre
  // autorizado en la DB). Sin esto, la UI negaba con AccessDenied un módulo
  // que el servidor SÍ autoriza a la cuenta de plataforma (0 membresías por
  // diseño). Manager/encargado requieren membresía — la DB la re-valida.
  const canClose = useMemo(
    () => ['admin', 'superadmin', 'manager', 'encargado'].includes(user?.role || ''),
    [user?.role]
  );

  // CP-ORG-002: mismo criterio — roles de contrato ['superadmin'] deben pasar.
  const allowedRoles = ['admin', 'superadmin', 'manager', 'encargado', 'clerk'];
  const isAuthorized = user?.roles?.some(r => allowedRoles.includes(r)) ?? false;

  // ── Process Closure ──
  const executeProcessClosure = async () => {
    if (!user?.activeStoreId) return;

    if (pendingClosure) {
      // FIX F3-01: Al cerrar, NO sobreescribir opening_balance. Solo actualizar declared_cash.
      const shouldFinalize = canClose;
      // MISIÓN POLÍTICA TEMPORAL (2026-10-18): se elimina `closed_at` calculado
      // en el cliente (UTC del navegador) del payload — era código muerto en el
      // camino real de cierre (useUpdateCashClosure solo envía closure_id +
      // declarados a /api/cash-closures/close y el RPC close_cash_shift estampa
      // closed_at = NOW() del servidor, autoritativo). Política de caja por
      // ventana temporal: el turno nunca confía en fechas del cliente.
      updateClosure.mutate({
        id: pendingClosure.id,
        closure: {
          status: shouldFinalize ? 'cerrado' : 'pendiente',
          declared_cash: declaredCash,
          declared_cash_usd: declaredCashUsd,
          declared_vouchers: declaredVouchers,
          declared_total: totalDeclared,
          // FIX F3-04: system_expected_total = fondo inicial + ventas cash + transferencias
          system_expected_total: systemCash + systemVouchers,
          difference: difference,
          notes: notes
          // FIX F3-01: NO incluir opening_balance aquí — se preserva del INSERT inicial
        }
      });
    } else {
      // ═══ MISIÓN CP-CASH-OPENING-001: apertura por la VÍA AUTORITATIVA ═══
      // POST /api/cash-closures/open → RPC open_cash_shift: base del LIBRO
      // FÍSICO por moneda, nota de diferencia obligatoria, apertura canónica
      // CUP con los billetes USD valorados a la tasa del SERVIDOR, idempotencia
      // y auditoría atómica. La apertura NO crea movimientos de caja: el fondo
      // declarado es la base del arqueo al cierre (se contabiliza UNA vez).
      const r2v24 = (n: number) => Math.round(n * 100) / 100;
      const motivo = hayDiferenciaApertura ? motivoDiferencia : null;
      const diffNote = hayDiferenciaApertura
        ? `[APERTURA CON DIFERENCIA DOCUMENTADA] libro CUP ${r2v24(baseAperturaCup)} / USD ${r2v24(baseAperturaUsd)}; contado CUP ${r2v24(declaredCash)} / USD ${r2v24(declaredCashUsd)}. Causa: ${motivo}`
        : null;
      // Clave de idempotencia estable por apertura LÓGICA: se reutiliza en
      // reintentos con los mismos valores (el índice único de turno pendiente
      // y el idempotency_registry del RPC evitan duplicados) y se regenera al
      // cambiar cualquier valor declarado.
      const firmaApertura = `${user.activeStoreId}|${r2v24(declaredCash)}|${r2v24(declaredCashUsd)}|${notes.trim()}|${motivo ?? ''}`;
      if (idempotenciaRef.current?.firma !== firmaApertura) {
        idempotenciaRef.current = { firma: firmaApertura, key: `open-${crypto.randomUUID()}` };
      }
      openShift.mutate({
        store_id: user.activeStoreId,
        counted_cup: r2v24(declaredCash),
        counted_usd: r2v24(declaredCashUsd),
        opening_note: notes.trim() || null,
        difference_note: motivo,
        idempotency_key: idempotenciaRef.current.key,
        // Fallback legado (501 fallback:true — RPC ausente en el esquema):
        // INSERT directo bajo RLS con los MISMOS valores confirmados en el
        // formulario. «Otros Fondos Iniciales» ELIMINADO de la apertura
        // (dictamen Fase D): declared_vouchers queda en 0 — el campo solo
        // tiene sentido en el cierre como «Transferencias Contadas».
        legacy_insert: {
          store_id: user.activeStoreId,
          user_id: user.id,
          declared_cash: r2v24(declaredCash), // fondo inicial (se sobreescribe al cerrar)
          opening_balance: r2v24(declaredCash), // FIX F3-01: preservar fondo inicial
          opening_balance_cup: r2v24(declaredCash),
          opening_balance_usd: r2v24(declaredCashUsd),
          opening_difference_cup: Math.abs(openingDiffCup) > 0.01 ? openingDiffCup : null,
          opening_difference_usd: Math.abs(openingDiffUsd) > 0.01 ? openingDiffUsd : null,
          opening_difference_note: motivo,
          declared_cash_usd: r2v24(declaredCashUsd),
          declared_vouchers: 0,
          declared_total: r2v24(declaredCash),
          system_expected_total: 0,
          difference: 0,
          notes: [notes.trim(), diffNote].filter(Boolean).join(' ') || null,
          status: 'pendiente',
        },
      });
    }
  };

  const handleProcessClosure = () => {
    // Show confirmation modal before proceeding
    if (!pendingClosure) {
      // Apertura de turno — regla espejo del RPC: sin causa documentada para
      // la discrepancia contado vs libro, la apertura no se oferta (botón
      // deshabilitado; guard defensivo ante cualquier otra vía de invocación).
      if (aperturaBloqueada) return;
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

  const isProcessing = createClosure.isPending || updateClosure.isPending || openShift.isPending;
  const isRefreshing = isRefetchingClosures || isRefetchingSales || isRefetchingExpected;
  const isLoading = isLoadingClosures || isLoadingSales || isLoadingExpected;
  // F3-B1: error de carga solo bloquea si además no hay datos que mostrar;
  // si hay datos stale, se muestran y el usuario puede refrescar como siempre.
  const loadError = (closuresError ?? salesError ?? expectedError) || null;
  const showLoadError = !!loadError && !cashClosuresData;

  const handleRefresh = async () => {
    await Promise.all([refetchClosures(), refetchSales(), refetchExpected()]);
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
  const cashInputLabel = isOpening ? 'Fondo Inicial de Efectivo (CUP)' : 'Efectivo Contado CUP (Final)';
  const cashInputPlaceholder = isOpening ? 'Ej. 100.00 (cambio inicial)' : '0.00';
  const cashInputHint = isOpening
    ? (usaLibroFisico
        ? 'Billetes CUP con los que abre el cajón — prellenado con el LIBRO FÍSICO por moneda; ajusta al conteo real.'
        : 'Billetes CUP con los que abre el cajón — prellenado con el saldo heredado estimado (libro físico no disponible en este entorno); ajusta al conteo real.')
    : 'Cuenta el efectivo físico en CUP al final del turno.';
  const cashUsdInputLabel = isOpening ? 'Fondo Inicial USD (físico)' : 'Efectivo Contado USD (Final)';
  const cashUsdInputHint = isOpening
    ? 'Billetes USD con los que arranca el cajón (prellenado con el libro físico por moneda).'
    : 'Billetes USD contados al cerrar — el arqueo USD se registra sin autoajuste.';
  // MISIÓN CP-CASH-OPENING-001 (Fase D): «Otros Fondos Iniciales (opcional)»
  // ELIMINADO de la apertura — ambiguo (sin moneda; mezclaba vouchers con un
  // fondo físico) y sin función contable (open_cash_shift no lo acepta; nada
  // consume los vouchers de apertura). El campo se conserva EXCLUSIVAMENTE
  // en el cierre como «Transferencias Contadas (Final)» (conciliación por
  // vouchers — legítima e inequívoca).
  const vouchersInputLabel = 'Transferencias Contadas (Final)';
  const notesLabel = isOpening ? 'Notas de Apertura' : 'Observaciones del Cierre';

  const actions: Action[] = [
    {
      id: 'refresh',
      label: isRefreshing ? 'Actualizando...' : 'Actualizar',
      icon: RefreshCw,
      onClick: handleRefresh,
      disabled: isRefreshing,
      // FIX (CAMBIO 2026-10): la animación de giro iba en `className` y
      // ActionMenu la aplicaba al <button> completo — durante la recarga
      // rotaba el botón entero, no solo el icono. Ahora va en
      // `iconClassName` (prop nueva de ActionMenu): SOLO gira el icono
      // RefreshCw mientras isRefreshing; el botón permanece estático.
      // La clase `animate-spin-slow` (landing.css) no se modifica — otras
      // vistas ya la aplican al icono con este mismo patrón.
      // `disabled: isRefreshing` sigue evitando solicitudes duplicadas.
      iconClassName: isRefreshing ? 'animate-spin-slow' : ''
    },
    {
      id: 'process',
      label: buttonLabel,
      icon: buttonIcon,
      onClick: handleProcessClosure,
      variant: buttonVariant,
      // MISIÓN CP-CASH-OPENING-001: en la apertura, la discrepancia contado vs
      // libro físico sin causa documentada BLOQUEA el botón (regla clara y
      // trazable — espejo de ERR_OPENING_DIFFERENCE_NOTE_REQUIRED del RPC).
      disabled: isProcessing || isLoadingSales || aperturaBloqueada,
      ...(aperturaBloqueada ? { title: 'Documenta la causa de la diferencia (mínimo 10 caracteres) para habilitar la apertura.' } : {})
    }
  ];

  // ── Guard: unauthorized access ──
  if (!isAuthorized) return <AccessDenied />;

  return (
    <>
      <div className="space-y-6">
        {/* F2: PageHeader — jerarquía estándar (GATE 1.3: UN concepto "Caja";
            el arqueo, cierre y reporte viven DENTRO). El estado del turno es la
            descripción dinámica de la página. */}
        <PageHeader
          title="Caja"
          icon={DollarSign}
          description={pendingClosure ? (
            <div className="flex items-center gap-1.5 text-xs text-success font-semibold">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Turno abierto desde {formatDate(pendingClosure.created_at)} {formatTime(pendingClosure.created_at)}
            </div>
          ) : salesData?.last_closure_at ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              Último cierre: {formatDate(salesData.last_closure_at)} {formatTime(salesData.last_closure_at)}
            </div>
          ) : undefined}
          secondaryActions={
            <div className="w-full sm:w-auto flex items-center gap-2">
              {/* CAMBIO 2026-10: navega a la VISTA dedicada cash_report (CashReportView).
                  El modal overlay fue eliminado — acceso coherente con el menú Ventas
                  y el botón de POS (mismo destino, sin segunda implementación). */}
              <button
                type="button"
                onClick={() => setCurrentView('cash_report')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary/20 text-primary hover:bg-primary/10 transition-colors text-xs font-medium tracking-normal min-h-[44px]"
                title="Reporte de caja con desglose de billetes para entrega de dinero"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Reporte Entrega</span>
              </button>
              {/* FIX-B4: Botón de Cuentas por Pagar */}
              <button
                type="button"
                onClick={() => setCurrentView('accounts-payable')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 text-amber-600 dark:text-amber-500 hover:bg-amber-500/10 transition-colors text-xs font-medium tracking-normal min-h-[44px]"
                title="Ver cuentas por pagar y vencimientos"
              >
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">Cuentas por Pagar</span>
              </button>
              <ActionMenu
                actions={actions}
                sticky={false}
                className="shadow-none bg-transparent"
              />
            </div>
          }
        />

        {/* Loading skeleton */}
        {isLoading ? (
          <ClosureLoadingSkeleton />
        ) : showLoadError ? (
          /* F3-B1: error de carga con acción de reintento (antes quedaba en silencio) */
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-4 text-center w-full bg-destructive/5 border border-destructive/20 rounded-2xl p-8"
          >
            <AlertTriangle className="w-8 h-8 text-destructive" aria-hidden="true" />
            <p className="font-bold text-destructive">Error al cargar los datos de caja</p>
            <p className="text-sm text-destructive/80 max-w-md">
              {loadError instanceof Error ? loadError.message : 'No se pudieron cargar los datos. Verifica tu conexión e intenta nuevamente.'}
            </p>
            <button
              type="button"
              onClick={handleRefresh}
              className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              Reintentar
            </button>
          </div>
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
                    disabled={aperturaBloqueada}
                    title={aperturaBloqueada ? 'Documenta la causa de la diferencia contado vs libro (mínimo 10 caracteres) en el formulario de apertura.' : undefined}
                    data-testid="btn-abrir-turno-vacio"
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-black text-xs sm:text-sm uppercase tracking-widest shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                      {summary.total_billed !== undefined && (
                        <>Ventas: <span className="font-black text-foreground">{formatCurrency(summary.total_billed)}</span> · </>
                      )}
                      Efectivo: <span className="font-black text-foreground">{formatCurrency(summary.total_cash || 0)}</span> · Transf: <span className="font-black text-foreground">{formatCurrency(summary.total_transfer || 0)}</span>
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

                  {/* MISIÓN CAJA v2.24.0 (D8): lado USD FÍSICO por moneda */}
                  <div className="space-y-1.5">
                    <label htmlFor="cash-declared-usd" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">
                      {cashUsdInputLabel}
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 w-5 h-5" />
                      <input
                        id="cash-declared-usd"
                        type="number"
                        min={0}
                        step={0.01}
                        aria-label={cashUsdInputLabel}
                        value={declaredCashUsd || ''}
                        onChange={(e) => setDeclaredCashUsd(Math.max(0, Number(e.target.value)))}
                        className="w-full p-4 pl-12 rounded-xl border border-border bg-background text-2xl font-black font-mono focus:ring-1 focus:ring-emerald-500 outline-none"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-1">{cashUsdInputHint}</p>
                  </div>

                  {/* MISIÓN CP-CASH-OPENING-001 (Fase D): el campo vouchers YA
                      NO existe en la apertura («Otros Fondos Iniciales»
                      eliminado — dictamen en el expediente). Solo se declara
                      en el CIERRE como «Transferencias Contadas (Final)». */}
                  {!isOpening && (
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
                  )}

                  {/* MISIÓN CP-CASH-OPENING-001: en la apertura NO se suman
                      monedas distintas — el fondo se declara POR MONEDA. En el
                      cierre el total declarado sigue siendo CUP canónico +
                      vouchers (ambos expresados en CUP). */}
                  <div className="p-4 rounded-xl bg-muted/50 border border-border">
                    {isOpening ? (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">
                            Fondo inicial declarado (por moneda)
                          </span>
                        </div>
                        <div className="flex items-baseline gap-3 tabular-nums mt-1">
                          <span className="text-2xl font-black font-mono text-primary">{formatCurrency(declaredCash)}</span>
                          <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(declaredCashUsd, 'USD')}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Billetes CUP y USD por separado — no se suman unidades de monedas distintas.
                        </p>
                      </>
                    ) : (
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">
                          Total Declarado
                        </span>
                        <span className="text-2xl font-black font-mono text-primary">{formatCurrency(totalDeclared)}</span>
                      </div>
                    )}
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

                  {/* ═══ MISIÓN CP-CASH-OPENING-001: conciliación de la apertura
                      contra el LIBRO FÍSICO + residuo de valoración informativo.
                      La discrepancia contado vs libro exige CAUSA documentada
                      (regla espejo del RPC); la valoración canónica NUNCA es
                      fondo ni disponible. ═══ */}
                  {isOpening && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-border bg-background p-4 space-y-2" data-testid="apertura-conciliacion">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Conciliación con el libro físico{usaLibroFisico ? '' : ' (base estimada — libro físico no disponible)'}
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-bold uppercase">Libro CUP</span>
                            <span className="font-black font-mono">{formatCurrency(baseAperturaCup)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-bold uppercase">Libro USD</span>
                            <span className="font-black font-mono">{formatCurrency(baseAperturaUsd, 'USD')}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-bold uppercase">Contado CUP</span>
                            <span className="font-black font-mono">{formatCurrency(declaredCash)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-bold uppercase">Contado USD</span>
                            <span className="font-black font-mono">{formatCurrency(declaredCashUsd, 'USD')}</span>
                          </div>
                        </div>
                        <div className={cn(
                          'flex justify-between items-center p-3 rounded-lg border',
                          hayDiferenciaApertura ? 'bg-warning/10 border-warning/30' : 'bg-success/10 border-success/25',
                        )} data-testid="apertura-diferencia">
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            Diferencia de apertura (contado − libro)
                          </span>
                          <span className={cn('text-sm font-black font-mono tabular-nums', hayDiferenciaApertura ? 'text-warning' : 'text-success')} data-testid="apertura-diferencia-cifra">
                            {openingDiffCup > 0 ? '+' : ''}{formatCurrency(openingDiffCup)} CUP · {openingDiffUsd > 0 ? '+' : ''}{formatCurrency(openingDiffUsd, 'USD')}
                          </span>
                        </div>
                        {hayDiferenciaApertura && (
                          <div className="space-y-1.5" data-testid="apertura-motivo">
                            <label htmlFor="opening-difference-note" className="text-[10px] font-black uppercase tracking-widest text-warning block">
                              Causa de la diferencia (obligatoria — mínimo 10 caracteres)
                            </label>
                            <textarea
                              id="opening-difference-note"
                              aria-label="Causa de la diferencia de apertura"
                              value={differenceNote}
                              onChange={(e) => setDifferenceNote(e.target.value)}
                              className={cn(
                                'w-full p-3 rounded-xl border bg-background text-xs font-medium resize-none h-16 focus:ring-1 outline-none',
                                motivoValido ? 'border-success/40 focus:ring-success' : 'border-warning/50 focus:ring-warning',
                              )}
                              placeholder="Ej. Faltan billetes por entrega no registrada; sobrante por vuelto sin registrar…"
                            />
                            {!motivoValido && (
                              <p className="text-[10px] font-bold text-warning" data-testid="apertura-motivo-aviso">
                                La apertura no puede completarse con una discrepancia sin causa documentada. Corrige el conteo o registra la causa autorizada — el sistema NUNCA genera ingresos ni egresos automáticos para cuadrar.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {hayResidualApertura && (
                        <div className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 flex items-start gap-2.5" data-testid="apertura-residual" role="status">
                          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                          <div className="min-w-0 text-[11px] leading-relaxed">
                            <p className="font-black uppercase tracking-widest text-[10px] text-warning">
                              Diferencia de valoración contable CUP — no es efectivo disponible
                            </p>
                            <p className="tabular-nums mt-0.5">
                              <span className="font-black">{formatCurrency(aperturaResidualCup ?? 0)}</span>
                              <span className="text-muted-foreground"> · esperado canónico {formatCurrency(Number(shiftExpected?.expected_cash) || 0)} − libro físico {formatCurrency(Number(shiftExpected?.physical_cash?.CUP) || 0)}</span>
                            </p>
                            <p className="text-muted-foreground mt-0.5">
                              Valoración de cobros y entregas en otra moneda a sus tasas históricas. Este importe no prellena el fondo inicial ni autoriza salidas — el fondo se declara con billetes contados.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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

                    {/* MISIÓN CAJA v2.24.0 (§9): lado USD físico — equivalente identificado,
                        saldos físicos separados (no se suman al canónico CUP) */}
                    {usdItems.length > 0 && (
                      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                          Efectivo USD del turno · físico (no sumado al canónico CUP)
                        </p>
                        {usdItems.map((row) => (
                          <div key={row.label} className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground font-bold uppercase">{row.label}</span>
                            <span className="font-black font-mono tabular-nums">{formatCurrency(row.value, 'USD')}</span>
                          </div>
                        ))}
                      </div>
                    )}

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

                    {/* MISIÓN CAJA v2.24.0 (D8): diferencia USD — se registra tal cual,
                        jamás se autoajusta; un turno con diferencia real no se marca cuadrado */}
                    <div className={cn(
                      "flex justify-between items-center p-4 rounded-xl border",
                      usdDiff === 0 ? "bg-success/10 border-success/25" :
                      usdDiff < 0 ? "bg-destructive/10 border-destructive/25" : "bg-warning/10 border-warning/25"
                    )}>
                      <div className="text-left">
                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground block">Diferencia USD (físico)</span>
                        <span className="text-[10px] text-muted-foreground">
                          Contado {formatCurrency(declaredCashUsd, 'USD')} · esperado {formatCurrency(expectedCashUsd, 'USD')}
                        </span>
                      </div>
                      <span className={cn(
                        "text-xl font-black font-mono tabular-nums",
                        usdDiff === 0 ? "text-success" : usdDiff < 0 ? "text-destructive" : "text-warning"
                      )}>
                        {usdDiff > 0 ? '+' : ''}{formatCurrency(usdDiff, 'USD')}
                      </span>
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
            {/* MISIÓN CP-CASH-OPENING-001: el fondo se confirma POR MONEDA
                (billetes contados) contra el LIBRO FÍSICO — nunca la
                valoración canónica ni vouchers ajenos al conteo. */}
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground uppercase">Fondo contado CUP</span>
              <span className="text-xs font-black text-primary tabular-nums">{formatCurrency(declaredCash)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground uppercase">Fondo contado USD (físico)</span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(declaredCashUsd, 'USD')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground uppercase">
                Libro físico esperado{usaLibroFisico ? '' : ' (estimado)'}
              </span>
              <span className="text-xs font-black tabular-nums">
                {formatCurrency(baseAperturaCup)} · {formatCurrency(baseAperturaUsd, 'USD')}
              </span>
            </div>
            {hayDiferenciaApertura && (
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-warning uppercase">Diferencia documentada</span>
                <span className="text-xs font-black text-warning tabular-nums">
                  {openingDiffCup > 0 ? '+' : ''}{formatCurrency(openingDiffCup)} CUP · {openingDiffUsd > 0 ? '+' : ''}{formatCurrency(openingDiffUsd, 'USD')}
                </span>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground">
              Este fondo físico es la base del arqueo al cierre. La apertura NO crea movimientos de caja: cada entrada o salida de dinero se documenta aparte (Ingresos/Egresos) con su causa y responsable.
            </div>
          </div>
          {hayDiferenciaApertura && (
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/25 text-[11px] font-bold text-warning text-center leading-relaxed">
              Apertura con diferencia documentada contra el libro físico — causa: «{motivoDiferencia}».
              La diferencia queda registrada en auditoría (no se sobreescribe el saldo silenciosamente ni se generan movimientos compensatorios).
            </div>
          )}
          {hayResidualApertura && (
            <div className="p-3 rounded-xl bg-muted/50 border border-border text-[11px] text-muted-foreground leading-relaxed">
              Existe además una diferencia de valoración contable de {formatCurrency(aperturaResidualCup ?? 0)} (esperado canónico − libro físico CUP)
              por flujos en otra moneda valorados a tasas históricas: es una valoración, NO efectivo disponible — no forma parte del fondo declarado.
            </div>
          )}
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
              <span className="text-xs font-bold text-muted-foreground uppercase">Efectivo Esperado (Sistema)</span>
              <span className="text-xs font-black tabular-nums">{formatCurrency(arqueo.expected_cash)}</span>
            </div>
            {/* MISIÓN CAJA v2.24.0 (D8): lado USD físico del arqueo */}
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground uppercase">Efectivo USD Esperado (físico)</span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(expectedCashUsd, 'USD')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground uppercase">Transferencias/Zelle (Sistema)</span>
              <span className="text-xs font-black tabular-nums">{formatCurrency(arqueo.expected_vouchers)}</span>
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
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase">Diferencia USD (físico)</span>
              <span className={cn(
                "text-sm font-black tabular-nums",
                usdDiff === 0 ? "text-success" : usdDiff < 0 ? "text-destructive" : "text-warning"
              )}>{usdDiff > 0 ? '+' : ''}{formatCurrency(usdDiff, 'USD')}</span>
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

      {/* CAMBIO 2026-10: el modal de Reporte de Caja fue eliminado; el botón
          "Reporte Entrega" navega a la vista dedicada cash_report (arriba). */}
    </>
  );
}
