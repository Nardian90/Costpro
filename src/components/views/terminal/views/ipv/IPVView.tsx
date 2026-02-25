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
  Clock
} from 'lucide-react';
import { BankIngestion } from './BankIngestion';
import { TransactionTable } from './TransactionTable';
import { CatalogTable } from './CatalogTable';
import { MatchingSimulation } from './MatchingSimulation';
import { TransactionBreakdown } from './TransactionBreakdown';
import { IPVReportView } from './IPVReportView';
import { MatchingRulesEditor } from './MatchingRulesEditor';
import { PivotStatementView } from './PivotStatementView';
import { IngestionErrorsTable } from './IngestionErrorsTable';
import { ManualReconciliationView } from './ManualReconciliationView';
import { IPVControlPanel } from './IPVControlPanel';
import { IPVInstitutionalDashboard } from './IPVInstitutionalDashboard';
import { IPVRightSidebar } from './IPVRightSidebar';
import { MatchingEngine } from '@/lib/ipv/engine';
import { exportFullBackup, importFullBackup } from '@/lib/ipv/backup';
import { recalculateIPVReportsChain } from '@/lib/ipv/utils';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { HorizontalScroll } from '@/components/ui/HorizontalScroll';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { IPVHelpDialog } from './IPVHelpDialog';

