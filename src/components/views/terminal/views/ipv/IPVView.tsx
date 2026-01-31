'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BankTransaction } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
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
import { IPVReportView } from './IPVReportView';
import { MatchingRulesEditor } from './MatchingRulesEditor';
import { CashAdjustmentsTable } from './CashAdjustmentsTable';
import { toast } from 'sonner';

export default function IPVView() {
  const [activeTab, setActiveTab] = useState('transactions');

  const transactions = useLiveQuery(() => db.bank_statements.toArray());
  const rules = useLiveQuery(() => db.matching_rules.toArray());
  const products = useLiveQuery(() => db.products.toArray());

  const stats = useMemo(() => {
    if (!transactions) return { total: 0, completed: 0, pending: 0, partial: 0 };
    return {
      total: transactions.length,
      completed: transactions.filter(t => t.estado_conciliacion === 'COMPLETO').length,
      pending: transactions.filter(t => t.estado_conciliacion === 'PENDIENTE').length,
      partial: transactions.filter(t => t.estado_conciliacion === 'PARCIAL').length,
    };
  }, [transactions]);

  const handleRunMatching = async () => {
    if (!transactions || transactions.length === 0) {
      toast.error('No hay transacciones para procesar');
      return;
    }

    if (!products || products.length === 0) {
        toast.error('El catálogo de productos está vacío');
        return;
    }

    toast.info('Iniciando proceso de matching...');

    // Aquí invocaríamos al Worker
    const worker = new Worker(new URL('@/lib/ipv/matching.worker.ts', import.meta.url));

    worker.postMessage({
      type: 'RECONCILE_BATCH',
      transactions: transactions.filter(t => t.estado_conciliacion !== 'COMPLETO'),
      products,
      rules
    });

    worker.onmessage = async (e) => {
      if (e.data.type === 'BATCH_COMPLETE') {
        const { results } = e.data;

        // Persistir resultados
        for (const res of results) {
          if (res.lines.length > 0) {
            await db.reconciliation_lines.bulkAdd(res.lines);
            await db.bank_statements.update(res.transactionId, {
              estado_conciliacion: res.status
            });
          }
        }

        toast.success(`Proceso completado: ${results.length} transacciones analizadas`);
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      toast.error('Error en el motor de matching');
      worker.terminate();
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary uppercase">IPV Builder</h1>
          <p className="text-muted-foreground font-medium">Conciliación bancaria y generación de IPV</p>
        </div>

        <div className="flex gap-2">
            <Button variant="outline" className="neu-btn" onClick={() => setActiveTab('rules')}>
                <Settings className="w-4 h-4 mr-2" />
                Reglas
            </Button>
            <Button onClick={handleRunMatching} className="neu-btn-primary">
                <Play className="w-4 h-4 mr-2" />
                Ejecutar Matching
            </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
            title="Total Transacciones"
            value={stats.total}
            icon={<History className="text-blue-500" />}
        />
        <StatCard
            title="Completadas"
            value={stats.completed}
            icon={<CheckCircle2 className="text-green-500" />}
            trend={`${((stats.completed / (stats.total || 1)) * 100).toFixed(1)}%`}
        />
        <StatCard
            title="Pendientes"
            value={stats.pending}
            icon={<Clock className="text-orange-500" />}
        />
        <StatCard
            title="Parciales"
            value={stats.partial}
            icon={<AlertCircle className="text-yellow-500" />}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="transactions">Transacciones</TabsTrigger>
          <TabsTrigger value="ingestion">Ingesta</TabsTrigger>
          <TabsTrigger value="reports">Reportes IPV</TabsTrigger>
          <TabsTrigger value="adjustments">Ajustes</TabsTrigger>
          <TabsTrigger value="rules">Reglas</TabsTrigger>
        </TabsList>

        <Card className="mt-6 p-0 overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur-sm">
          <TabsContent value="transactions" className="m-0">
            <TransactionTable transactions={transactions || []} />
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
        </Card>
      </Tabs>
    </div>
  );
}

function StatCard({ title, value, icon, trend }: { title: string, value: number, icon: React.ReactNode, trend?: string }) {
  return (
    <Card className="p-4 flex items-center justify-between border-none shadow-md bg-card/50 backdrop-blur-sm">
      <div className="space-y-1">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
        <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-black">{value}</h3>
            {trend && <span className="text-[10px] font-bold text-green-500">{trend}</span>}
        </div>
      </div>
      <div className="p-3 bg-background rounded-2xl shadow-inner">
        {icon}
      </div>
    </Card>
  );
}
