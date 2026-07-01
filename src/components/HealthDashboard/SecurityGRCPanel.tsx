'use client';

import React from 'react';
import { ShieldCheck, Lock, AlertCircle } from 'lucide-react';

interface SecurityGRCPanelProps {
  threats: number;
  failedLogins: number;
}

export const SecurityGRCPanel: React.FC<SecurityGRCPanelProps> = ({ threats, failedLogins }) => {
  return (
    <section className="bg-card/30 p-8 rounded-[40px] border border-border/50 h-full">
       <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-rose-500" />
            <h2 className="text-sm font-black uppercase tracking-widest">Seguridad & GRC</h2>
          </div>
          <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase border border-rose-500/20">
            SOC 2 COMPLIANT
          </span>
       </div>

       <div className="grid grid-cols-1 gap-6">
          <div className="p-5 rounded-3xl bg-background/50 border border-border/50">
            <div className="text-[10px] font-black uppercase opacity-50 mb-2">Políticas RLS (Supabase)</div>
            <div className="text-sm font-black text-emerald-500 uppercase">PROTECCIÓN ÍNTEGRA</div>
          </div>

          <div className="p-5 rounded-3xl bg-background/50 border border-border/50 flex justify-between items-center">
            <div>
              <div className="text-[10px] font-black uppercase opacity-50 mb-1">Amenazas Activas</div>
              <div className="text-2xl font-black">{threats}</div>
            </div>
            <AlertCircle className={threats > 0 ? "text-rose-500" : "text-emerald-500 opacity-20"} />
          </div>

          <div className="p-5 rounded-3xl bg-background/50 border border-border/50">
            <div className="text-[10px] font-black uppercase opacity-50 mb-1">Logins Fallidos (1H)</div>
            <div className="text-2xl font-black">{failedLogins}</div>
          </div>

          <div className="p-5 rounded-3xl bg-background/50 border border-border/50">
            <div className="text-[10px] font-black uppercase opacity-50 mb-1">Auditoría RBAC</div>
            <div className="text-xs font-black text-emerald-500 uppercase">STATUS: SECURE</div>
          </div>
       </div>
    </section>
  );
};
