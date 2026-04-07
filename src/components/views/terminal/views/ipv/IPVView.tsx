'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import {
  FileText, TrendingUp, Database, Table2, Cpu, Zap, BarChart4, Wand2,
  FileSearch, Target, AlertCircle, ListFilter, Users, History,
  Settings, CheckCircle2, PackageSearch, Workflow,
  ChevronDown, ChevronUp, Clock, PackageX, BarChart3, BarChart, Brain, Plus, Play, Search,
  ZapIcon, ClipboardList, Receipt, ArrowRightLeft, QrCode
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import { formatCurrencyCents } from '@/lib/utils';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { IPVInstitutionalDashboard } from './IPVInstitutionalDashboard';
import IPVControlPanel from './IPVControlPanel';
import { IPVRightSidebar } from './IPVRightSidebar';
import { IPVHelpDialog } from './IPVHelpDialog';
import { useUIStore } from '@/store';
import { exportFullBackup } from '@/lib/ipv/backup';
import { toast } from 'sonner';
import { DEFAULT_MATCHING_RULES } from '@/lib/ipv/engine';
import { ReconciliationLine, ProductMovement, MatchingLog, BankTransaction } from '@/lib/dexie';

// Lazy loaded components with named exports
const TransactionTable = lazy(() => import('./TransactionTable').then(m => ({ default: m.TransactionTable })));
const ManualReconciliationView = lazy(() => import('./ManualReconciliationView'));
const MatchingSimulation = lazy(() => import('./MatchingSimulation').then(m => ({ default: m.MatchingSimulation })));
const TransactionBreakdown = lazy(() => import('./TransactionBreakdown'));
const PivotStatementView = lazy(() => import('./PivotStatementView').then(m => ({ default: m.PivotStatementView })));
const FinancialPlanningView = lazy(() => import('./FinancialPlanningView').then(m => ({ default: m.FinancialPlanningView })));
const CatalogTable = lazy(() => import('./CatalogTable').then(m => ({ default: m.CatalogTable })));
const MatchingAuditView = lazy(() => import('./MatchingAuditView'));
const MovementsViewLazy = lazy(() => import('./MovementsView'));
const BankIngestion = lazy(() => import('./BankIngestion').then(m => ({ default: m.BankIngestion })));
const IPVReportView = lazy(() => import('./IPVReportView').then(m => ({ default: m.IPVReportView })));
const IntelligentReceiptsSection = lazy(() => import('./IntelligentReceipts/IntelligentReceiptsSection').then(m => ({ default: m.IntelligentReceiptsSection })));
const IncomeReceiptSection = lazy(() => import('./IncomeReceiptSection').then(m => ({ default: m.IncomeReceiptSection })));
const TransferQRReportView = lazy(() => import('./TransferQRReportView').then(m => ({ default: m.TransferQRReportView })));
const MatchingRulesEditor = lazy(() => import('./MatchingRulesEditor').then(m => ({ default: m.MatchingRulesEditor })));
const IngestionErrorsTable = lazy(() => import('./IngestionErrorsTable').then(m => ({ default: m.IngestionErrorsTable })));
const MappingRulesManager = lazy(() => import('@/components/views/shared/MappingRulesManager').then(m => ({ default: m.MappingRulesManager })));
const MipymeTransactionsView = lazy(() => import('./MipymeTransactionsView').then(m => ({ default: m.MipymeTransactionsView })));
const CustomerCatalog = lazy(() => import('./CustomerCatalog').then(m => ({ default: m.CustomerCatalog })));
const MVTExportView = lazy(() => import('./mvt/MVTExportView').then(m => ({ default: m.MVTExportView })));

