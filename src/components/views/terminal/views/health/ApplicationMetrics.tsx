'use client';

import React from 'react';
import { Layout, RefreshCw, AlertCircle, BarChart3, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts';

interface ApplicationMetricsProps {
  metrics: {
    transactions_per_minute: number;
    sync_status: 'ok' | 'degraded' | 'offline' | 'syncing';
    active_critical_errors: number;
    reconciliation_health: number;
    db_integrity_check: string;
  };
  trends: any[];
}

export const ApplicationMetrics: React.FC<ApplicationMetricsProps> = ({ metrics, trends }) => {
  return (
    <div className="space-y-6 bg-card/50 p-6 rounded-[32px] border border-border/50">
      <div className="flex items-center gap-3 px-2">
        <Layout className="w-5 h-5 text-blue-500" />
        <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Aplicación & Datos</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Core Stats */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-4">
             <div className="p-4 rounded-2xl bg-background/50 border border-border/50">
               <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-50">Sincronización</div>
               <div className="flex items-center gap-2">
                 <div className={cn(
                   "w-2 h-2 rounded-full",
                   metrics.sync_status === 'ok' ? "bg-emerald-500" : "bg-amber-500"
                 )} />
                 <span className="text-xs font-black uppercase">{metrics.sync_status}</span>
               </div>
             </div>
             <div className="p-4 rounded-2xl bg-background/50 border border-border/50">
               <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-50">Integridad DB</div>
               <div className="flex items-center gap-2">
                 <Database className="w-3.5 h-3.5 text-emerald-500" />
                 <span className="text-xs font-black uppercase">{metrics.db_integrity_check.toUpperCase()}</span>
               </div>
             </div>
          </div>

          <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-between">
            <div>
              <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Throughput Transaccional</div>
              <div className="text-2xl font-black text-foreground">{metrics.transactions_per_minute} <span className="text-xs font-bold opacity-30">TX/MIN</span></div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest text-emerald-500/70">Health Recon</div>
              <div className="text-xl font-black text-emerald-500">{metrics.reconciliation_health}%</div>
            </div>
          </div>
        </div>

        {/* Mini Throughput Chart */}
        <div className="p-4 rounded-2xl bg-background/50 border border-border/50 flex flex-col">
          <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 opacity-50">Carga Horaria</div>
          <div className="flex-1 min-h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends}>
                <Bar dataKey="score" fill="var(--primary)" radius={[2, 2, 0, 0]} opacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
