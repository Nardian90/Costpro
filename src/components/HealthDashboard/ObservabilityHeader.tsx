'use client';

import React from 'react';
import { ShieldCheck, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ObservabilityHeaderProps {
  score: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  version: string;
  scanFrequency: string;
  setScanFrequency: (f: string) => void;
}

export const ObservabilityHeader: React.FC<ObservabilityHeaderProps> = ({
  score, status, version, scanFrequency, setScanFrequency
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'HEALTHY': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case 'DEGRADED': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'CRITICAL': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
    }
  };

  return (
    <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-card/50 p-8 rounded-[40px] border border-border/50 relative overflow-hidden backdrop-blur-2xl">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-6 relative z-10">
        <div className={cn(
          "w-20 h-20 rounded-[28px] flex items-center justify-center shadow-2xl border-2 transition-all",
          getStatusColor()
        )}>
          {status === 'HEALTHY' ? <CheckCircle2 className="w-8 h-8" /> : <ShieldCheck className="w-8 h-8" />}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black uppercase tracking-tighter">Observability</h1>
            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase border border-primary/20">
              {version}
            </span>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[9px] font-black text-emerald-500 uppercase">HEALTHY</span>
            </div>
          </div>
          <p className="text-muted-foreground font-black uppercase text-[10px] tracking-[0.3em] flex items-center gap-2 opacity-60">
            <Activity className="w-3 h-3 text-primary animate-pulse" />
            ENGINE STATUS: ACTIVE | REGION: US-EAST-1
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8 lg:gap-12 relative z-10">
        <div className="flex flex-col items-start sm:items-end">
          <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-50">Health Index Score</div>
          <div className="flex items-baseline gap-1">
            <span className={cn(
              "text-6xl font-black tracking-tighter transition-colors",
              score >= 90 ? "text-emerald-500" : (score >= 70 ? "text-amber-500" : "text-rose-500")
            )}>{score}</span>
            <span className="text-2xl font-black text-muted-foreground/20">/100</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
           <div className={cn(
            "px-8 py-3 rounded-[20px] border-2 flex flex-col items-center justify-center min-w-[140px]",
            getStatusColor()
          )}>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">SLA Status</span>
            <span className="text-sm font-black uppercase tracking-tighter">{status}</span>
          </div>
          <select
            value={scanFrequency}
            onChange={(e) => setScanFrequency(e.target.value)}
            className="bg-background/50 border border-border/50 text-[10px] font-black uppercase rounded-full px-4 py-1.5 focus:outline-none"
          >
            <option value="30S">Scan: 30S</option>
            <option value="60S">Scan: 60S</option>
            <option value="5M">Scan: 5M</option>
          </select>
        </div>
      </div>
    </header>
  );
};
