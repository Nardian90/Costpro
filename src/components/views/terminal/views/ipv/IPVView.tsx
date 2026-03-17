'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BankTransaction } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileUp,
  Settings,
  History,
  Play,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  ArrowRight,
  Clock,
  TrendingUp,
  Workflow,
  Database,
  Table2,
  Cpu,
  Zap,
  BarChart4,
  PackageSearch,
  FileSearch,
  Receipt,
  ArrowRightLeft,
  QrCode,
  ChevronDown
} from 'lucide-react';
import { MatchingAuditView } from './MatchingAuditView';
import { BankIngestion } from './BankIngestion';
import { TransactionTable } from './TransactionTable';
import { CatalogTable } from './CatalogTable';
import MovementsView from './MovementsView';
import { MatchingSimulation } from './MatchingSimulation';
import { TransactionBreakdown } from './TransactionBreakdown';
import { PivotStatementView } from './PivotStatementView';
import { ManualReconciliationView } from './ManualReconciliationView';
import { IPVReportsDropdown } from './IPVReportsDropdown';
import { IPVReportView } from './IPVReportView';
import { IPVInstitutionalDashboard } from './IPVInstitutionalDashboard';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { MatchingEngine } from '@/lib/ipv/engine';
import { toast } from 'sonner';
import ActionMenu, { Action } from "@/components/ui/ActionMenu";

