'use client';

import React from 'react';
import { Database, RefreshCw, BarChart3 } from 'lucide-react';

interface ApplicationDataPanelProps {
  throughput: number;
  recon: number;
}

export const ApplicationDataPanel: React.FC<ApplicationDataPanelProps> = ({ throughput, recon }) => {
  return (
    <section className="bg-card/30 p-8 rounded-[40px] border border-border/50 h-full">
      <div className="flex items-center gap-3 mb-8">
        <Database className="w-5 h-5 text-emerald-500" />
        <h2 className="text-sm font-black uppercase tracking-widest">Aplicación & Datos</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center">
          <div className="text-[10px] font-black uppercase text-emerald-500 mb-1">Sincronización</div>
          <div className="text-xs font-black uppercase tracking-widest">OK</div>
        </div>
        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-center">
          <div className="text-[10px] font-black uppercase text-emerald-500 mb-1">Integridad DB</div>
          <div className="text-xs font-black uppercase tracking-widest">PASSED</div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <div className="text-[10px] font-black uppercase opacity-50 mb-2">Throughput Transaccional</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black">{throughput}</span>
            <span className="text-[10px] font-black opacity-30 uppercase">TX / MIN</span>
          </div>
        </div>

        <div>
          <div className="text-[10px] font-black uppercase opacity-50 mb-2">Health Recon</div>
          <div className="text-2xl font-black text-emerald-500">{recon}%</div>
        </div>

        <div className="h-24 flex items-end gap-1 px-2">
           {[40, 70, 45, 90, 65, 80, 50, 85].map((h, i) => (
             <div key={i} className="flex-1 bg-primary/20 rounded-t-sm" style={{ height: `${h}%` }} />
           ))}
        </div>
      </div>
    </section>
  );
};
