'use client';

import React from 'react';
import { Lock, ShieldAlert, Eye, Key, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SecurityMetricsProps {
  metrics: {
    failed_logins_last_hour: number;
    rbac_alerts: number;
    rls_violations: number;
    active_threats: number;
  };
}

export const SecurityMetrics: React.FC<SecurityMetricsProps> = ({ metrics }) => {
  return (
    <div className="space-y-6 bg-card/50 p-6 rounded-[32px] border border-border/50">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-rose-500" />
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Seguridad & GRC</h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black text-rose-500 bg-rose-500/5 px-2 py-1 rounded-md border border-rose-500/10">
          <ShieldCheck className="w-3 h-3" />
          SOC 2 COMPLIANT
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* RLS Monitoring */}
        <div className={cn(
          "p-5 rounded-2xl border flex items-center justify-between transition-all",
          metrics.rls_violations === 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/30"
        )}>
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shadow-inner",
              metrics.rls_violations === 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/20 text-rose-500"
            )}>
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Políticas RLS (Supabase)</div>
              <div className="text-xs font-black uppercase tracking-tight">{metrics.rls_violations === 0 ? "Protección Íntegra" : "Vulnerabilidades RLS"}</div>
            </div>
          </div>
          {metrics.rls_violations > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-1 rounded-md">{metrics.rls_violations}</span>
          )}
        </div>

        {/* Threat Level */}
        <div className="p-4 rounded-2xl bg-background/50 border border-border/50 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amenazas Activas</span>
           </div>
           <span className="text-sm font-black text-foreground">{metrics.active_threats}</span>
        </div>

        {/* Access Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-background/50 border border-border/50 flex flex-col items-center justify-center text-center gap-2 hover:bg-background transition-colors group">
            <Key className="w-4 h-4 text-primary opacity-50 group-hover:scale-110 transition-transform" />
            <div className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground">Logins Fallidos (1h)</div>
            <div className="text-lg font-black">{metrics.failed_logins_last_hour}</div>
          </div>
          <div className="p-4 rounded-2xl bg-background/50 border border-border/50 flex flex-col items-center justify-center text-center gap-2 hover:bg-background transition-colors group">
            <Eye className="w-4 h-4 text-blue-500 opacity-50 group-hover:scale-110 transition-transform" />
            <div className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground">Auditoría RBAC</div>
            <div className="text-lg font-black">{metrics.rbac_alerts}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