export default function IPVView() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMatching, setIsMatching] = useState(false);
  const [matchMessage, setMatchMessage] = useState('');
  const [matchProgress, setMatchProgress] = useState(0);
  const [kpiFilter, setKpiFilter] = useState<'ALL' | 'CUADRADAS' | 'EN_PROCESO' | 'PENDIENTES'>('ALL');
  const [selectedReconTx, setSelectedReconTx] = useState<BankTransaction | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isStarted, setIsStarted] = useState(true);
  const [isFlowVisible, setIsFlowVisible] = useState(true);

  const transactions = useLiveQuery(() => db.bank_statements.orderBy('fecha').toArray());
  const rules = useLiveQuery(() => db.matching_rules.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const ingestionErrorsCount = useLiveQuery(() => db.ingestion_errors.count()) || 0;

  // Mapa de stock actual para el motor de matching y simulación
  const currentStockMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!products || !reconciliationLines) return map;

    products.forEach(p => {
        const sold = reconciliationLines
            .filter(l => l.product_cod === p.cod)
            .reduce((sum, l) => sum + l.cantidad, 0);
        map.set(p.cod, (p.stock_inicial_manual || 0) - sold);
    });
    return map;
  }, [products, reconciliationLines]);

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
    let totalTransferencias = 0;
    let totalEfectivo = 0;
    const checkedTxRefs = new Set<string>();

    // 1. Procesar transacciones bancarias (Transferencias)
    for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];

        // Omitir excluidas de las estadísticas de KPI
        if (t.excluido || t.estado_conciliacion === 'NO_PROCESAR') continue;

        checkedTxRefs.add(t.referencia_origen);
        activeTotal++;

        const target = t.importe_venta_cents || t.importe_cents;
        const matched = txTotals[t.referencia_origen] || 0;
        const diff = target - matched;

        // Si es un ingreso (Cr), lo sumamos como transferencia base
        if (t.tipo === 'Cr') {
            totalTransferencias += target;
        }

        if (matched === 0) {
            pending++;
        } else if (Math.abs(diff) < 0.001) {
            squared++;
        } else {
            inProcess++;
        }
    }

    // 2. Procesar líneas de reconciliación para capturar Efectivo (incluyendo CASH_FILLER)
    if (reconciliationLines) {
        for (let i = 0; i < reconciliationLines.length; i++) {
            const l = reconciliationLines[i];

            // Si la línea NO pertenece a una transacción bancaria activa, es venta en efectivo independiente
            if (!checkedTxRefs.has(l.transaction_ref)) {
                if (l.importe_linea_cents > 0) {
                    totalEfectivo += l.importe_linea_cents;
                }
            } else {
                // Si pertenece a una transacción bancaria, pero está clasificada como Efectivo (ej: Cash Fill de una transferencia)
                // Restamos del total de transferencias y sumamos a efectivo para el desglose real
                if (l.clasificacion === 'Efectivo') {
                    totalEfectivo += l.importe_linea_cents;
                    totalTransferencias -= l.importe_linea_cents;
                }
            }
        }
    }

    return {
      total: activeTotal,
      squared,
      inProcess,
      pending,
      percentage: activeTotal > 0 ? Math.round((squared / activeTotal) * 100) : 0,
      totalSales: totalTransferencias + totalEfectivo,
      totalTransferencias,
      totalEfectivo
    };
  }, [transactions, txTotals, reconciliationLines]);


  async function handleImportBackup(file: File) {
    const loadingToast = toast.loading('Restaurando base de datos...');
    try {
      await importFullBackup(db, file);
      toast.success('Base de datos restaurada correctamente', { id: loadingToast });
      // Reload page to refresh all live queries and state
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error('Error importing backup:', error);
      toast.error('Error al restaurar la base de datos', { id: loadingToast });
    }
  }

  const handleGlobalRecalculate = React.useCallback(async () => {
    const loadingToast = toast.loading('Sincronizando datos del sistema...');
    try {
        await recalculateIPVReportsChain(db);
        toast.success('Sincronización completa: IPV, Desglose y Catálogo alineados.', { id: loadingToast });
    } catch (error) {
        console.error('Error in global recalculate:', error);
        toast.error('Error al sincronizar datos', { id: loadingToast });
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
      }

      if (e.data.type === 'BATCH_COMPLETE') {
        const { results } = e.data;

        // Persistir resultados
        for (const res of results) {
          if (res.lines.length > 0) {
            await db.reconciliation_lines.bulkAdd(res.lines);
          }

          // Actualizamos estado independientemente de si hay líneas (ej: comisiones auto-completadas)
          await db.bank_statements.update(res.transactionId, {
            estado_conciliacion: res.status
          });
        }

        toast.success(`Proceso completado: ${results.length} transacciones analizadas`);
        worker.terminate();
        setIsMatching(false);
        setMatchProgress(0);
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      toast.error('Error en el motor de matching');
      worker.terminate();
      setIsMatching(false);
    };
  }, [transactions, products, currentStockMap, rules]);

  const handleForceMatch = React.useCallback(async (tx: BankTransaction) => {
    if (!products || !rules) return;

    const loadingToast = toast.loading(`Forzando matching para ${tx.referencia_origen}...`);

    try {
        const engine = new MatchingEngine(products, rules);
        const currentReconciled = txTotals[tx.referencia_origen] || 0;

        const result = await engine.matchTransaction(tx, currentReconciled);

        if (result.lines.length > 0) {
            await db.reconciliation_lines.bulkAdd(result.lines);
        }

        await db.bank_statements.update(tx.referencia_origen, {
            estado_conciliacion: result.status
        });

        if (result.status === 'COMPLETO') {
            toast.success('¡Transacción cuadradada exitosamente!', { id: loadingToast });
        } else if (result.status === 'PARCIAL') {
            toast.info('Matching parcial aplicado. Aún queda una diferencia.', { id: loadingToast });
        } else {
            toast.error('No se encontraron coincidencias automáticas para esta transacción.', { id: loadingToast });
        }
    } catch (error) {
        console.error('Error in force match:', error);
        toast.error('Error al ejecutar el matching', { id: loadingToast });
    }
  }, [products, rules, txTotals]);

  const topActions: Action[] = useMemo(() => [
    {
        id: 'sync',
        label: 'Sincronizar IPV',
        icon: History,
        onClick: handleGlobalRecalculate,
        variant: 'outline' as const,
        tooltip: (
            <div className="space-y-1">
                <p className="font-bold text-primary">Sincronizar IPV</p>
                <p className="text-xs leading-relaxed">Recalcula la cadena de reportes IPV y actualiza estadísticas para asegurar coherencia total.</p>
            </div>
        )
    },
    {
        id: 'rules',
        label: 'Reglas',
        icon: Settings,
        onClick: () => setActiveTab('rules'),
        variant: 'outline' as const
    },
    {
        id: 'matching',
        label: 'Ejecutar Matching',
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
      {/* Help Section: Professional Flow */}
      {isStarted && isFlowVisible && (
          <Card className="p-6 bg-primary/5 border-none shadow-none rounded-3xl overflow-hidden relative group">
              <button
                  onClick={() => setIsFlowVisible(false)}
                  className="absolute top-4 right-4 z-20 p-2 rounded-full hover:bg-primary/10 text-primary transition-colors" aria-label="Cerrar flujo de trabajo"
              >
                  <X className="w-5 h-5" />
              </button>
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Settings className="w-32 h-32" />
              </div>
              <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                      <CheckCircle2 className="w-5 h-5" />
                      <h2 className="font-black uppercase tracking-widest text-sm">Flujo de Trabajo Profesional</h2>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 sm:gap-6">
                      <FlowStep number="1" title="Ingesta" desc="Carga de extractos bancarios." />
                      <FlowStep number="2" title="Catálogo" desc="Productos, precios y stock." />
                      <FlowStep number="3" title="Matching" desc="Ejecución del motor automático." />
                      <FlowStep number="4" title="Análisis" desc="Revisión de desgloses y cuadre." />
                      <FlowStep number="5" title="Reportes" desc="Generación de IPV fiscal." />
                      <FlowStep number="6" title="Auditoría" desc="Control de errores y respaldo." />
                  </div>
              </div>
          </Card>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 px-1">
        <div className="flex items-center gap-4">
            {activeTab !== 'dashboard' && activeTab !== 'analytics' && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveTab('dashboard')}
                    className="h-10 w-10 rounded-xl hover:bg-primary/10 hover:text-primary transition-all shadow-sm active:scale-95"
                >
                    <Settings className="w-5 h-5 rotate-180" />
                </Button>
            )}
            <div>
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-primary uppercase">IPV Builder</h1>
                    <IPVHelpDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Conciliación bancaria y generación de IPV</p>
            </div>
        </div>

        <div className="w-full lg:w-auto">
            <ActionMenu actions={topActions} sticky={false} className="shadow-none bg-transparent" />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex-1">
                    <StatCard
                        title="Venta Total"
                        value={stats.totalSales}
                        icon={<FileText className="text-primary" />}
                        subtitle={`T: ${formatCurrency(stats.totalTransferencias)} | E: ${formatCurrency(stats.totalEfectivo)}`}
                        active={false}
                        isCurrency={true}
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent className="bg-popover text-popover-foreground border shadow-lg">
                <p className="text-xs font-bold text-primary mb-1 uppercase">Desglose de Venta Real:</p>
                <div className="space-y-1">
                    <p className="text-xs"><strong>Transferencias:</strong> {formatCurrency(stats.totalTransferencias)}</p>
                    <p className="text-xs"><strong>Efectivo:</strong> {formatCurrency(stats.totalEfectivo)}</p>
                </div>
                <p className="text-xs mt-2 opacity-70 italic border-t pt-1">Incluye transacciones bancarias procesadas y ajustes de caja global.</p>
            </TooltipContent>
        </Tooltip>

        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex-1">
                    <StatCard
                        title="Total"
                        value={stats.total}
                        icon={<History className="text-blue-500" />}
                        subtitle="Transacciones"
                        active={kpiFilter === 'ALL'}
                        onClick={() => {
                            setKpiFilter('ALL');
                            setActiveTab('transactions');
                        }}
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent className="bg-popover text-popover-foreground border shadow-lg">
                <p className="text-xs font-bold">Total de movimientos activos (no excluidos) en el período actual.</p>
            </TooltipContent>
        </Tooltip>
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex-1">
                    <StatCard
                        title="Cuadradas"
                        value={stats.squared}
                        icon={<CheckCircle2 className="text-green-500" />}
                        trend={`${stats.percentage}%`}
                        subtitle="Completadas"
                        active={kpiFilter === 'CUADRADAS'}
                        onClick={() => {
                            setKpiFilter('CUADRADAS');
                            setActiveTab('transactions');
                        }}
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent className="bg-popover text-popover-foreground border shadow-lg">
                <p className="text-xs font-bold">Transacciones cuyo desglose de productos coincide exactamente con el importe neto.</p>
            </TooltipContent>
        </Tooltip>

        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex-1">
                    <StatCard
                        title="En Proceso"
                        value={stats.inProcess}
                        icon={<AlertCircle className="text-yellow-500" />}
                        subtitle="Con Diferencia"
                        active={kpiFilter === 'EN_PROCESO'}
                        onClick={() => {
                            setKpiFilter('EN_PROCESO');
                            setActiveTab('transactions');
                        }}
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent className="bg-popover text-popover-foreground border shadow-lg">
                <p className="text-xs font-bold">Transacciones con productos asociados pero que aún tienen una diferencia pendiente por cuadrar.</p>
            </TooltipContent>
        </Tooltip>

        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex-1">
                    <StatCard
                        title="Pendientes"
                        value={stats.pending}
                        icon={<Clock className="text-orange-500" />}
                        subtitle="Sin Matching"
                        active={kpiFilter === 'PENDIENTES'}
                        onClick={() => {
                            setKpiFilter('PENDIENTES');
                            setActiveTab('transactions');
                        }}
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent className="bg-popover text-popover-foreground border shadow-lg">
                <p className="text-xs font-bold">Transacciones que no han sido procesadas o no encontraron coincidencias automáticas.</p>
            </TooltipContent>
        </Tooltip>
      </div>

      <IPVRightSidebar activeTab={activeTab} onSelect={setActiveTab} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="mb-6">
                <HorizontalScroll containerClassName="bg-muted/50 rounded-2xl p-1">
                    <TabsList className="flex bg-transparent border-none w-max min-w-full h-auto p-0 gap-1">
                        <TabsTrigger value="analytics" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest shrink-0 rounded-xl">Dashboard</TabsTrigger>
                        <TabsTrigger value="dashboard" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest shrink-0 rounded-xl">Flujo</TabsTrigger>
                        <TabsTrigger value="transactions" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest shrink-0 rounded-xl">Transacciones</TabsTrigger>
                        <TabsTrigger value="sim" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest shrink-0 rounded-xl">Simulación</TabsTrigger>
                        <TabsTrigger value="breakdown" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest shrink-0 rounded-xl">Desglose</TabsTrigger>
                        <TabsTrigger value="pivot" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest shrink-0 rounded-xl">Consolidado</TabsTrigger>
                        <TabsTrigger value="catalog" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest shrink-0 rounded-xl">Catálogo</TabsTrigger>
                        <TabsTrigger value="ingestion" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest text-nowrap shrink-0 rounded-xl">Extracto</TabsTrigger>
                        <TabsTrigger value="errors" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest relative shrink-0 rounded-xl">
                            Errores
                            {ingestionErrorsCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white font-black shadow-sm animate-pulse">
                                    {ingestionErrorsCount}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="reports" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest text-nowrap shrink-0 rounded-xl">Reportes IPV</TabsTrigger>
                        <TabsTrigger value="rules" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest shrink-0 rounded-xl">Reglas</TabsTrigger>
                        {selectedReconTx && (
                            <TabsTrigger value="manual-recon" className="px-4 py-3 text-xs sm:text-xs font-black uppercase tracking-widest shrink-0 rounded-xl">
                                Conciliación
                            </TabsTrigger>
                        )}
                    </TabsList>
                </HorizontalScroll>
            </div>

        <div className={(activeTab === 'dashboard' || activeTab === 'analytics') ? '' : 'mt-6 p-0 overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur-sm rounded-3xl'}>
          <TabsContent value="analytics" className="m-0">
            <IPVInstitutionalDashboard transactions={transactions || []} reconciliationLines={reconciliationLines || []} />
          </TabsContent>
          <TabsContent value="dashboard" className="m-0">
            <IPVControlPanel
              onSelect={(id) => {
                  if (id === 'help') setIsHelpOpen(true);
                  else setActiveTab(id);
              }}
              onExportBackup={() => exportFullBackup(db)}
              onImportBackup={handleImportBackup}
              hasTransactions={!!transactions && transactions.length > 0}
              hasProducts={!!products && products.length > 0}
            />
          </TabsContent>
          <TabsContent value="transactions" className="m-0">
            <TransactionTable
              transactions={transactions || []}
              kpiFilter={kpiFilter}
              txReconciliationTotals={txTotals}
              onReconcile={(tx) => {
                setSelectedReconTx(tx);
                setActiveTab('manual-recon');
              }}
              onForceMatch={handleForceMatch}
            />
          </TabsContent>

          <TabsContent value="manual-recon" className="m-0">
            <ManualReconciliationView
                transaction={selectedReconTx}
                onBack={() => {
                    setActiveTab('transactions');
                    setSelectedReconTx(null);
                }}
            />
          </TabsContent>

          <TabsContent value="sim" className="m-0">
            <MatchingSimulation products={products || []} rules={rules || []} />
          </TabsContent>

          <TabsContent value="breakdown" className="m-0">
            <TransactionBreakdown />
          </TabsContent>

          <TabsContent value="pivot" className="m-0">
            <PivotStatementView />
          </TabsContent>

          <TabsContent value="catalog" className="m-0">
            <CatalogTable />
          </TabsContent>

          <TabsContent value="ingestion" className="m-0 p-6">
            <BankIngestion />
          </TabsContent>

          <TabsContent value="reports" className="m-0">
            <IPVReportView />
          </TabsContent>

          <TabsContent value="rules" className="m-0 p-6">
            <MatchingRulesEditor />
          </TabsContent>

          <TabsContent value="errors" className="m-0">
            <IngestionErrorsTable />
          </TabsContent>
        </div>
      </Tabs>
    </div>
    </TooltipProvider>
  );
}

function FlowStep({ number, title, desc }: { number: string, title: string, desc: string }) {
    return (
        <div className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">{number}</span>
            <div>
                <p className="text-xs font-black uppercase text-primary tracking-tighter">{title}</p>
                <p className="text-xs text-muted-foreground leading-tight font-medium">{desc}</p>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, trend, subtitle, active, onClick, isCurrency = false }: { title: string, value: number, icon: React.ReactNode, trend?: string, subtitle?: string, active?: boolean, onClick?: () => void, isCurrency?: boolean }) {
  return (
    <Card
        onClick={onClick}
        className={`p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:justify-between border-2 transition-all cursor-pointer gap-2 ${active ? 'border-primary bg-primary/5 shadow-lg scale-[1.02]' : 'border-transparent bg-card/50 backdrop-blur-sm shadow-md hover:border-primary/20'}`}
    >
      <div className="flex flex-col items-center sm:items-start space-y-0.5 sm:space-y-1">
        <p className="text-xs sm:text-xs font-black text-muted-foreground uppercase tracking-widest">{title}</p>
        <div className="flex items-baseline gap-1.5 sm:gap-2">
            <h3 className="text-xl sm:text-2xl font-black">{isCurrency ? formatCurrency(value) : value}</h3>
            {trend && (
                <Badge variant="outline" className="text-xs h-4 px-1 font-bold text-green-600 bg-green-500/10 border-green-500/20">
                    {trend}
                </Badge>
            )}
        </div>
        {subtitle && <p className="text-xs sm:text-xs text-muted-foreground font-bold uppercase opacity-60">{subtitle}</p>}
      </div>
      <div className="p-2 sm:p-3 bg-background rounded-xl sm:rounded-2xl shadow-inner">
        {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-4 h-4 sm:w-5 sm:h-5' })}
      </div>
    </Card>
  );
}
