'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Activity, AlertTriangle, CheckCircle2, Server } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HealthStatusHeaderProps {
  score: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  version: string;
}

export const HealthStatusHeader: React.FC<HealthStatusHeaderProps> = ({ score, status, version }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'HEALTHY': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case 'DEGRADED': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'CRITICAL': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'HEALTHY': return <CheckCircle2 className="w-7 h-7" />;
      case 'DEGRADED': return <AlertTriangle className="w-7 h-7" />;
      case 'CRITICAL': return <Shield className="w-7 h-7" />;
    }
  };

  return (
    <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-card/50 p-8 rounded-[40px] border border-border/50 relative overflow-hidden backdrop-blur-2xl shadow-2xl">
      {/* Background Glow */}
      <div className={cn(
        "absolute -right-20 -top-20 w-80 h-80 blur-[120px] opacity-20 rounded-full transition-colors duration-1000",
        status === 'HEALTHY' ? "bg-emerald-500" : (status === 'DEGRADED' ? "bg-amber-500" : "bg-rose-500")
      )} />

      <div className="flex flex-col md:flex-row items-start md:items-center gap-6 relative z-10">
        <div className={cn(
          "w-20 h-20 rounded-[28px] flex items-center justify-center shadow-2xl border-2 transition-all duration-500",
          getStatusColor()
        )}>
          {getStatusIcon()}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter">Observability</h1>
            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em] border border-primary/20">
              v{version}
            </span>
          </div>
          <p className="text-muted-foreground font-black uppercase text-[10px] tracking-[0.3em] flex items-center gap-2 opacity-60">
            <Activity className="w-3 h-3 text-primary animate-pulse" />
            Real-time Systems Intelligence
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8 lg:gap-12 relative z-10">
        <div className="flex flex-col items-start sm:items-end">
          <div className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1 opacity-50">Health Index Score</div>
          <div className="flex items-baseline gap-1">
            <span className={cn(
              "text-6xl font-black tracking-tighter transition-colors duration-500",
              score >= 90 ? "text-emerald-500" : (score >= 70 ? "text-amber-500" : "text-rose-500")
            )}>{score}</span>
            <span className="text-2xl font-black text-muted-foreground/20">/100</span>
          </div>
        </div>

        <div className={cn(
          "px-8 py-5 rounded-[24px] border-2 flex flex-col items-center justify-center min-w-[180px] shadow-lg",
          getStatusColor()
        )}>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">SLA Status</span>
          <span className="text-lg font-black uppercase tracking-tighter mt-1">{status}</span>
        </div>
      </div>
    </header>
  );
};