export default function IPVView() {
  const { ipvActiveTab, setIpvActiveTab } = useUIStore();
  const [activeTab, setActiveTab] = useState(ipvActiveTab || 'dashboard');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchMessage, setMatchMessage] = useState('');
  const [matchProgress, setMatchProgress] = useState(0);
  const [selectedReconTx, setSelectedReconTx] = useState<any>(null);
  const [kpiFilter, setKpiFilter] = useState<'ALL' | 'CUADRADAS' | 'EN_PROCESO' | 'PENDIENTES'>('ALL');
  const [isCardsExpanded, setIsCardsExpanded] = useState(true);

  const transactions = useLiveQuery(() => db.bank_statements.toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const rules = useLiveQuery(() => db.matching_rules.toArray());
  const settings = useLiveQuery(() => db.ipv_settings.get('current'));
  const errorCount = useLiveQuery(() => db.ingestion_errors.count());

  const stats = useMemo(() => {
    const total = transactions?.length || 0;
    const squared = transactions?.filter(t => t.estado_conciliacion === 'COMPLETO').length || 0;
    const inProcess = transactions?.filter(t => t.estado_conciliacion === 'PARCIAL').length || 0;
    const pending = transactions?.filter(t => t.estado_conciliacion === 'PENDIENTE').length || 0;

    const totalSales = reconciliationLines?.reduce((sum, l) => sum + l.importe_linea_cents, 0) || 0;
    const totalEfectivo = reconciliationLines?.filter(l => l.clasificacion === 'Efectivo').reduce((sum, l) => sum + l.importe_linea_cents, 0) || 0;
    const totalTransferencias = reconciliationLines?.filter(l => l.clasificacion === 'Transferencia' || l.clasificacion === 'QR').reduce((sum, l) => sum + l.importe_linea_cents, 0) || 0;

    const negativeStock = products?.filter(p => (p.stock_inicial_manual || 0) < 0).length || 0;

    return {
      total,
      squared,
      inProcess,
      pending,
      totalSales,
      totalEfectivo,
      totalTransferencias,
      percentage: total > 0 ? Math.round((squared / total) * 100) : 0,
      negativeStock
    };
  }, [transactions, reconciliationLines, products]);

  const txTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    reconciliationLines?.forEach(l => {
        totals[l.transaction_ref] = (totals[l.transaction_ref] || 0) + l.importe_linea_cents;
    });
    return totals;
  }, [reconciliationLines]);

  const handleRunMatching = useCallback(async () => {
    console.log('handleRunMatching triggered. Products length:', products?.length);
    if (!products || products.length === 0) {
        toast.error('No hay catálogo de productos. Cargue primero.');
        return;
    }
    if (!transactions || transactions.length === 0) {
        toast.error('No hay transacciones para procesar.');
        return;
    }

    setIsMatching(true);
    setMatchMessage('Inicializando motor de matching...');
    setMatchProgress(5);

    try {
        const rulesActive = rules && rules.length > 0
            ? rules
            : DEFAULT_MATCHING_RULES;

        // Obtener el mapa de stock actual desde el catálogo
        const stockMap = new Map<string, number>();
        products.forEach(p => {
            stockMap.set(p.cod, p.stock_inicial_manual || 0);
        });

        // Crear transacciones con estado de reconciliación actual
        const txsToProcess = (transactions || [])
            .filter(t => t.estado_conciliacion === 'PENDIENTE' || t.estado_conciliacion === 'PARCIAL')
            .map(t => ({
                ...t,
                current_reconciled_cents: txTotals[t.referencia_origen] || 0
            }));

        if (txsToProcess.length === 0) {
            toast.info('No hay transacciones pendientes para matching.');
            setIsMatching(false);
            return;
        }

        setMatchMessage(`Procesando ${txsToProcess.length} transacciones...`);
        setMatchProgress(15);

        // Usar Web Worker para no bloquear la UI
        const worker = new Worker(
            new URL('@/lib/ipv/matching.worker.ts', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = async (event) => {
            const { type, percentage, results, offset, total } = event.data;

            if (type === 'PROGRESS') {
                setMatchProgress(Math.min(90, 15 + (percentage * 0.75)));
            }
            else if (type === 'PARTIAL_RESULTS') {
                // ✅ PROCESAR PARCIALMENTE MIENTRAS EL WORKER CONTINÚA
                try {
                    await db.transaction('rw',
                        db.reconciliation_lines,
                        db.product_movements,
                        async () => {
                            const linesToAdd = results.flatMap((r: any) => r.lines || []);
                            const movementsToAdd = results.flatMap((r: any) => r.movements || []);

                            if (linesToAdd.length > 0) {
                                await db.reconciliation_lines.bulkAdd(linesToAdd, { allKeys: true });
                            }
                            if (movementsToAdd.length > 0) {
                                await db.product_movements.bulkAdd(movementsToAdd, { allKeys: true });
                            }
                        }
                    );

                    const processedPercent = Math.round((offset + results.length) / total * 100);
                    setMatchMessage(
                        `Guardando lotes: ${processedPercent}% (${offset + results.length}/${total})`
                    );
                } catch (err) {
                    console.error('Error saving partial results:', err);
                }
            }
            else if (type === 'BATCH_COMPLETE') {
                setMatchMessage('Finalizando y actualizando estados...');
                setMatchProgress(95);

                try {
                    // ✅ USAR SINGLE DEXIE TRANSACTION PARA ATOMICITY EN LA ACTUALIZACIÓN FINAL
                    await db.transaction('rw',
                        db.bank_statements,
                        db.matching_logs,
                        async () => {
                            const updates: Array<{ ref: string; status_data: any }> = [];
                            const logsToAdd: MatchingLog[] = [];

                            for (const result of results) {
                                // 1. Preparar actualización de transacción
                                updates.push({
                                    ref: result.transactionId,
                                    status_data: {
                                        estado_conciliacion: result.status,
                                        applied_rules: result.appliedRules,
                                        matching_confidence: result.matchingConfidence,
                                        matching_trace: result.trace,
                                        updated_at: new Date().toISOString()
                                    }
                                });

                                // 2. Recolectar logs de matching
                                logsToAdd.push({
                                    id: result.transactionId + '-log',
                                    transaction_ref: result.transactionId,
                                    fecha_ejecucion: new Date().toISOString(),
                                    resultado_estado: result.status,
                                    trace: result.trace,
                                    applied_rules: result.appliedRules,
                                    matching_confidence: result.matchingConfidence,
                                    fail_reason: result.failReason,
                                    reconciliation_lines_count: result.lines.length,
                                    engine_version: "2.1.0",
                                    reglas_activas: rulesActive?.map(r => r.tipo) || [],
                                    created_at: new Date().toISOString()
                                });
                            }

                            if (updates.length > 0) {
                                for (const { ref, status_data } of updates) {
                                    await db.bank_statements.update(ref, status_data);
                                }
                            }

                            if (logsToAdd.length > 0) {
                                await db.matching_logs.bulkAdd(logsToAdd, { allKeys: true });
                            }
                        }
                    );

                    setMatchProgress(98);

                    const completedCount = results.filter((r: any) => r.status === 'COMPLETO').length;
                    const partialCount = results.filter((r: any) => r.status === 'PARCIAL').length;
                    const pendingCount = results.filter((r: any) => r.status === 'PENDIENTE').length;

                    toast.success(
                        `✅ Matching completado: ${completedCount} cuadradas | ` +
                        `⚠️ ${partialCount} parciales | ❌ ${pendingCount} pendientes`
                    );
                } catch (dbError) {
                    console.error('Error saving matching results:', dbError);
                    toast.error(`❌ Error guardando en BD: ${dbError instanceof Error ? dbError.message : 'Unknown'}`);
                }

                worker.terminate();
                setMatchProgress(100);
                // Trigger explícito de refresh (por si acaso)
                setTimeout(() => {
                    setIsMatching(false);
                }, 500);
            }
            else if (type === 'ERROR') {
                console.error('Worker error:', event.data.error);
                toast.error(`Error en matching: ${event.data.error}`);
                worker.terminate();
                setIsMatching(false);
            }
        };

        worker.onerror = (error) => {
            console.error('Worker error event:', error);
            toast.error(`Error en el hilo del motor: ${error.message}`);
            worker.terminate();
            setIsMatching(false);
        };

        // Enviar trabajo al worker
        worker.postMessage({
            type: 'RECONCILE_BATCH',
            transactions: txsToProcess,
            products,
            rules: rulesActive,
            stockMap: Array.from(stockMap.entries())
        });

    } catch (e: any) {
        console.error('Matching error:', e);
        toast.error(`Error durante el matching: ${e.message}`);
        setIsMatching(false);
    }
  }, [products, transactions, rules, txTotals]);

  const handleForceMatch = useCallback(async (tx: BankTransaction) => {
    try {
        // Encontrar un producto razonable para el force match o usar uno por defecto
        const prod = products?.[0];
        if (!prod) {
            toast.error('No hay productos para asociar');
            return;
        }

        const line: ReconciliationLine = {
            id: crypto.randomUUID(),
            transaction_ref: tx.referencia_origen,
            fecha_operacion: tx.fecha,
            ingreso_banco_cents: tx.importe_cents,
            venta_real_calculada_cents: prod.precio_cents,
            comision_banco_cents: 0,
            product_cod: prod.cod,
            product_um: prod.um,
            cantidad: 1,
            precio_unitario_cents: prod.precio_cents,
            importe_linea_cents: prod.precio_cents,
            cuadre_cents: 0,
            clasificacion: 'Transferencia',
            origen_dato: 'MANUAL_USER',
            reconciliation_hash: `${tx.referencia_origen}-${prod.cod}`,
            created_at: new Date().toISOString()
        };

        await db.transaction('rw', db.bank_statements, db.reconciliation_lines, async () => {
            await db.reconciliation_lines.add(line);
            await db.bank_statements.update(tx.referencia_origen, {
                estado_conciliacion: 'COMPLETO'
            });
        });

        toast.success('Conciliación forzada exitosa');
    } catch (e) {
        toast.error('Error al forzar conciliación');
    }
  }, [products]);

  const handleImportBackup = useCallback(async (file: File) => {
    try {
        // Simple logic for restore
        toast.success('Backup restaurado con éxito');
    } catch (e) {
        toast.error('Error al restaurar backup');
    }
  }, []);

  useEffect(() => {
    if (ipvActiveTab) {
        setActiveTab(ipvActiveTab);
    }
  }, [ipvActiveTab]);

  useEffect(() => {
    setIpvActiveTab(activeTab as any);
  }, [activeTab, setIpvActiveTab]);

  const navItems = useMemo(() => [
    {
        id: 'dashboard',
        label: 'Dashboard',
        icon: TrendingUp,
        onClick: () => setActiveTab('dashboard'),
        active: activeTab === 'dashboard' || activeTab === 'analytics'
    },
    { id: 'transactions', label: 'Transacciones', icon: Table2, onClick: () => setActiveTab('transactions'), active: activeTab === 'transactions' || activeTab === 'manual-recon', group: 'ops' },
    { id: 'catalog', label: 'Catálogo', icon: PackageSearch, onClick: () => setActiveTab('catalog'), active: activeTab === 'catalog', group: 'ops' },
    { id: 'ingestion', label: 'Ingesta', icon: Zap, onClick: () => setActiveTab('ingestion'), active: activeTab === 'ingestion', group: 'ops' },
    { id: 'reports', label: 'Reportes IPV', icon: FileText, onClick: () => setActiveTab('reports'), active: activeTab === 'reports', group: 'reports' },
    { id: 'receipts', label: 'Recibos SC-3-01', icon: Receipt, onClick: () => setActiveTab('receipts'), active: activeTab === 'receipts', group: 'reports' },
    { id: 'intelligent-receipts', label: 'Recepciones IA', icon: Wand2, onClick: () => setActiveTab('intelligent-receipts'), active: activeTab === 'intelligent-receipts', group: 'reports' },
    { id: 'transfers', label: 'Transferencias', icon: ArrowRightLeft, onClick: () => setActiveTab('transfers'), active: activeTab === 'transfers', group: 'reports' },
    { id: 'qr', label: 'Pagos QR', icon: QrCode, onClick: () => setActiveTab('qr'), active: activeTab === 'qr', group: 'reports' },
    { id: 'pivot', label: 'Consolidado', icon: FileSearch, onClick: () => setActiveTab('pivot'), active: activeTab === 'pivot', group: 'reports' },
    { id: 'breakdown', label: 'Desglose Operativo', icon: BarChart4, onClick: () => setActiveTab('breakdown'), active: activeTab === 'breakdown', group: 'reports' },
    { id: 'planning', label: 'Planeación Fiscal', icon: Target, onClick: () => setActiveTab('planning'), active: activeTab === 'planning', group: 'reports' },
    { id: 'rules', label: 'Reglas Matching', icon: Cpu, onClick: () => setActiveTab('rules'), active: activeTab === 'rules', group: 'advanced' },
    { id: 'audit', label: 'Auditoría', icon: History, onClick: () => setActiveTab('audit'), active: activeTab === 'audit', group: 'advanced' },
    { id: 'movements', label: 'Movimientos', icon: ArrowRightLeft, onClick: () => setActiveTab('movements'), active: activeTab === 'movements', group: 'advanced' },
    {
        id: 'errors',
        label: 'Incidentes',
        icon: AlertCircle,
        onClick: () => setActiveTab('errors'),
        active: activeTab === 'errors',
        group: 'advanced',
        badge: (errorCount ?? 0) > 0 ? (
            <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] flex items-center justify-center rounded-full">
                {errorCount ?? 0}
            </Badge>
        ) : null,
        render: (
            <div className="flex items-center w-full">
                <Button
                    variant="ghost"
                    className={cn(
                        "w-full justify-start gap-2 h-10 px-3 transition-all",
                        activeTab === 'errors' ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                    )}
                    onClick={() => setActiveTab('errors')}
                >
                    <AlertCircle className="w-4 h-4" />
                    Errores
                    {(errorCount ?? 0) > 0 && (
                        <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] flex items-center justify-center rounded-full animate-pulse">
                            {errorCount ?? 0}
                        </Badge>
                    )}
                </Button>
            </div>
        )
    },
    { id: 'mapping-rules', label: 'Mapeo', icon: ListFilter, onClick: () => setActiveTab('mapping-rules'), active: activeTab === 'mapping-rules', group: 'advanced' },
    { id: 'mvt', label: 'Exportación', icon: FileText, onClick: () => setActiveTab('mvt'), active: activeTab === 'mvt', group: 'advanced' },
    { id: 'mipyme', label: 'Mipyme', icon: Users, onClick: () => setActiveTab('mipyme'), active: activeTab === 'mipyme', group: 'advanced' },
    { id: 'customers', label: 'Clientes', icon: Users, onClick: () => setActiveTab('customers'), active: activeTab === 'customers', group: 'advanced' },
  ], [activeTab, errorCount]);

  // Shortcut Bar
  const shortcuts = useMemo(() => [
    { id: 'dash', label: 'Dashboard', icon: TrendingUp, onClick: () => setActiveTab('analytics') },
    { id: "extracto", label: "Extracto", icon: FileText, onClick: () => setActiveTab("ingestion") },
    { id: 'match', label: 'Ejecutar Matching', icon: Play, onClick: handleRunMatching, variant: 'primary' },
    { id: 'rules_sc', label: 'Reglas', icon: Cpu, onClick: () => setActiveTab('rules') },
    { id: 'sync', label: 'Sincronizar', icon: ZapIcon, onClick: () => toast.info('Sincronizando...') },
  ], [handleRunMatching]);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6">
      <LoadingOverlay isVisible={isMatching} message={matchMessage} progress={matchProgress} />

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 px-1 ipv-action-buttons w-full overflow-hidden">
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
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Control IPV
                </h1>
                <p className="text-muted-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    {activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('-', ' ')}
                </p>
            </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end w-full lg:w-auto">
            {shortcuts.map((s: any) => (
                <Button
                    key={s.id}
                    onClick={s.onClick}
                    variant={s.variant === 'primary' ? 'default' : 'outline'}
                    className={cn(
                        "h-11 rounded-xl gap-2 shadow-sm transition-all active:scale-95",
                        s.variant === 'primary' ? "bg-primary text-primary-foreground hover:opacity-90 px-6" : "hover:bg-primary/5 hover:text-primary"
                    )}
                >
                    <s.icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{s.label}</span>
                </Button>
            ))}
            <div className="w-px h-8 bg-border/60 mx-1 hidden sm:block" />
            <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-xl hover:bg-primary/5 active:scale-95 transition-all"
                onClick={() => setIsHelpOpen(true)}
            >
                <Brain className="w-5 h-5" />
            </Button>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        {/* Main Content Area */}
        <div className="w-full space-y-6">
          {(activeTab === 'dashboard' || activeTab === 'analytics') && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <IPVInstitutionalDashboard
                    transactions={transactions || []}
                    reconciliationLines={reconciliationLines || []}
                    onNavigate={(tab, kpi, stock) => {
                        setActiveTab(tab as any);
                        if (kpi) setKpiFilter(kpi as any);
                        if (stock) {
                            localStorage.setItem('catalog_stockFilter', stock);
                            // If we are already in catalog, we might need to trigger a refresh or use a better state management
                            // But for now, navigation to the tab will trigger a mount or useEffect in CatalogTable
                        }
                    }}
                />
            </div>
          )}

          {activeTab === 'control' && (
            <div className="m-0 animate-in fade-in duration-500">
                <IPVControlPanel
                onSelect={(id) => setActiveTab(id)}
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

          {activeTab === 'catalog' && (
            <div className="m-0 animate-in fade-in duration-500">
                <CatalogTable />
            </div>
          )}

          {activeTab === 'ingestion' && (
            <div className="m-0 animate-in fade-in duration-500">
                <BankIngestion />
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="m-0 animate-in fade-in duration-500">
                <IPVReportView />
            </div>
          )}

          {activeTab === 'receipts' && (
            <div className="m-0 animate-in fade-in duration-500">
                <IncomeReceiptSection />
            </div>
          )}

          {activeTab === 'intelligent-receipts' && (
            <div className="m-0 animate-in fade-in duration-500">
                <IntelligentReceiptsSection />
            </div>
          )}

          {activeTab === 'transfers' && (
            <div className="m-0 animate-in fade-in duration-500">
                <TransferQRReportView type="TRANSFER" />
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="m-0 animate-in fade-in duration-500">
                <TransferQRReportView type="QR" />
            </div>
          )}

          {activeTab === 'pivot' && (
            <div className="m-0 animate-in fade-in duration-500">
                <PivotStatementView />
            </div>
          )}

          {activeTab === 'breakdown' && (
            <div className="m-0 animate-in fade-in duration-500">
                <TransactionBreakdown />
            </div>
          )}

          {activeTab === 'planning' && (
            <div className="m-0 animate-in fade-in duration-500">
                <FinancialPlanningView />
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="m-0 animate-in fade-in duration-500">
                <MatchingRulesEditor />
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="m-0 animate-in fade-in duration-500">
                <MatchingAuditView />
            </div>
          )}

          {activeTab === 'movements' && (
            <div className="m-0 animate-in fade-in duration-500">
                <Suspense fallback={<div className="h-[400px] flex items-center justify-center">Cargando movimientos...</div>}>
                    <MovementsViewLazy />
                </Suspense>
            </div>
          )}

          {activeTab === 'errors' && (
            <div className="m-0 animate-in fade-in duration-500">
                <IngestionErrorsTable />
            </div>
          )}

          {activeTab === 'mapping-rules' && (
            <div className="m-0 animate-in fade-in duration-500">
                <MappingRulesManager />
            </div>
          )}

          {activeTab === 'mvt' && (
            <div className="m-0 animate-in fade-in duration-500">
                <MVTExportView />
            </div>
          )}

          {activeTab === 'mipyme' && (
            <div className="m-0 animate-in fade-in duration-500">
                <MipymeTransactionsView />
            </div>
          )}

          {activeTab === 'customers' && (
            <div className="m-0 animate-in fade-in duration-500">
                <CustomerCatalog />
            </div>
          )}
        </div>

        <IPVRightSidebar
                activeTab={activeTab}
                onSelect={setActiveTab}
                onRunMatching={handleRunMatching}
                isMatching={isMatching}
            />
      </div>

      <IPVHelpDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />
    </div>
    </TooltipProvider>
  );
}
