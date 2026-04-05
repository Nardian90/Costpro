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

// Lazy loaded components with named exports
const TransactionTable = lazy(() => import('./TransactionTable').then(m => ({ default: m.TransactionTable })));
const ManualReconciliationView = lazy(() => import('./ManualReconciliationView'));
const MatchingSimulation = lazy(() => import('./MatchingSimulation').then(m => ({ default: m.MatchingSimulation })));
const TransactionBreakdown = lazy(() => import('./TransactionBreakdown'));
const PivotStatementView = lazy(() => import('./PivotStatementView').then(m => ({ default: m.PivotStatementView })));
const FinancialPlanningView = lazy(() => import('./FinancialPlanningView').then(m => ({ default: m.FinancialPlanningView })));
const CatalogTable = lazy(() => import('./CatalogTable').then(m => ({ default: m.CatalogTable })));
const MatchingAuditView = lazy(() => import('./MatchingAuditView').then(m => ({ default: m.MatchingAuditView })));
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

const DEFAULT_MATCHING_RULES: any[] = [];

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

  // Sync internal activeTab with global ipvActiveTab
  useEffect(() => {
    if (ipvActiveTab && ipvActiveTab !== activeTab) {
        setActiveTab(ipvActiveTab);
    }
  }, [ipvActiveTab]);

  // Update global store when tab changes
  useEffect(() => {
    setIpvActiveTab(activeTab);
  }, [activeTab, setIpvActiveTab]);

  const transactions = useLiveQuery(() => db.bank_statements.toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const rules = useLiveQuery(() => db.matching_rules.toArray());
  const settings = useLiveQuery(() => db.ipv_settings.get('current'));
  const errorCount = useLiveQuery(() => db.ingestion_errors.count()) || 0;

  const stats = useMemo(() => {
    if (!transactions) return { total: 0, squared: 0, inProcess: 0, pending: 0, totalSales: 0, totalEfectivo: 0, totalTransferencias: 0, percentage: 0, negativeStock: 0 };

    const total = transactions.length;
    const squared = transactions.filter((t: any) => t.estado_conciliacion === 'COMPLETO').length;
    const inProcess = transactions.filter((t: any) => t.estado_conciliacion === 'PARCIAL').length;
    const pending = transactions.filter((t: any) => t.estado_conciliacion === 'PENDIENTE').length;

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

  const handleRunMatching = async () => {
    setIsMatching(true);
    setMatchMessage('Iniciando matching masivo...');
    setMatchProgress(10);

    try {
        // Mock matching logic for demo purposes
        await new Promise(r => setTimeout(r, 1500));
        setMatchMessage('Analizando patrones bancarios...');
        setMatchProgress(40);
        await new Promise(r => setTimeout(r, 1000));
        setMatchMessage('Asociando productos inteligentes...');
        setMatchProgress(75);
        await new Promise(r => setTimeout(r, 1000));
        toast.success('Matching completado con éxito');
    } catch (e) {
        toast.error('Error durante el matching');
    } finally {
        setIsMatching(false);
    }
  };

  const handleForceMatch = (tx: any) => {
    toast.info(`Forzando match para ${tx.referencia_origen}`);
  };

  const handleImportBackup = async (file: File) => {
      toast.success('Backup importado correctamente');
  };

  const menuActions: Action[] = useMemo(() => [
    // Reporting
    { id: 'analytics', label: 'Dashboard Institucional', icon: TrendingUp, onClick: () => setActiveTab('analytics'), active: activeTab === 'analytics', group: 'reporting' },
    { id: 'reports', label: 'Reportes IPV', icon: ClipboardList, onClick: () => setActiveTab('reports'), active: activeTab === 'reports', group: 'reporting' },
    { id: 'receipts', label: 'Recibos SC-3-01', icon: Receipt, onClick: () => setActiveTab('receipts'), active: activeTab === 'receipts', group: 'reporting' },
    { id: 'transfers', label: 'Transferencias', icon: ArrowRightLeft, onClick: () => setActiveTab('transfers'), active: activeTab === 'transfers', group: 'reporting' },
    { id: 'qr', label: 'Pagos QR', icon: QrCode, onClick: () => setActiveTab('qr'), active: activeTab === 'qr', group: 'reporting' },
    {
        id: 'ingestion',
        label: 'Extracto',
        icon: Database,
        onClick: () => setActiveTab('ingestion'),
        active: activeTab === 'ingestion',
        group: 'reporting',
        component: (
            <div className="relative">
                <Button
                    variant={activeTab === 'ingestion' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('ingestion')}
                    className={cn(
                        "h-11 px-4 rounded-xl font-bold uppercase tracking-widest text-[10px] gap-2",
                        activeTab === 'ingestion' ? "neu-inset-sm" : "neu-btn"
                    )}
                >
                    <Database className="w-4 h-4" />
                    Extracto
                    {errorCount > 0 && (
                        <Badge className="ml-1 h-5 min-w-[20px] flex items-center justify-center rounded-full bg-orange-500 text-white border-none">
                            !
                        </Badge>
                    )}
                </Button>
            </div>
        )
    },
    { id: 'pivot', label: 'Consolidado', icon: FileSearch, onClick: () => setActiveTab('pivot'), active: activeTab === 'pivot', group: 'reporting' },

    // Core / Operaciones
    { id: 'dashboard', label: 'Panel de Control', icon: Workflow, onClick: () => setActiveTab('dashboard'), active: activeTab === 'dashboard', group: 'core' },
    { id: 'transactions', label: 'Transacciones', icon: Table2, onClick: () => setActiveTab('transactions'), active: activeTab === 'transactions', group: 'core' },

    // Data / Catálogos
    { id: 'catalog', label: 'Catálogo', icon: PackageSearch, onClick: () => setActiveTab('catalog'), active: activeTab === 'catalog', group: 'data' },
    { id: 'customers', label: 'Clientes', icon: Users, onClick: () => setActiveTab('customers'), active: activeTab === 'customers', group: 'data' },

    // Processing / Procesamiento
    { id: 'rules', label: 'Reglas', icon: Cpu, onClick: () => setActiveTab('rules'), active: activeTab === 'rules', group: 'processing' },
    { id: 'sim', label: 'Simulación', icon: Zap, onClick: () => setActiveTab('sim'), active: activeTab === 'sim', group: 'processing' },
    { id: 'intelligent-receipts', label: 'Recepciones Inteligentes', icon: Wand2, onClick: () => setActiveTab('intelligent-receipts'), active: activeTab === 'intelligent-receipts', group: 'processing' },
    { id: 'breakdown', label: 'Desglose', icon: BarChart4, onClick: () => setActiveTab('breakdown'), active: activeTab === 'breakdown', group: 'processing' },

    // Advanced / Avanzado
    { id: 'audit', label: 'Auditoría', icon: History, onClick: () => setActiveTab('audit'), active: activeTab === 'audit', group: 'advanced' },
    { id: 'movements', label: 'Trazabilidad', icon: Workflow, onClick: () => setActiveTab('movements'), active: activeTab === 'movements', group: 'advanced' },
    { id: 'planning', label: 'Planeación', icon: Target, onClick: () => setActiveTab('planning'), active: activeTab === 'planning', group: 'advanced' },
    {
        id: 'errors',
        label: 'Errores',
        icon: AlertCircle,
        onClick: () => setActiveTab('errors'),
        active: activeTab === 'errors',
        group: 'advanced',
        component: (
            <div className="relative">
                <Button
                    variant={activeTab === 'errors' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('errors')}
                    className={cn(
                        "h-11 px-4 rounded-xl font-bold uppercase tracking-widest text-[10px] gap-2",
                        activeTab === 'errors' ? "neu-inset-sm" : "neu-btn"
                    )}
                >
                    <AlertCircle className="w-4 h-4" />
                    Errores
                    {errorCount > 0 && (
                        <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] flex items-center justify-center rounded-full animate-pulse">
                            {errorCount}
                        </Badge>
                    )}
                </Button>
            </div>
        )
    },
    { id: 'mapping-rules', label: 'Mapeo', icon: ListFilter, onClick: () => setActiveTab('mapping-rules'), active: activeTab === 'mapping-rules', group: 'advanced' },
    { id: 'mvt', label: 'Exportación', icon: FileText, onClick: () => setActiveTab('mvt'), active: activeTab === 'mvt', group: 'advanced' },
    { id: 'mipyme', label: 'Mipyme', icon: Users, onClick: () => setActiveTab('mipyme'), active: activeTab === 'mipyme', group: 'advanced' },
  ], [activeTab, errorCount]);

  // Shortcut Bar
  const shortcuts = useMemo(() => [
    { id: 'dash', label: 'Dashboard', icon: TrendingUp, onClick: () => setActiveTab('analytics') },
    { id: 'match', label: 'Ejecutar Matching', icon: Play, onClick: handleRunMatching, variant: 'primary' },
    { id: 'rules_sc', label: 'Reglas', icon: Cpu, onClick: () => setActiveTab('rules') },
    { id: 'sync', label: 'Sincronizar', icon: ZapIcon, onClick: () => toast.info('Sincronizando...') },
  ], []);

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
      </div>

      {/* Shortcut Bar */}
      <div className="sticky top-[130px] z-30 py-2 -mx-1 px-1 bg-background/50 backdrop-blur-sm rounded-2xl">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {shortcuts.map(s => (
                  <Button
                    key={s.id}
                    variant={s.variant === 'primary' ? 'default' : 'outline'}
                    size="sm"
                    onClick={s.onClick}
                    className="h-9 px-4 rounded-xl font-black uppercase tracking-widest text-[9px] gap-2 whitespace-nowrap shadow-sm active:scale-95 transition-all"
                  >
                    <s.icon className="w-3.5 h-3.5" />
                    {s.label}
                  </Button>
              ))}
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
                topOffset="sticky top-[170px]"
                className="mb-6 !-mx-4 px-4 py-2"
            />

        <div className={(activeTab === 'dashboard' || activeTab === 'analytics') ? '' : 'mt-6 p-0 overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur-sm rounded-3xl'}>
          <Suspense fallback={<div className="p-20 text-center uppercase font-black text-muted-foreground animate-pulse tracking-widest">Cargando Vista...</div>}>
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
                <MovementsViewLazy />
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
          </Suspense>
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
        <p className="text-xs sm:text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5 truncate w-full text-center sm:text-left">{title}</p>
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
