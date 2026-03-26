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
  BarChart4, Wand2, Users,
  PackageSearch,
  FileSearch, Target,
  Receipt,
  ArrowRightLeft,
  QrCode,
  ListFilter
} from 'lucide-react';
import { MatchingAuditView } from './MatchingAuditView';
import { BankIngestion } from './BankIngestion';
import { TransactionTable } from './TransactionTable';
import { CatalogTable } from './CatalogTable';
import MovementsView from './MovementsView';
import { MatchingSimulation } from './MatchingSimulation';
import { TransactionBreakdown } from './TransactionBreakdown';
import { IPVReportView } from './IPVReportView';
import { IntelligentReceiptsSection } from './IntelligentReceipts/IntelligentReceiptsSection';
import { MatchingRulesEditor } from './MatchingRulesEditor';
import { PivotStatementView } from './PivotStatementView';
import { FinancialPlanningView } from './FinancialPlanningView';
import { IngestionErrorsTable } from './IngestionErrorsTable';
import { ManualReconciliationView } from './ManualReconciliationView';
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
import { exportFullBackup, importFullBackup, runAutoBackup } from "@/lib/ipv/backup";
import { MatchingEngine, DEFAULT_MATCHING_RULES } from "@/lib/ipv/engine";
import { formatCurrency, cn } from '@/lib/utils';
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

  const transactions = useLiveQuery(() => db.bank_statements.orderBy('fecha').toArray());
  const rules = useLiveQuery(() => db.matching_rules.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const ingestionErrorsCount = useLiveQuery(() => db.ingestion_errors.count()) || 0;
  const settings = useLiveQuery(() => db.ipv_settings.get("current"));

  React.useEffect(() => {
    const interval = setInterval(() => {
      runAutoBackup(db);
    }, 3600000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (rules && rules.length === 0) {
      db.matching_rules.bulkPut(DEFAULT_MATCHING_RULES);
      seedMappingRules();
      runAutoBackup(db);
    }
  }, [rules]);

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
    if (!transactions) return { total: 0, squares: 0, inProcess: 0, pending: 0, totalAmount: 0 };
    let squares = 0;
    let inProcess = 0;
    let pending = 0;
    let totalAmount = 0;
    transactions.forEach(tx => {
        totalAmount += tx.importe_cents;
        const matchedTotal = txTotals[tx.referencia_origen] || 0;
        const target = tx.importe_venta_cents || tx.importe_cents;
        if (Math.abs(matchedTotal - target) < 0.001) squares++;
        else if (matchedTotal > 0) inProcess++;
        else pending++;
    });
    return { total: transactions.length, squares, inProcess, pending, totalAmount };
  }, [transactions, txTotals]);

  const handleRunMatching = async () => {
    if (!transactions || !products || !rules) return;
    setIsMatching(true);
    setMatchProgress(0);
    try {
        const engine = new MatchingEngine(products, settings?.copiloto_activo ? DEFAULT_MATCHING_RULES : rules);
        const engineResults = await engine.reconcileAll(transactions, (p) => {
            setMatchProgress(p);
            setMatchMessage(`Analizando transacciones: ${p}%`);
        }, currentStockMap);

        await db.transaction('rw', [db.reconciliation_lines, db.bank_statements, db.matching_logs], async () => {
            for (const res of engineResults) {
                if (res.lines.length > 0) {
                    await db.reconciliation_lines.bulkAdd(res.lines);
                    await db.bank_statements.update(res.transactionId, {
                        estado_conciliacion: res.status,
                        applied_rules: res.appliedRules,
                        fail_reason: res.failReason
                    });
                } else if (res.failReason) {
                    await db.bank_statements.update(res.transactionId, {
                        fail_reason: res.failReason
                    });
                }

                if (res.trace && res.trace.length > 0) {
                    await db.matching_logs.add({
                        transaction_ref: res.transactionId,
                        fecha_ejecucion: new Date().toISOString(),
                        trace: res.trace,
                        status: res.status,
                        confidence: res.matchingConfidence || 0
                    });
                }
            }
        });
        toast.success('Matching automatizado completado');
        recalculateIPVReportsChain();
    } catch (error) {
        console.error('Matching Error:', error);
        toast.error('Error durante la ejecución del matching');
    } finally {
        setIsMatching(false);
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
        await importFullBackup(db, file);
        toast.success('Copia de seguridad restaurada');
        window.location.reload();
    } catch (e: any) {
        toast.error(`Error al restaurar: ${e.message}`);
    }
  };

  const handleForceMatch = async (tx: BankTransaction) => {
    setSelectedReconTx(tx);
    setActiveTab('manual-recon');
  };

  const menuActions: Action[] = [
    { id: 'dashboard', label: 'Inicio', icon: Workflow, active: activeTab === 'dashboard' },
    { id: 'analytics', label: 'Dashboard', icon: TrendingUp, active: activeTab === 'analytics' },
    { id: 'ingestion', label: 'Extracto', icon: Database, active: activeTab === 'ingestion' },
    { id: 'catalog', label: 'Catálogo', icon: PackageSearch, active: activeTab === 'catalog' },
    { id: 'transactions', label: 'Transacciones', icon: Table2, active: activeTab === 'transactions' },
    { id: 'intelligent-receipts', label: 'Recibos I.', icon: Zap, active: activeTab === 'intelligent-receipts' },
    { id: 'reports-drop', label: 'Documentos', icon: FileText, customElement: <IPVReportsDropdown activeTab={activeTab} onSelect={setActiveTab} /> },
    { id: 'audit', label: 'Auditoría', icon: History, active: activeTab === 'audit' },
    { id: 'settings-drop', label: 'Config', icon: Settings, customElement: (
        <HorizontalScroll className="flex gap-2">
            <Button variant={activeTab === 'rules' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('rules')} className="h-8 text-[10px] font-black uppercase">Reglas Matching</Button>
            <Button variant={activeTab === 'mapping-rules' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('mapping-rules')} className="h-8 text-[10px] font-black uppercase">Mapeo Identidad</Button>
            <Button variant={activeTab === 'customers' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('customers')} className="h-8 text-[10px] font-black uppercase">Clientes</Button>
            <Button variant={activeTab === 'mvt' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('mvt')} className="h-8 text-[10px] font-black uppercase">Contabilidad MVT</Button>
            <Button variant="ghost" size="sm" onClick={() => setIsHelpOpen(true)} className="h-8 text-[10px] font-black uppercase">Ayuda</Button>
        </HorizontalScroll>
    )}
  ];

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-background/30 p-2 sm:p-4 lg:p-6 space-y-6 ipv-content">
      {isMatching && <LoadingOverlay message={matchMessage} progress={matchProgress} />}

      <IPVHelpDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 overflow-hidden">
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex-1">
                    <StatCard
                        title="Ventas Totales"
                        value={stats.totalAmount}
                        icon={<Database className="text-primary" />}
                        subtitle={`${stats.total} Operaciones`}
                        isCurrency={true}
                        active={kpiFilter === 'ALL'}
                        onClick={() => {
                            setKpiFilter('ALL');
                            setActiveTab('transactions');
                        }}
                    />
                </div>
            </TooltipTrigger>
            <TooltipContent className="bg-popover text-popover-foreground border shadow-lg">
                <p className="text-xs font-bold">Importe total neto de todas las operaciones bancarias cargadas en el sistema.</p>
            </TooltipContent>
        </Tooltip>

        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex-1">
                    <StatCard
                        title="Cuadradas"
                        value={stats.squares}
                        icon={<CheckCircle2 className="text-green-500" />}
                        subtitle="Conciliación 100%"
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


function StatCard({ title, value, icon, trend, subtitle, active, onClick, isCurrency = false }: { title: string, value: number, icon: React.ReactNode, trend?: string, subtitle?: string, active?: boolean, onClick?: () => void, isCurrency?: boolean }) {
  const formattedValue = React.useMemo(() => {
    if (!isCurrency) return value.toString();
    if (value > 9999) {
        return `${(value / 1000).toFixed(1)} MP`;
    }
    return formatCurrency(value);
  }, [value, isCurrency]);

  return (
    <Card
        onClick={onClick}
        className={`p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:justify-between border-2 transition-all cursor-pointer gap-2 ${active ? 'border-primary bg-primary/5 shadow-lg scale-[1.02]' : 'border-transparent bg-card/50 backdrop-blur-sm shadow-md hover:border-primary/20'}`}
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
