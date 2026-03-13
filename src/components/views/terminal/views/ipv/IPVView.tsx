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
  QrCode
} from 'lucide-react';
import BankIngestion from './BankIngestion';
import { TransactionTable } from './TransactionTable';
import { CatalogTable } from './CatalogTable';
import MovementsView from './MovementsView';
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
import { IncomeReceiptSection } from './IncomeReceiptSection';
import { TransferQRReportView } from './TransferQRReportView';
import { IPVReportsDropdown } from './IPVReportsDropdown';
import { MatchingEngine } from '@/lib/ipv/engine';
import { toast } from 'sonner';
import { exportFullBackup } from '@/lib/ipv/backup';
import ActionMenu, { Action } from "@/components/ui/ActionMenu";
import { formatCurrency } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function IPVView() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [kpiFilter, setKpiFilter] = useState<'ALL' | 'CUADRADAS' | 'EN_PROCESO' | 'PENDIENTES'>('ALL');
  const [selectedReconTx, setSelectedReconTx] = useState<BankTransaction | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const transactions = useLiveQuery(() => db.bank_statements.orderBy('fecha').reverse().toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const rules = useLiveQuery(() => db.matching_rules.orderBy('prioridad').toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());

  const txTotals = useMemo(() => {
    const map = new Map<string, number>();
    reconciliationLines?.forEach(line => {
      const current = map.get(line.transaction_ref) || 0;
      map.set(line.transaction_ref, current + line.venta_real_calculada_cents);
    });
    return map;
  }, [reconciliationLines]);

  const stats = useMemo(() => {
    if (!transactions) return { total: 0, squared: 0, inProcess: 0, pending: 0, percentage: 0 };
    const filtered = transactions.filter(tx => !tx.excluido);
    let squared = 0;
    let inProcess = 0;
    let pending = 0;

    filtered.forEach(tx => {
      const reconciled = txTotals.get(tx.referencia_origen) || 0;
      const target = tx.importe_venta_cents || tx.importe_cents;
      if (Math.abs(reconciled - target) < 0.01) squared++;
      else if (reconciled > 0) inProcess++;
      else pending++;
    });

    const percentage = filtered.length > 0 ? Math.round((squared / filtered.length) * 100) : 0;
    return { total: filtered.length, squared, inProcess, pending, percentage };
  }, [transactions, txTotals]);

  const handleForceMatch = async (tx: BankTransaction) => {
    if (!products || !rules) return;
    const engine = new MatchingEngine(products, rules);
    const result = await engine.matchTransaction(tx);

    if (result.status === 'COMPLETO' || result.status === 'PARCIAL') {
        if (result.lines.length > 0) {
            await db.reconciliation_lines.bulkAdd(result.lines);
            await db.bank_statements.update(tx.referencia_origen, {
                estado_conciliacion: result.status,
                fail_reason: undefined
            });
            if (result.movements.length > 0) {
                await db.product_movements.bulkAdd(result.movements);
            }
            toast.success(`Matching exitoso: ${result.lines.length} productos asociados`);
        }
    } else {
        await db.bank_statements.update(tx.referencia_origen, { fail_reason: 'No se encontró combinación válida' });
        toast.error('No se pudo realizar el matching automático');
    }
  };

  const handleImportBackup = async (file: File) => {
      // Implementación simplificada para el view
      toast.info("Importando respaldo...");
  };

  const menuActions: Action[] = [
    { id: 'dashboard', label: 'Flujo', icon: Workflow, onClick: () => setActiveTab('dashboard') },
    { id: 'analytics', label: 'Dashboard', icon: BarChart4, onClick: () => setActiveTab('analytics') },
    { id: 'ingestion', label: 'Extracto', icon: FileSearch, onClick: () => setActiveTab('ingestion') },
    { id: 'catalog', label: 'Catálogo', icon: PackageSearch, onClick: () => setActiveTab('catalog') },
    { id: 'movements', label: 'Trazabilidad', icon: History, onClick: () => setActiveTab('movements') },
    { id: 'reports', label: 'Reportes IPV', icon: FileText, onClick: () => setActiveTab('reports') },
    { id: 'rules', label: 'Reglas', icon: Cpu, onClick: () => setActiveTab('rules') },
  ];

  return (
    <TooltipProvider>
    <div className="p-4 sm:p-8 max-w-[1600px] mx-auto space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary rounded-2xl shadow-lg shadow-primary/20">
                <Workflow className="w-6 h-6 text-primary-foreground" />
            </div>
            <h2 className="text-3xl font-black uppercase tracking-tighter italic">Terminal IPV <span className="text-primary not-italic">PRO</span></h2>
          </div>
          <p className="text-muted-foreground font-bold text-sm ml-1">Sistema Inteligente de Conciliación y Trazabilidad</p>
        </div>

        <div className="flex items-center gap-3">
            <IPVReportsDropdown activeTab={activeTab} onSelect={setActiveTab} />
            <Button variant="outline" size="icon" className="rounded-xl h-12 w-12" onClick={() => setActiveTab('rules')}>
                <Settings className="w-5 h-5" />
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <p className="text-xs font-bold">Total de movimientos activos en el período.</p>
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
                <p className="text-xs font-bold">Transacciones con matching perfecto.</p>
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
                <p className="text-xs font-bold">Transacciones con diferencia pendiente.</p>
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
                <p className="text-xs font-bold">Transacciones sin procesar.</p>
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
        </div>
      </div>
    </div>
    </TooltipProvider>
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
            <h3 className="text-[clamp(1.5rem,6vw,2.5rem)] font-black">{isCurrency ? formatCurrency(value) : value}</h3>
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
