'use client';

import React, { useState, useMemo } from 'react';
import { StockService } from '@/lib/ipv/StockService';
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
  BarChart4, Wand2, Users,
  PackageSearch,
  FileSearch, Target,
  Receipt,
  ArrowRightLeft,
  QrCode,
  ListFilter, ChevronDown, ChevronUp, PackageX
} from 'lucide-react';
import { MatchingAuditView } from './MatchingAuditView';
import { BankIngestion } from './BankIngestion';
import { TransactionTable } from './TransactionTable';
import { CatalogTable } from './CatalogTable';
import MovementsView from './MovementsView';
import { MatchingSimulation } from './MatchingSimulation';
import TransactionBreakdown from './TransactionBreakdown';
import { IPVReportView } from './IPVReportView';
import { IntelligentReceiptsSection } from './IntelligentReceipts/IntelligentReceiptsSection';
import { MatchingRulesEditor } from './MatchingRulesEditor';
import { PivotStatementView } from './PivotStatementView';
import { MipymeTransactionsView } from './MipymeTransactionsView';
import { FinancialPlanningView } from './FinancialPlanningView';
import { IngestionErrorsTable } from './IngestionErrorsTable';
import ManualReconciliationView from './ManualReconciliationView';
import { CustomerCatalog } from './CustomerCatalog';
import { IPVControlPanel } from './IPVControlPanel';
import { IPVInstitutionalDashboard } from './IPVInstitutionalDashboard';
import { IPVRightSidebar } from './IPVRightSidebar';
import { IncomeReceiptSection } from './IncomeReceiptSection';
import { TransferQRReportView } from './TransferQRReportView';
import { IPVReportsDropdown } from './IPVReportsDropdown';
import { MVTExportView } from "./mvt/MVTExportView";
import { seedMappingRules } from '@/lib/ipv/seedMappingRules';
import { MappingRulesManager } from '@/components/views/shared/MappingRulesManager';
import { recalculateIPVReportsChain } from '@/lib/ipv/utils';
import { exportFullBackup, importFullBackup } from "@/lib/ipv/backup";
import { MatchingEngine, DEFAULT_MATCHING_RULES } from "@/lib/ipv/engine";
import { mergeWithDefaults } from "@/lib/ipv/rules/rules-config";
import { isTransactionSelected } from "@/lib/ipv/rules/rules-types";
import { formatCurrency, formatCurrencyCents, cn } from '@/lib/utils';
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
  const [isCardsExpanded, setIsCardsExpanded] = useState(false);

  const transactions = useLiveQuery(() => db.bank_statements.orderBy('fecha').toArray());
  const rules = useLiveQuery(() => db.matching_rules.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const ingestionErrorsCount = useLiveQuery(() => db.ingestion_errors.count()) || 0;
  const settings = useLiveQuery(() => db.ipv_settings.get("current"));
  const productMovements = useLiveQuery(() => db.product_movements.toArray());
  React.useEffect(() => {
    if (rules) {
      const merged = mergeWithDefaults(rules, DEFAULT_MATCHING_RULES);
      db.matching_rules.bulkPut(merged);

      if (rules.length === 0) {
        seedMappingRules();
      }
    }
  }, [rules]);

  const currentStockMap = useLiveQuery(
    () => StockService.getCompleteStockMap(),
    [products, reconciliationLines, productMovements],
    new Map<string, number>()
  );

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
    if (!transactions) return { total: 0, squared: 0, inProcess: 0, pending: 0, percentage: 0, totalSales: 0, totalTransferencias: 0, totalEfectivo: 0, negativeStock: 0 };

    let squared = 0;
    let inProcess = 0;
    let pending = 0;
    let activeTotal = 0;
    let totalTransferencias = 0;
    let totalEfectivo = 0;
    const checkedTxRefs = new Set<string>();

    for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];

        if (!isTransactionSelected(t) || t.estado_conciliacion === 'NO_PROCESAR') continue;

        checkedTxRefs.add(t.referencia_origen);
        activeTotal++;

        const target = t.importe_venta_cents || t.importe_cents;
        const matched = txTotals[t.referencia_origen] || 0;
        const diff = target - matched;

        if (t.tipo === 'Cr') {
            totalTransferencias += target;
        }

        if (matched === 0) {
            pending++;
        } else if (diff <= 0.001) {
            squared++;
        } else {
            inProcess++;
        }
    }

    if (reconciliationLines) {
        for (let i = 0; i < reconciliationLines.length; i++) {
            const l = reconciliationLines[i];

            if (!checkedTxRefs.has(l.transaction_ref)) {
                if (l.importe_linea_cents > 0) {
                    totalEfectivo += l.importe_linea_cents;
                }
            } else {
                if (l.clasificacion === 'Efectivo') {
                    totalEfectivo += l.importe_linea_cents;
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
      totalEfectivo,
      negativeStock: Array.from(currentStockMap.values()).filter(v => v < 0).length
    };
  }, [transactions, txTotals, reconciliationLines, currentStockMap]);


  async function handleImportBackup(file: File) {
    const loadingToast = toast.loading('Restaurando base de datos...');
    try {
      await importFullBackup(db, file);
      toast.success('Base de datos restaurada correctamente', { id: loadingToast });
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

    if (!settings?.copiloto_activo && (!rules || rules.length === 0)) {
        toast.error('No hay reglas de matching configuradas.');
        return;
    }

    setIsMatching(true);
    setMatchMessage('Iniciando proceso de matching...');

    const allLines = await db.reconciliation_lines.toArray();
    const txTotalsMap = allLines.reduce((acc, line) => {
        acc[line.transaction_ref] = (acc[line.transaction_ref] || 0) + line.importe_linea_cents;
        return acc;
    }, {} as Record<string, number>);

    setMatchMessage('Ejecutando algoritmos de matching...');

    const transactionsToProcess = transactions
        .filter(t => t.estado_conciliacion !== 'COMPLETO' && isTransactionSelected(t))
        .map(t => ({
            ...t,
            current_reconciled_cents: txTotalsMap[t.referencia_origen] || 0
        }));

    if (transactionsToProcess.length === 0) {
        toast.info('Todas las transacciones ya están completadas o excluidas.');
        setIsMatching(false);
        return;
    }

    const worker = new Worker(new URL('@/lib/ipv/matching.worker.ts', import.meta.url));

    worker.postMessage({
      type: 'RECONCILE_BATCH',
      transactions: transactionsToProcess,
      products: products,
      rules: settings?.copiloto_activo ? DEFAULT_MATCHING_RULES : rules,
      stockMap: currentStockMap
    });

    worker.onmessage = async (e) => {
      try {
        if (e.data.type === 'PROGRESS') {
          setMatchProgress(e.data.percentage);
          setMatchMessage(`Procesando: ${e.data.percentage}%`);
        }

        if (e.data.type === 'BATCH_COMPLETE') {
          const { results } = e.data;

          if (!results || results.length === 0) {
            toast.info('No se generaron resultados de matching.');
            worker.terminate();
            setIsMatching(false);
            setMatchProgress(0);
            return;
          }

          await db.transaction('rw', [db.reconciliation_lines, db.product_movements, db.bank_statements], async () => {
            for (const res of results) {
              if (res.lines && res.lines.length > 0) {
                await db.reconciliation_lines.bulkAdd(res.lines);
              }

              if (res.movements && res.movements.length > 0) {
                await db.product_movements.bulkAdd(res.movements.map((m: any) => ({
                  ...m,
                  referencia_transaccion: res.transactionId
                })));
              }

              await db.bank_statements.update(res.transactionId, {
                estado_conciliacion: res.status,
                fail_reason: res.failReason,
                matching_trace: res.trace,
                applied_rules: res.appliedRules,
                matching_confidence: res.matchingConfidence
              });
            }
          });

          toast.success(`Proceso completado: ${results.length} transacciones analizadas`);
          worker.terminate();
          setIsMatching(false);
          setMatchProgress(0);
        }
      } catch (err) {
        console.error('Error processing worker message:', err);
        toast.error(`Error al guardar resultados: ${err instanceof Error ? err.message : 'Error desconocido'}`);
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
  }, [transactions, products, currentStockMap, rules, settings]);

  const handleForceMatch = React.useCallback(async (tx: BankTransaction) => {
    if (!products || !rules) return;

    const loadingToast = toast.loading(`Forzando matching para ${tx.referencia_origen}...`);

    try {
        const engine = new MatchingEngine(products, settings?.copiloto_activo ? DEFAULT_MATCHING_RULES : rules);
        // Inject current stock map for accurate matching
        (engine as any).stockMap = new Map(currentStockMap);
        const currentReconciled = txTotals[tx.referencia_origen] || 0;

        const result = await engine.matchTransaction(tx, currentReconciled);

        if (result.lines.length > 0) {
            await db.reconciliation_lines.bulkAdd(result.lines);
        }

        if (result.movements && result.movements.length > 0) {
            await db.product_movements.bulkAdd(result.movements.map(m => ({
                ...m,
                referencia_transaccion: tx.referencia_origen
            })));
        }

        await db.bank_statements.update(tx.referencia_origen, {
            estado_conciliacion: result.status,
            fail_reason: result.failReason,
            matching_trace: result.trace,
            applied_rules: result.appliedRules,
            matching_confidence: result.matchingConfidence
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
  }, [products, rules, settings, txTotals]);

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

  const menuActions: Action[] = useMemo(() => [
    { id: 'dashboard', label: 'Flujo', icon: Workflow, onClick: () => setActiveTab('dashboard'), active: activeTab === 'dashboard' },
    { id: 'analytics', label: 'Dashboard', icon: TrendingUp, onClick: () => setActiveTab('analytics'), active: activeTab === 'analytics' },
    { id: 'ingestion', label: 'Extracto', icon: Database, onClick: () => setActiveTab('ingestion'), active: activeTab === 'ingestion' },
    { id: 'catalog', label: 'Catálogo', icon: PackageSearch, onClick: () => setActiveTab('catalog'), active: activeTab === 'catalog' },
    { id: 'transactions', label: 'Transacciones', icon: Table2, onClick: () => setActiveTab('transactions'), active: activeTab === 'transactions' },
    { id: 'rules', label: 'Reglas', icon: Cpu, onClick: () => setActiveTab('rules'), active: activeTab === 'rules' },
    { id: 'sim', label: 'Simulación', icon: Zap, onClick: () => setActiveTab('sim'), active: activeTab === 'sim' },
    { id: 'breakdown', label: 'Desglose', icon: BarChart4, onClick: () => setActiveTab('breakdown'), active: activeTab === 'breakdown' },
    { id: 'intelligent-receipts', label: 'Recepciones', icon: Wand2, onClick: () => setActiveTab('intelligent-receipts'), active: activeTab === 'intelligent-receipts' },
    { id: 'pivot', label: 'Consolidado', icon: FileSearch, onClick: () => setActiveTab('pivot'), active: activeTab === 'pivot' },
    { id: 'planning', label: 'Planeación', icon: Target, onClick: () => setActiveTab('planning'), active: activeTab === 'planning' },
    { id: 'errors', label: 'Errores', icon: AlertCircle, onClick: () => setActiveTab('errors'), active: activeTab === 'errors' },
    { id: 'audit', label: 'Auditoría Matching', icon: History, onClick: () => setActiveTab('audit'), active: activeTab === 'audit' },
    { id: 'movements', label: 'Trazabilidad', icon: Workflow, onClick: () => setActiveTab('movements'), active: activeTab === 'movements' },
    { id: 'mapping-rules', label: 'Mapeo Reglas', icon: ListFilter, onClick: () => setActiveTab('mapping-rules'), active: activeTab === 'mapping-rules' },
    { id: 'customers', label: 'Clientes', icon: Users, onClick: () => setActiveTab('customers'), active: activeTab === 'customers' },
    { id: 'mipyme', label: 'Transacciones Mipyme', icon: Users, onClick: () => setActiveTab('mipyme'), active: activeTab === 'mipyme' },
    { id: 'mvt', label: 'Exportación MVT', icon: FileText, onClick: () => setActiveTab('mvt'), active: activeTab === 'mvt' },
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


      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 px-1 ipv-action-buttons">
        <div className="flex items-center gap-4">
            {activeTab !== 'dashboard' && activeTab !== 'analytics' && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveTab('dashboard')}
                    className="h-11 w-11 rounded-xl hover:bg-primary/10 hover:text-primary transition-all shadow-sm active:scale-95"
                >
                    <Settings className="w-5 h-5 rotate-180" />
                </Button>
            )}
            <div>
                <div className="flex items-center gap-2">
                    <h1 className="text-[clamp(2rem,8vw,3rem)] font-black tracking-tight text-primary uppercase">IPV Builder</h1>
                    <IPVHelpDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground font-medium">Conciliación bancaria y generación de IPV</p>
            </div>
        </div>

        <div className="w-full lg:w-auto">
            <ActionMenu actions={topActions} sticky={false} className="shadow-none bg-transparent" />
        </div>
      </div>


      <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest opacity-50 flex items-center gap-2">
            <BarChart4 className="w-3 h-3" /> Resumen de Operaciones
          </h3>
          <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCardsExpanded(!isCardsExpanded)}
              className="h-7 px-2 hover:bg-primary/5 text-[10px] font-bold uppercase tracking-tighter"
          >
              {isCardsExpanded ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              {isCardsExpanded ? 'Ocultar' : 'Ver Detalles'}
          </Button>
      </div>

      {isCardsExpanded && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
        {stats.totalSales > 0 && (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex-1">
                    <StatCard
                        title="Venta Total"
                        value={stats.totalSales}
                        icon={<FileText className="text-primary" />}
                        subtitle={`T: ${formatCurrencyCents(stats.totalTransferencias)} | E: ${formatCurrencyCents(stats.totalEfectivo)}`}
                        active={false}
                        isCurrency={true}
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent className="bg-popover text-popover-foreground border shadow-lg">
                <p className="text-xs font-bold text-primary mb-1 uppercase">Desglose de Venta Real:</p>
                <div className="space-y-1">
                    <p className="text-xs"><strong>Transferencias:</strong> {formatCurrencyCents(stats.totalTransferencias)}</p>
                    <p className="text-xs"><strong>Efectivo:</strong> {formatCurrencyCents(stats.totalEfectivo)}</p>
                </div>
                <p className="text-xs mt-2 opacity-70 italic border-t pt-1">Incluye transacciones bancarias procesadas y ajustes de caja global.</p>
            </TooltipContent>
        </Tooltip>
        )}

        {stats.total > 0 && (
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
        )}

        {stats.squared > 0 && (
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
        )}

        {stats.inProcess > 0 && (
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
        )}

        {stats.pending > 0 && (
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
        )}

        {stats.negativeStock > 0 && (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex-1">
                    <StatCard
                        title="Stock Negativo"
                        value={stats.negativeStock}
                        icon={<PackageX className="text-red-500" />}
                        subtitle="Revisar Catálogo"
                        active={false}
                        onClick={() => {
                            localStorage.setItem('catalog_stockFilter', 'negative_stock');
                            setActiveTab('catalog');
                        }}
                        className="border-red-500/20 bg-red-500/5 hover:border-red-500/40"
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent className="bg-popover text-popover-foreground border shadow-lg">
                <p className="text-xs font-bold text-red-500">Existen productos con existencias menores a cero.</p>
                <p className="text-xs opacity-70">Haga clic para ir al catálogo y filtrar estos productos.</p>
            </TooltipContent>
        </Tooltip>
        )}
      </div>
      )}


      <IPVRightSidebar activeTab={activeTab} onSelect={setActiveTab} />

      <div className="w-full">
            <ActionMenu
                actions={menuActions}
                sticky={true}
                topOffset="sticky top-[60px] sm:top-[92px]"
                className="mb-6 !-mx-4 px-4 py-2"
            />

        <div className={(activeTab === 'dashboard' || activeTab === 'analytics') ? '' : 'mt-6 p-0 overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur-sm rounded-3xl'}>
          {activeTab === 'analytics' && (
            <div className="m-0 animate-in fade-in duration-500">
                <IPVInstitutionalDashboard transactions={transactions || []} reconciliationLines={reconciliationLines || []} />
            </div>
          )}
          {activeTab === 'dashboard' && (
            <div className="m-0 animate-in fade-in duration-500">
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
            </div>
          )}
          {activeTab === 'transactions' && (
            <div className="m-0 animate-in fade-in duration-500">
                <TransactionTable
                transactions={transactions || []}
                kpiFilter={kpiFilter}
                txReconciliationTotals={txTotals}
                onReconcile={(tx) => {
                    setSelectedReconTx(tx);
                    setActiveTab('manual-recon');
                }}
                onForceMatch={handleForceMatch}
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
                <MatchingSimulation products={products || []} rules={settings?.copiloto_activo ? DEFAULT_MATCHING_RULES : (rules || [])} />
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

                    {activeTab === 'planning' && (
            <div className="m-0 animate-in fade-in duration-500">
                <FinancialPlanningView />
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

          {activeTab === 'ingestion' && (
            <div className="m-0 p-6 animate-in fade-in duration-500">
                <BankIngestion />
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="m-0 animate-in fade-in duration-500">
                <IPVReportView />
            </div>
          )}

          {activeTab === 'intelligent-receipts' && (
            <div className="m-0 p-6 animate-in fade-in duration-500">
                <IntelligentReceiptsSection />
            </div>
          )}

          {activeTab === 'receipts' && (
            <div className="m-0 p-6 animate-in fade-in duration-500">
                <IncomeReceiptSection />
            </div>
          )}

          {activeTab === 'transfers' && (
            <div className="m-0 p-6 animate-in fade-in duration-500">
                <TransferQRReportView type="TRANSFER" />
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="m-0 p-6 animate-in fade-in duration-500">
                <TransferQRReportView type="QR" />
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="m-0 p-6 animate-in fade-in duration-500">
                <MatchingRulesEditor />
            </div>
          )}

          {activeTab === 'errors' && (
            <div className="m-0 animate-in fade-in duration-500">
                <IngestionErrorsTable />
            </div>
          )}
          {activeTab === 'mapping-rules' && (
            <div className="m-0 p-6 animate-in fade-in duration-500">
                <MappingRulesManager />
            </div>
          )}
          {activeTab === 'mipyme' && (
            <div className="m-0 p-6 animate-in fade-in duration-500">
                <MipymeTransactionsView />
            </div>
          )}
          {activeTab === 'customers' && (
            <div className="m-0 p-6 animate-in fade-in duration-500">
                <CustomerCatalog />
            </div>
          )}
          {activeTab === 'mvt' && (
            <div className="m-0 animate-in fade-in duration-500">
                <MVTExportView />
            </div>
          )}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}


function StatCard({ title, value, icon, trend, subtitle, active, onClick, isCurrency = false, className = "" }: { title: string, value: number, icon: React.ReactNode, trend?: string, subtitle?: string, active?: boolean, onClick?: () => void, isCurrency?: boolean, className?: string }) {
  const formattedValue = React.useMemo(() => {
    if (!isCurrency) return value.toString();
    return formatCurrencyCents(value);
  }, [value, isCurrency]);

  return (
    <Card
        onClick={onClick}
        className={cn("p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:justify-between border-2 transition-all cursor-pointer gap-2", active ? "border-primary bg-primary/5 shadow-lg scale-[1.02]" : "border-transparent bg-card/50 backdrop-blur-sm shadow-md hover:border-primary/20", className)}
    >
      <div className="flex flex-col items-center sm:items-start space-y-0.5 sm:space-y-1 overflow-hidden w-full">
        <p className="text-xs sm:text-[10px] font-black text-muted-foreground uppercase tracking-widest truncate w-full text-center sm:text-left">{title}</p>
        <div className="flex items-baseline justify-center sm:justify-start gap-1.5 sm:gap-2 w-full overflow-hidden">
            <h3 className="text-[clamp(1.2rem,5vw,2.2rem)] font-black truncate">{formattedValue}</h3>
            {trend && (
                <Badge variant="outline" className="text-[9px] h-3.5 px-1 font-bold text-green-600 bg-green-500/10 border-green-500/20 flex-shrink-0">
                    {trend}
                </Badge>
            )}
        </div>
        {subtitle && <p className="text-[10px] sm:text-[9px] text-muted-foreground font-bold uppercase opacity-60 truncate w-full text-center sm:text-left tracking-tighter">{subtitle}</p>}
      </div>
      <div className="p-2 sm:p-2.5 bg-background rounded-xl sm:rounded-2xl shadow-inner flex-shrink-0">
        {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-3.5 h-3.5 sm:w-4 sm:h-4' })}
      </div>
    </Card>
  );
}
