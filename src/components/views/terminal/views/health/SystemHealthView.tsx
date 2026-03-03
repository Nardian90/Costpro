'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, RefreshCw, AlertCircle, FileText,
  Settings, Clock, ShieldCheck, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { HealthStatusHeader } from './HealthStatusHeader';
import { InfrastructureMetrics } from './InfrastructureMetrics';
import { ApplicationMetrics } from './ApplicationMetrics';
import { SecurityMetrics } from './SecurityMetrics';
import { ReleaseGateStatus } from './ReleaseGateStatus';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { ReleaseGatePdfExporter } from '@/lib/release-gate/ReleaseGatePdfExporter';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function SystemHealthView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [pollingInterval, setPollingInterval] = useState(30000); // Default 30s

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/system-health');
      const json = await res.json();
      setData(json);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching health:', error);
      toast.error('Error al conectar con el motor de observabilidad');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    if (pollingInterval > 0) {
      const interval = setInterval(fetchHealth, pollingInterval);
      return () => clearInterval(interval);
    }
  }, [pollingInterval]);

  if (loading || !data) {
    return (
      <div className="h-[60vh] w-full flex flex-col items-center justify-center">
        <CostProLoader size={200} text="OBSERVABILIDAD" subtext="Escaneando salud del sistema..." />
      </div>
    );
  }

  const { shi, mri, timestamp, version } = data;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Top Banner */}
      <HealthStatusHeader
        score={shi.score}
        status={shi.status}
        version={version}
      />

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-card border border-border/50 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Frecuencia de Escaneo:</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:opacity-80 transition-opacity">
                {pollingInterval === 0 ? 'Manual' : `${pollingInterval/1000}s`}
                <ChevronDown className="w-3 h-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-sidebar/90 backdrop-blur-xl border-primary/10 rounded-xl">
                <DropdownMenuItem onClick={() => setPollingInterval(30000)} className="text-[10px] font-black uppercase tracking-widest">30 Segundos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPollingInterval(60000)} className="text-[10px] font-black uppercase tracking-widest">60 Segundos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPollingInterval(0)} className="text-[10px] font-black uppercase tracking-widest">Manual / Pausado</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">
          Entorno: {data.environment.toUpperCase()} | Engine: 10/10 Enterprise Readiness
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <InfrastructureMetrics metrics={shi.metrics} trends={shi.trends} />
          <ApplicationMetrics metrics={shi.metrics} trends={shi.trends} />
        </div>

        <div className="space-y-8">
          <SecurityMetrics metrics={shi.metrics} />
          <ReleaseGateStatus mri={mri} />
        </div>
      </div>

      {/* Footer Info & Alerts */}
      <footer className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 bg-card/30 p-6 rounded-[32px] border border-border/50 min-h-[160px] relative overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Consola de Inteligencia & Alertas
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground bg-background/50 px-2 py-1 rounded-md border border-border/30">
              LIVE SCAN: {lastUpdate.toLocaleTimeString()}
            </span>
          </div>

          <div className="space-y-3 relative z-10">
            {shi.alerts.length > 0 ? (
              shi.alerts.map((alert: any) => (
                <div key={alert.id} className={cn(
                  "flex items-center gap-4 p-4 rounded-2xl border transition-all hover:scale-[1.01]",
                  alert.level === 'error' ? "bg-rose-500/5 border-rose-500/20 text-rose-500" :
                  alert.level === 'warn' ? "bg-amber-500/5 border-amber-500/20 text-amber-600" :
                  "bg-blue-500/5 border-blue-500/20 text-blue-500"
                )}>
                   <div className={cn(
                     "w-2 h-2 rounded-full",
                     alert.level === 'error' ? "bg-rose-500 animate-pulse" :
                     alert.level === 'warn' ? "bg-amber-500" : "bg-blue-500"
                   )} />
                   <div className="flex-1">
                     <div className="text-[11px] font-black uppercase tracking-tight">{alert.message}</div>
                     <div className="text-[9px] opacity-50 font-bold uppercase">{new Date(alert.timestamp).toLocaleTimeString()}</div>
                   </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 opacity-40">
                <ShieldCheck className="w-10 h-10 text-emerald-500 mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest">Sistemas en parámetros nominales</p>
              </div>
            )}
          </div>
        </div>

        {/* Executive Quick Actions */}
        <div className="w-full md:w-80 grid grid-cols-2 gap-4">
          <button
            onClick={() => ReleaseGatePdfExporter.exportHealthReport(data)}
            className="flex flex-col items-center justify-center p-6 rounded-[28px] bg-primary text-white shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all group min-h-[140px]"
          >
            <FileText className="w-7 h-7 mb-3 group-hover:rotate-6 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Exportar PDF</span>
          </button>
          <button
            onClick={() => { setLoading(true); fetchHealth(); }}
            className="flex flex-col items-center justify-center p-6 rounded-[28px] bg-card/80 border-2 border-border/50 hover:bg-card hover:border-primary/30 active:scale-95 transition-all group min-h-[140px]"
          >
            <RefreshCw className="w-7 h-7 mb-3 text-muted-foreground group-hover:rotate-180 transition-transform duration-700" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sincronizar</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
