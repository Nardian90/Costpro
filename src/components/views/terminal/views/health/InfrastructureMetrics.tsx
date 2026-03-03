'use client';

import React from 'react';
import { Server, Cpu, Database, Wifi, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface InfrastructureMetricsProps {
  metrics: {
    uptime: number;
    latency_p95: number;
    cpu_usage: number;
    memory_usage: number;
  };
  trends: any[];
}

export const InfrastructureMetrics: React.FC<InfrastructureMetricsProps> = ({ metrics, trends }) => {
  return (
    <div className="space-y-6 bg-card/50 p-6 rounded-[32px] border border-border/50">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Infraestructura</h3>
        </div>
        <div className="flex items-center gap-2">
           <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
           <span className="text-[10px] font-black text-muted-foreground uppercase">Cloud Native - Optimizada</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Uptime & CPU */}
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-background/50 border border-border/50 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Uptime (SLA)</span>
              </div>
              <span className="text-lg font-black text-emerald-500">{metrics.uptime}%</span>
            </div>
            <Progress value={metrics.uptime} className="h-1.5 bg-emerald-500/10" indicatorClassName="bg-emerald-500" />
          </div>

          <div className="p-4 rounded-2xl bg-background/50 border border-border/50 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Carga CPU</span>
              </div>
              <span className="text-lg font-black text-blue-500">{metrics.cpu_usage}%</span>
            </div>
            <Progress value={metrics.cpu_usage} className="h-1.5 bg-blue-500/10" indicatorClassName="bg-blue-500" />
          </div>
        </div>

        {/* Chart Section */}
        <div className="p-4 rounded-2xl bg-background/50 border border-border/50 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tendencia Latencia (24h)</span>
          </div>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="latency"
                  stroke="var(--primary)"
                  fillOpacity={1}
                  fill="url(#colorLatency)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between items-end mt-2">
            <span className="text-[9px] font-bold opacity-30 uppercase tracking-tighter">Promedio: 112ms</span>
            <span className="text-[11px] font-black text-primary uppercase">P95 Stable</span>
          </div>
        </div>
      </div>
    </div>
  );
};
