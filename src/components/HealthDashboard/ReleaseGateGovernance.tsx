'use client';

import React from 'react';
import { Target, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReleaseGateGovernanceProps {
  mri: number;
  status: string;
  hardStops: any[];
}

export const ReleaseGateGovernance: React.FC<ReleaseGateGovernanceProps> = ({ mri, status, hardStops }) => {
  return (
    <section className="bg-card/30 p-8 rounded-[40px] border border-border/50 h-full">
       <div className="flex items-center justify-between mb-8">
          <h2 className="text-sm font-black uppercase tracking-widest">Release Gate Governance</h2>
          <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase border border-primary/20">
            MRI {mri.toFixed(1)}/10
          </span>
       </div>

       <div className="flex items-center gap-8 mb-10">
          <div className="relative w-24 h-24">
             <svg className="w-full h-full -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted/10" />
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                        strokeDasharray={251.2}
                        strokeDashoffset={251.2 * (1 - mri/10)}
                        className="text-primary" />
             </svg>
             <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-black">{mri.toFixed(1)}</span>
             </div>
          </div>
          <div>
             <div className="text-lg font-black text-emerald-500 uppercase tracking-tighter">{status}</div>
             <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">
               CRITERIO DE LIBERACIÓN EMPRESARIAL (MRI &gt; 8.5)
             </p>
          </div>
       </div>

       <div className="space-y-3">
          <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 opacity-50">Hard Stops de Auditoría</h3>
          {hardStops.map(hs => (
            <div key={hs.id} className="flex items-center justify-between p-4 rounded-2xl bg-background/50 border border-border/50">
               <span className="text-[11px] font-bold uppercase tracking-tight">{hs.name}</span>
               {hs.passed ? (
                 <CheckCircle2 className="w-4 h-4 text-emerald-500" />
               ) : (
                 <XCircle className="w-4 h-4 text-rose-500" />
               )}
            </div>
          ))}
       </div>
    </section>
  );
};
