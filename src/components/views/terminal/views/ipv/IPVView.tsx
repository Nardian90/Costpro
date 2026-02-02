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
  Clock
} from 'lucide-react';
import { BankIngestion } from './BankIngestion';
import { TransactionTable } from './TransactionTable';
import { CatalogTable } from './CatalogTable';
import { IPVReportView } from './IPVReportView';
import { MatchingRulesEditor } from './MatchingRulesEditor';
import { CashAdjustmentsTable } from './CashAdjustmentsTable';
import { PivotStatementView } from './PivotStatementView';
import { IngestionErrorsTable } from './IngestionErrorsTable';
import { toast } from 'sonner';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function IPVView() {
  const [activeTab, setActiveTab] = useState('transactions');
  const [isMatching, setIsMatching] = useState(false);
  const [matchMessage, setMatchMessage] = useState('');
  const [matchProgress, setMatchProgress] = useState(0);
  const [kpiFilter, setKpiFilter] = useState<'ALL' | 'CUADRADAS' | 'EN_PROCESO' | 'PENDIENTES'>('ALL');

  const transactions = useLiveQuery(() => db.bank_statements.orderBy('fecha').toArray());
  const rules = useLiveQuery(() => db.matching_rules.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());
  const ingestionErrorsCount = useLiveQuery(() => db.ingestion_errors.count()) || 0;

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
    if (!transactions) return { total: 0, squared: 0, inProcess: 0, pending: 0, percentage: 0 };

    let squared = 0;
    let inProcess = 0;
    let pending = 0;

    for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];
        const matched = txTotals[t.referencia_origen] || 0;
        const target = t.importe_venta_cents || t.importe_cents;
        const diff = target - matched;

        if (matched === 0) {
            pending++;
        } else if (Math.abs(diff) < 0.001) {
            squared++;
        } else {
            inProcess++;
        }
    }

    return {
      total: transactions.length,
      squared,
      inProcess,
      pending,
      percentage: transactions.length > 0 ? Math.round((squared / transactions.length) * 100) : 0
    };
  }, [transactions, txTotals]);

  const handleRunMatching = async () => {
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

    // RESET LOGIC: Reiniciar conciliación para transacciones que no estén cuadradas (diff != 0)
    const allLines = await db.reconciliation_lines.toArray();
    const txTotals = allLines.reduce((acc, line) => {
        acc[line.transaction_ref] = (acc[line.transaction_ref] || 0) + line.importe_linea_cents;
        return acc;
    }, {} as Record<string, number>);

    const txToReset = transactions.filter(t => {
        const matched = txTotals[t.referencia_origen] || 0;
        const target = t.importe_venta_cents || t.importe_cents;
        return Math.abs(target - matched) >= 0.001;
    });

    if (txToReset.length > 0) {
        setMatchMessage(`Reiniciando ${txToReset.length} transacciones no cuadradas...`);
        for (const tx of txToReset) {
            await db.reconciliation_lines.where('transaction_ref').equals(tx.referencia_origen).delete();
            await db.bank_statements.update(tx.referencia_origen, { estado_conciliacion: 'PENDIENTE' });
        }
    }

    // Volvemos a obtener transacciones actualizadas para enviar al worker
    const updatedTransactions = await db.bank_statements.toArray();
    setMatchMessage('Ejecutando algoritmos de matching...');

    // Aquí invocaríamos al Worker
    const worker = new Worker(new URL('@/lib/ipv/matching.worker.ts', import.meta.url));

    worker.postMessage({
      type: 'RECONCILE_BATCH',
      transactions: updatedTransactions.filter(t => t.estado_conciliacion !== 'COMPLETO' && !t.excluido),
      products,
      rules
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
  };

  return (
    <div className="space-y-6">
      <LoadingOverlay isVisible={isMatching} message={matchMessage} progress={matchProgress} />
      {/* Help Section: Professional Flow */}
      <Card className="p-6 bg-primary/5 border-none shadow-none rounded-3xl overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Settings className="w-32 h-32" />
          </div>
          <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="w-5 h-5" />
                  <h2 className="font-black uppercase tracking-widest text-sm">Flujo de Trabajo Profesional</h2>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 sm:gap-6">
                  <FlowStep number="1" title="Catálogo" desc="Carga productos y precios." />
                  <FlowStep number="2" title="Reglas" desc="Configura el motor de matching." />
                  <FlowStep number="3" title="Movimientos" desc="Ingesta de extractos bancarios." />
                  <FlowStep number="4" title="Validación" desc="Revisión y cuadre manual." />
                  <FlowStep number="5" title="IPV" desc="Generación de reportes diarios." />
                  <FlowStep number="6" title="Auditoría" desc="Exportación y control fiscal." />
              </div>
          </div>
      </Card>

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 px-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-primary uppercase">IPV Builder</h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium">Conciliación bancaria y generación de IPV</p>
        </div>

        <div className="flex gap-2 w-full lg:w-auto">
            <Button variant="outline" className="neu-btn flex-1 lg:flex-none h-12 lg:h-10 text-xs font-bold uppercase" onClick={() => setActiveTab('rules')}>
                <Settings className="w-4 h-4 mr-2 shrink-0" />
                Reglas
            </Button>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button onClick={handleRunMatching} className="neu-btn-primary flex-[2] lg:flex-none h-12 lg:h-10 font-black text-xs uppercase">
                            <Play className="w-4 h-4 mr-2 shrink-0" />
                            Ejecutar Matching
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs p-4 space-y-2">
                        <p className="font-bold text-primary">Motor de Matching Pro:</p>
                        <p className="text-[10px] leading-relaxed">
                            Procesa transacciones en 4 pasos automáticos:
                            <br/>1. <strong>Hard Ref:</strong> Match por código en obs.
                            <br/>2. <strong>Exact Sum:</strong> Combinación exacta de productos.
                            <br/>3. <strong>Tolerance:</strong> Match con pequeño margen de error.
                            <br/>4. <strong>Cash Fill:</strong> Cubre el resto con ajuste de caja.
                        </p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
            title="Total"
            value={stats.total}
            icon={<History className="text-blue-500" />}
            subtitle="Transacciones"
            active={kpiFilter === 'ALL'}
            onClick={() => setKpiFilter('ALL')}
        />
        <StatCard
            title="Cuadradas"
            value={stats.squared}
            icon={<CheckCircle2 className="text-green-500" />}
            trend={`${stats.percentage}%`}
            subtitle="Completadas"
            active={kpiFilter === 'CUADRADAS'}
            onClick={() => setKpiFilter('CUADRADAS')}
        />
        <StatCard
            title="En Proceso"
            value={stats.inProcess}
            icon={<AlertCircle className="text-yellow-500" />}
            subtitle="Con Diferencia"
            active={kpiFilter === 'EN_PROCESO'}
            onClick={() => setKpiFilter('EN_PROCESO')}
        />
        <StatCard
            title="Pendientes"
            value={stats.pending}
            icon={<Clock className="text-orange-500" />}
            subtitle="Sin Matching"
            active={kpiFilter === 'PENDIENTES'}
            onClick={() => setKpiFilter('PENDIENTES')}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="relative">
            <div className="flex overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent sm:pb-0">
                <TabsList className="flex w-max min-w-full lg:grid lg:grid-cols-8 lg:max-w-[1300px] bg-muted/50 p-1 rounded-xl h-auto sm:h-10">
                    <TabsTrigger value="transactions" className="px-4 py-2.5 sm:py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-widest">Transacciones</TabsTrigger>
                    <TabsTrigger value="pivot" className="px-4 py-2.5 sm:py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-widest">Consolidado</TabsTrigger>
                    <TabsTrigger value="catalog" className="px-4 py-2.5 sm:py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-widest">Catálogo</TabsTrigger>
                    <TabsTrigger value="ingestion" className="px-4 py-2.5 sm:py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-widest text-nowrap">Extracto</TabsTrigger>
                    <TabsTrigger value="errors" className="px-4 py-2.5 sm:py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-widest relative">
                        Errores
                        {ingestionErrorsCount > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] text-white font-black shadow-sm animate-pulse">
                                {ingestionErrorsCount}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="px-4 py-2.5 sm:py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-widest text-nowrap">Reportes IPV</TabsTrigger>
                    <TabsTrigger value="adjustments" className="px-4 py-2.5 sm:py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-widest">Ajustes</TabsTrigger>
                    <TabsTrigger value="rules" className="px-4 py-2.5 sm:py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-widest">Reglas</TabsTrigger>
                </TabsList>
            </div>
            <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none lg:hidden" />
        </div>

        <Card className="mt-6 p-0 overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur-sm">
          <TabsContent value="transactions" className="m-0">
            <TransactionTable
              transactions={transactions || []}
              kpiFilter={kpiFilter}
              txReconciliationTotals={txTotals}
            />
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

          <TabsContent value="adjustments" className="m-0">
            <CashAdjustmentsTable />
          </TabsContent>

          <TabsContent value="errors" className="m-0">
            <IngestionErrorsTable />
          </TabsContent>
        </Card>
      </Tabs>
    </div>
  );
}

function FlowStep({ number, title, desc }: { number: string, title: string, desc: string }) {
    return (
        <div className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-black">{number}</span>
            <div>
                <p className="text-xs font-black uppercase text-primary tracking-tighter">{title}</p>
                <p className="text-[10px] text-muted-foreground leading-tight font-medium">{desc}</p>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, trend, subtitle, active, onClick }: { title: string, value: number, icon: React.ReactNode, trend?: string, subtitle?: string, active?: boolean, onClick?: () => void }) {
  return (
    <Card
        onClick={onClick}
        className={`p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:justify-between border-2 transition-all cursor-pointer gap-2 ${active ? 'border-primary bg-primary/5 shadow-lg scale-[1.02]' : 'border-transparent bg-card/50 backdrop-blur-sm shadow-md hover:border-primary/20'}`}
    >
      <div className="flex flex-col items-center sm:items-start space-y-0.5 sm:space-y-1">
        <p className="text-[10px] sm:text-xs font-black text-muted-foreground uppercase tracking-widest">{title}</p>
        <div className="flex items-baseline gap-1.5 sm:gap-2">
            <h3 className="text-xl sm:text-2xl font-black">{value}</h3>
            {trend && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 font-bold text-green-600 bg-green-500/10 border-green-500/20">
                    {trend}
                </Badge>
            )}
        </div>
        {subtitle && <p className="text-[9px] sm:text-[10px] text-muted-foreground font-bold uppercase opacity-60">{subtitle}</p>}
      </div>
      <div className="p-2 sm:p-3 bg-background rounded-xl sm:rounded-2xl shadow-inner">
        {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-4 h-4 sm:w-5 sm:h-5' })}
      </div>
    </Card>
  );
}
