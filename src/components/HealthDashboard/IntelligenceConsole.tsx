'use client';

import React from 'react';
import { AlertCircle, FileText, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntelligenceConsoleProps {
  timestamp: Date;
  alerts: any[];
  onSync: () => void;
  onExport: () => void;
}

export const IntelligenceConsole: React.FC<IntelligenceConsoleProps> = ({
  timestamp, alerts, onSync, onExport
}) => {
  return (
    <footer className="flex flex-col xl:flex-row gap-6">
      <div className="flex-1 bg-card/30 p-8 rounded-[40px] border border-border/50 relative overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            Consola de Inteligencia & Alertas
          </h3>
          <span className="text-[11px] font-mono text-muted-foreground bg-background/50 px-3 py-1.5 rounded-xl border border-border/30">
            LIVE SCAN: {timestamp.toLocaleTimeString()}
          </span>
        </div>

        <div className="space-y-3">
          {alerts.map((alert, idx) => (
            <div key={idx} className={cn(
              "flex items-center gap-4 p-5 rounded-2xl border transition-all",
              alert.level === 'error' ? "bg-rose-500/5 border-rose-500/20 text-rose-500" :
              alert.level === 'warn' ? "bg-amber-500/5 border-amber-500/20 text-amber-600" :
              "bg-blue-500/5 border-blue-500/20 text-blue-500"
            )}>
               <div className="flex items-center gap-2">
                 <div className={cn(
                   "w-2 h-2 rounded-full",
                   alert.level === 'error' ? "bg-rose-500 animate-pulse" :
                   alert.level === 'warn' ? "bg-amber-500" : "bg-blue-500"
                 )} />
                 <span className="text-[9px] font-black uppercase tracking-widest opacity-60">
                   {alert.level === 'error' ? 'Error' : alert.level === 'warn' ? 'Advertencia' : 'Info'}
                 </span>
               </div>
               <div className="flex-1">
                 <div className="text-xs font-black uppercase tracking-tight">{alert.message}</div>
                 <div className="text-[9px] opacity-50 font-bold uppercase">{alert.timestamp}</div>
               </div>
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="py-10 text-center opacity-30">
               <p className="text-[10px] font-black uppercase tracking-widest">SISTEMAS EN PARÁMETROS NOMINALES</p>
            </div>
          )}
        </div>
      </div>

      <div className="w-full xl:w-96 grid grid-cols-2 gap-4">
        <button
          onClick={onExport}
          className="flex flex-col items-center justify-center p-8 rounded-[40px] bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all group"
        >
          <FileText className="w-8 h-8 mb-4 group-hover:rotate-6 transition-transform" />
          <span className="text-[11px] font-black uppercase tracking-widest">Exportar PDF</span>
        </button>
        <button
          onClick={onSync}
          className="flex flex-col items-center justify-center p-8 rounded-[40px] bg-card/80 border-2 border-border/50 hover:border-primary/50 transition-all group"
        >
          <RefreshCw className="w-8 h-8 mb-4 text-muted-foreground group-hover:rotate-180 transition-transform duration-700" />
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Sincronizar</span>
        </button>
      </div>
    </footer>
  );
};
