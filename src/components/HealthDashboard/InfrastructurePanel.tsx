'use client';

import React from 'react';
import { Activity, Cpu, Wifi } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';

interface InfrastructurePanelProps {
  uptime: number;
  cpu: number;
  trends: any[];
}

export const InfrastructurePanel: React.FC<InfrastructurePanelProps> = ({ uptime, cpu, trends }) => {
  return (
    <section className="bg-card/30 p-8 rounded-[40px] border border-border/50">
       <div className="flex items-center gap-3 mb-8">
          <Activity className="w-5 h-5 text-blue-500" />
          <h2 className="text-sm font-black uppercase tracking-widest">Infraestructura</h2>
       </div>

       <div className="space-y-8">
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Uptime (SLA)</span>
              <span className="text-xs font-black text-emerald-500">{uptime}%</span>
            </div>
            <div className="h-2 w-full bg-background rounded-full overflow-hidden">
               <div className="h-full bg-emerald-500" style={{ width: `${uptime}%` }} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Carga CPU</span>
              <span className="text-xs font-black text-blue-500">{cpu}%</span>
            </div>
            <div className="h-2 w-full bg-background rounded-full overflow-hidden">
               <div className="h-full bg-blue-500" style={{ width: `${cpu}%` }} />
            </div>
          </div>

          <div className="pt-4">
            <div className="flex justify-between mb-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-50">Tendencia Latencia (24H)</div>
                <div className="text-lg font-black tracking-tighter">Promedio: 112MS</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black uppercase text-emerald-500">P95: STABLE</div>
                <div className="text-[9px] font-bold opacity-40 uppercase">CLOUD NATIVE - OPTIMIZADA</div>
              </div>
            </div>
            <div className="h-32 w-full">
               <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trends}>
                    <Line type="monotone" dataKey="latency" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
               </ResponsiveContainer>
            </div>
          </div>
       </div>
    </section>
  );
};
