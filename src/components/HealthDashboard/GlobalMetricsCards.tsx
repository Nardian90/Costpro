'use client';

import React from 'react';
import { Layout, ShieldAlert, History, Share2 } from 'lucide-react';

interface GlobalMetricsCardsProps {
  archHealth: number;
  vistasAuditadas: number;
  alertasAuditor: number;
  ultimaAuditoria: string;
}

export const GlobalMetricsCards: React.FC<GlobalMetricsCardsProps> = ({
  archHealth, vistasAuditadas, alertasAuditor, ultimaAuditoria
}) => {
  const cards = [
    { title: 'Global Architecture Health', value: archHealth.toFixed(1), sub: '-', detail: '', icon: Share2, color: 'text-primary' },
    { title: 'Vistas Auditadas', value: vistasAuditadas, sub: '100% COBERTURA', detail: '', icon: Layout, color: 'text-emerald-500' },
    { title: 'Alertas de Auditor', value: alertasAuditor, sub: 'REVISIONES SUGERIDAS', detail: '', icon: ShieldAlert, color: 'text-amber-500' },
    { title: 'Última Auditoría', value: ultimaAuditoria, sub: 'AUDIT AGENT SCRIPT', detail: '', icon: History, color: 'text-muted-foreground' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map((card, idx) => (
        <div key={idx} className="bg-card/30 p-6 rounded-2xl border border-border/50 hover:border-primary/30 transition-all flex items-center gap-6">
          <div className="w-12 h-12 rounded-2xl bg-background/50 flex items-center justify-center border border-border/50 shadow-sm">
            <card.icon className={card.color} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-60 mb-1">{card.title}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight">{card.value}</span>
              <span className="text-[9px] font-bold text-muted-foreground uppercase">{card.sub}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
