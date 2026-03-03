'use client';

import React from 'react';
import { Target, CheckCircle2, XCircle, TrendingUp, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReleaseGateStatusProps {
  mri: {
    score: number;
    status: string;
    hardStops: any[];
  };
}

export const ReleaseGateStatus: React.FC<ReleaseGateStatusProps> = ({ mri }) => {
  return (
    <div className="space-y-6 bg-card/50 p-6 rounded-[32px] border border-border/50">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Release Gate Governance</h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black text-primary bg-primary/5 px-2 py-1 rounded-md border border-primary/10">
          <TrendingUp className="w-3 h-3" />
          MRI {mri.score}/10
        </div>
      </div>

      <div className="space-y-4">
        {/* Score Overview */}
        <div className="flex items-center gap-6 p-5 rounded-2xl bg-primary/5 border border-primary/20 relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
             <ShieldAlert className="w-20 h-20 text-primary" />
          </div>
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary flex items-center justify-center relative shrink-0">
             <span className="text-xl font-black text-primary">{mri.score}</span>
          </div>
          <div className="relative z-10">
            <div className="text-xs font-black uppercase tracking-widest text-primary mb-1">Status: {mri.status}</div>
            <p className="text-[10px] text-muted-foreground leading-relaxed uppercase font-black opacity-60">
              Criterio de Liberación Empresarial (MRI &gt; 8.5)
            </p>
          </div>
        </div>

        {/* Hard Stops List */}
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-50 mb-3 ml-2">Hard Stops de Auditoría</div>
          {mri.hardStops.map((hs) => (
            <div key={hs.id} className="flex items-center justify-between p-3.5 rounded-xl bg-background/50 border border-border/30 hover:border-primary/20 transition-colors group">
              <span className="text-[11px] font-bold uppercase tracking-tight opacity-70 group-hover:opacity-100 transition-opacity">{hs.name}</span>
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center",
                hs.passed ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              )}>
                {hs.passed ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