export default function IPVView() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isStarted, setIsStarted] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState(0);
  const [matchMessage, setMatchMessage] = useState('');
  const [selectedReconTx, setSelectedReconTx] = useState<BankTransaction | null>(null);

  const transactions = useLiveQuery(() => db.bank_statements.orderBy('fecha').reverse().toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const productMovements = useLiveQuery(() => db.product_movements.toArray());
  const ingestionErrorsCount = useLiveQuery(() => db.ingestion_errors.count()) || 0;
  const rules = useLiveQuery(() => db.matching_rules.where('activo').equals(1).toArray());

  // Mapa de stock actual para el motor de matching y simulación
  const currentStockMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!products || !reconciliationLines || !productMovements) return map;

    products.forEach(p => {
        const sold = reconciliationLines
            .filter(l => l.product_cod === p.cod)
            .reduce((sum, l) => sum + (l.cantidad || 0), 0);

        const entrances = productMovements
            .filter(m => m.producto_destino_cod === p.cod && m.tipo === 'DECOMPOSITION')
            .reduce((sum, m) => sum + (m.cantidad_destino || 0), 0);

        const exits = productMovements
            .filter(m => m.producto_origen_cod === p.cod && m.tipo === 'DECOMPOSITION')
            .reduce((sum, m) => sum + (m.cantidad_origen || 0), 0);

        map.set(p.cod, (p.stock_inicial_manual || 0) + entrances - exits - sold);
    });
    return map;
  }, [products, reconciliationLines, productMovements]);

  // Optimización: Cálculos pesados de conciliación movidos a useMemo con dependencias granulares
  const txTotals = useMemo(() => {
    if (!reconciliationLines) return {} as Record<string, number>;
    const totals: Record<string, number> = {};
    for (let i = 0; i < reconciliationLines.length; i++) {
        const line = reconciliationLines[i];
        totals[line.transaction_ref] = (totals[line.transaction_ref] || 0) + line.importe_linea_cents;
    }
    return totals;
  }, [reconciliationLines]);

  const stats = useMemo(() => {
    if (!transactions) return { total: 0, squared: 0, inProcess: 0, pending: 0, percentage: 0, totalSales: 0, totalTransferencias: 0, totalEfectivo: 0 };

    let squared = 0;
    let inProcess = 0;
    let pending = 0;
    let activeTotal = 0;
    let totalSales = 0;
    let totalTransferencias = 0;
    let totalEfectivo = 0;

    transactions.forEach(t => {
      if (t.excluido) return;
      activeTotal++;

      const reconciledCents = txTotals[t.referencia_origen] || 0;
      totalSales += reconciledCents;

      // Clasificación por montos ya conciliados
      if (reconciledCents > 0) {
          // Necesitamos las líneas para saber si es efectivo o transferencia,
          // pero para las stats globales simplificamos o buscamos en reconciliationLines
          // (esta parte podría optimizarse si se guarda en bank_statements)
      }

      if (t.estado_conciliacion === 'COMPLETO') squared++;
      else if (t.estado_conciliacion === 'PARCIAL') inProcess++;
      else pending++;
    });

    // Calcular montos por tipo de las líneas directamente
    if (reconciliationLines) {
        reconciliationLines.forEach(l => {
            if (l.clasificacion === 'Efectivo') totalEfectivo += l.importe_linea_cents;
            else totalTransferencias += l.importe_linea_cents;
        });
    }

    return {
      total: activeTotal,
      squared,
      inProcess,
      pending,
      percentage: activeTotal > 0 ? Math.round((squared / activeTotal) * 100) : 0,
      totalSales,
      totalTransferencias,
      totalEfectivo
    };
  }, [transactions, txTotals, reconciliationLines]);

  const handleGlobalRecalculate = React.useCallback(async () => {
    const loadingToast = toast.loading('Recalculando sistema...');
    try {
        const { recalculateIPVReportsChain } = await import('@/lib/ipv/utils');
        await recalculateIPVReportsChain(db);
        toast.success('Sistema recalculado correctamente', { id: loadingToast });
    } catch (error) {
        toast.error('Error al recalcular', { id: loadingToast });
    }
  }, []);

  const handleRunMatching = React.useCallback(async () => {
    if (!transactions || transactions.length === 0) {
      toast.error('No hay transacciones para procesar');
      return;
    }

    if (!products || products.length === 0) {
        toast.error('El catálogo de productos está vacío');
        return;
    }

    setIsMatching(true);
    setMatchMessage('Iniciando proceso de matching...');

    // Preparar transacciones para el worker, incluyendo el total ya conciliado
    const allLines = await db.reconciliation_lines.toArray();
    const txTotalsMap = allLines.reduce((acc, line) => {
        acc[line.transaction_ref] = (acc[line.transaction_ref] || 0) + line.importe_linea_cents;
        return acc;
    }, {} as Record<string, number>);

    setMatchMessage('Ejecutando algoritmos de matching...');

    const transactionsToProcess = transactions
        .filter(t => t.estado_conciliacion !== 'COMPLETO' && !t.excluido)
        .map(t => ({
            ...t,
            current_reconciled_cents: txTotalsMap[t.referencia_origen] || 0
        }));

    if (transactionsToProcess.length === 0) {
        toast.info('Todas las transacciones ya están completadas o excluidas.');
        setIsMatching(false);
        return;
    }

    // Aquí invocaríamos al Worker
    const worker = new Worker(new URL('@/lib/ipv/matching.worker.ts', import.meta.url));

    worker.postMessage({
      type: 'RECONCILE_BATCH',
      transactions: transactionsToProcess,
      products: products,
      rules,
      stockMap: currentStockMap
    });

    worker.onmessage = async (e) => {
      if (e.data.type === 'PROGRESS') {
          setMatchProgress(e.data.percentage);
          setMatchMessage(`Procesando: ${e.data.percentage}%`);
      } else if (e.data.type === 'SUCCESS') {
          const { results } = e.data;

          let completedCount = 0;
          for (const res of results) {
              if (res.status === 'COMPLETO' || res.status === 'PARCIAL') {
                  if (res.lines.length > 0) {
                      await db.reconciliation_lines.bulkPut(res.lines);
                  }
                  if (res.movements && res.movements.length > 0) {
                      await db.product_movements.bulkPut(res.movements);
                  }
                  await db.bank_statements.update(res.transactionId, {
                      estado_conciliacion: res.status
                  });
                  completedCount++;
              }
          }

          toast.success(`Proceso finalizado: ${completedCount} transacciones conciliadas.`);
          setIsMatching(false);
          setMatchProgress(0);
          worker.terminate();
      } else if (e.data.type === 'ERROR') {
          toast.error(`Error en el motor: ${e.data.error}`);
          setIsMatching(false);
          setMatchProgress(0);
          worker.terminate();
      }
    };

    worker.onerror = (err) => {
        console.error('Worker error:', err);
        toast.error('Error crítico en el proceso de matching');
        setIsMatching(false);
        worker.terminate();
    };

  }, [transactions, products, currentStockMap, rules]);

  const ipvActions: Action[] = useMemo(() => [
    { id: "recalculate", label: "Recalcular", icon: RefreshCw, onClick: handleGlobalRecalculate },
    {
        id: "run-matching",
        label: "Analizar Todo",
        icon: Play,
        onClick: handleRunMatching,
        variant: 'primary' as const,
        className: 'font-black',
        tooltip: (
            <>
                <p className="font-bold text-primary">Motor de Matching Pro:</p>
                <p className="text-xs leading-relaxed">
                    Procesa transacciones en 4 pasos automáticos:
                    <br/>1. <strong>Hard Ref:</strong> Match por código en obs.
                    <br/>2. <strong>Exact Sum:</strong> Combinación exacta de productos.
                    <br/>3. <strong>Tolerance:</strong> Match con pequeño margen de error.
                    <br/>4. <strong>Cash Fill:</strong> Cubre el resto con ajuste de caja.
                </p>
            </>
        )
    }
  ], [handleGlobalRecalculate, handleRunMatching]);

  const menuActions: Action[] = useMemo(() => [
    { id: 'dashboard', label: 'Flujo', icon: Workflow, onClick: () => setActiveTab('dashboard'), active: activeTab === 'dashboard' },
    { id: 'analytics', label: 'Dashboard', icon: TrendingUp, onClick: () => setActiveTab('analytics'), active: activeTab === 'analytics' },
    { id: 'ingestion', label: 'Extracto', icon: Database, onClick: () => setActiveTab('ingestion'), active: activeTab === 'ingestion' },
    { id: 'catalog', label: 'Catálogo', icon: PackageSearch, onClick: () => setActiveTab('catalog'), active: activeTab === 'catalog' },
    { id: 'transactions', label: 'Transacciones', icon: Table2, onClick: () => setActiveTab('transactions'), active: activeTab === 'transactions' },
    { id: 'rules', label: 'Reglas', icon: Cpu, onClick: () => setActiveTab('rules'), active: activeTab === 'rules' },
    { id: 'sim', label: 'Simulación', icon: Zap, onClick: () => setActiveTab('sim'), active: activeTab === 'sim' },
    { id: 'breakdown', label: 'Desglose', icon: BarChart4, onClick: () => setActiveTab('breakdown'), active: activeTab === 'breakdown' },
    { id: 'pivot', label: 'Consolidado', icon: FileSearch, onClick: () => setActiveTab('pivot'), active: activeTab === 'pivot' },
    { id: 'errors', label: 'Errores', icon: AlertCircle, onClick: () => setActiveTab('errors'), active: activeTab === 'errors' },
    { id: 'audit', label: 'Auditoría Matching', icon: History, onClick: () => setActiveTab('audit'), active: activeTab === 'audit' },
    { id: 'movements', label: 'Trazabilidad', icon: Workflow, onClick: () => setActiveTab('movements'), active: activeTab === 'movements' },
    {
        id: 'reports-dropdown',
        label: '',
        onClick: () => {},
        component: <IPVReportsDropdown activeTab={activeTab} onSelect={setActiveTab} />
    }
  ], [activeTab]);

  if (!isStarted) {
    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            <LoadingOverlay isVisible={isMatching} message={matchMessage} progress={matchProgress} />
            <IPVInstitutionalDashboard
                transactions={transactions || []}
                reconciliationLines={reconciliationLines || []}
                onStart={() => setIsStarted(true)}
            />
        </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6">
      <LoadingOverlay isVisible={isMatching} message={matchMessage} progress={matchProgress} />


      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 px-1">
        <div className="flex items-center gap-4">
            {activeTab !== 'dashboard' && activeTab !== 'analytics' && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveTab('dashboard')}
                    className="h-11 w-11 rounded-xl hover:bg-primary/10 hover:text-primary transition-all shadow-sm active:scale-95"
                >
                    <ChevronDown className="w-5 h-5 rotate-90" />
                </Button>
            )}
            <div>
                <h1 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                    Conciliación Inteligente <Badge variant="outline" className="text-[10px] h-5 bg-primary/5 border-primary/20 text-primary">V8.0</Badge>
                </h1>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">Motor de interpretación bancaria y arqueo de caja</p>
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
            <ActionMenu actions={menuActions} />
        </div>
      </div>

      <div className="w-full">
          {activeTab === 'dashboard' && (
            <div className="m-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <IPVInstitutionalDashboard
                    transactions={transactions || []}
                    reconciliationLines={reconciliationLines || []}
                    onStart={() => setActiveTab('ingestion')}
                />
            </div>
          )}

          {activeTab === 'ingestion' && (
            <div className="m-0 animate-in fade-in duration-500">
                <BankIngestion />
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="m-0 animate-in fade-in duration-500">
                <TransactionTable
                onManualRecon={(tx) => {
                    setSelectedReconTx(tx);
                    setActiveTab('manual-recon');
                }}
                onAnalyzeAll={handleRunMatching}
                />
            </div>
          )}

          {activeTab === 'manual-recon' && (
            <div className="m-0 animate-in fade-in duration-500">
                <ManualReconciliationView
                    transaction={selectedReconTx}
                    onBack={() => {
                        setActiveTab('transactions');
                        setSelectedReconTx(null);
                    }}
                />
            </div>
          )}

          {activeTab === 'sim' && (
            <div className="m-0 animate-in fade-in duration-500">
                <MatchingSimulation products={products || []} rules={rules || []} />
            </div>
          )}

          {activeTab === 'breakdown' && (
            <div className="m-0 animate-in fade-in duration-500">
                <TransactionBreakdown />
            </div>
          )}

          {activeTab === 'pivot' && (
            <div className="m-0 animate-in fade-in duration-500">
                <PivotStatementView />
            </div>
          )}

          {activeTab === 'catalog' && (
            <div className="m-0 animate-in fade-in duration-500">
                <CatalogTable />
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="m-0 animate-in fade-in duration-500">
                <MatchingAuditView />
            </div>
          )}
          {activeTab === 'movements' && (
            <div className="m-0 animate-in fade-in duration-500">
                <MovementsView />
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="m-0 animate-in fade-in duration-500">
                <IPVReportView />
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="m-0 animate-in fade-in duration-500 p-6 bg-card rounded-2xl border shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-widest">Configuración de Reglas</h2>
                        <p className="text-sm text-muted-foreground font-medium">Define el comportamiento del motor de matching</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Aquí iría el editor de reglas, por ahora placeholder */}
                    <Card className="p-12 flex flex-col items-center justify-center border-dashed text-center opacity-50">
                        <Settings className="w-12 h-12 mb-4 text-primary/20" />
                        <p className="font-black uppercase text-xs tracking-widest">Módulo de Reglas v8.0</p>
                        <p className="text-xs font-medium mt-1">El editor de reglas se encuentra en mantenimiento.</p>
                    </Card>
                </div>
            </div>
          )}
      </div>
    </div>
    </TooltipProvider>
  );
}
