'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { VIEW_REGISTRY } from '@/config/viewRegistry';
import { useUIStore, ViewType } from '@/store';
import { LayoutGrid, ArrowRight, ShieldCheck } from 'lucide-react';

export function ViewNavigator() {
  const { setCurrentView } = useUIStore();
  const [auditedViews, setAuditedViews] = useState<string[]>([]);

  useEffect(() => {
    fetch('/system_architecture.json')
      .then(res => res.json())
      .then(json => {
        const views = json.architecture
          .filter((item: any) => item.type === 'view')
          .map((item: any) => item.id.toLowerCase());
        setAuditedViews(views);
      })
      .catch(err => console.error('Error loading audited views:', err));
  }, []);

  // Filter key views for navigation, prioritizing audited ones
  const keyViews = VIEW_REGISTRY.filter(v =>
    ['dashboard', 'cost-sheets', 'ipv', 'pos', 'inventory', 'reports', 'audit', 'settings'].includes(v.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <LayoutGrid className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Navegación de Vistas</h3>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <ShieldCheck className="w-3 h-3 text-emerald-500" />
          <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Vistas Validadas por Auditor</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {keyViews.map((view, idx) => {
          const isAudited = auditedViews.includes(view.id.toLowerCase()) ||
                           auditedViews.some(av => av.includes(view.id.toLowerCase().replace('-', '')));

          return (
            <motion.button
              key={view.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => setCurrentView(view.id as ViewType)}
              className="group flex flex-col p-4 rounded-2xl bg-card/30 border border-border/50 hover:border-primary/40 hover:bg-card/50 transition-all text-left relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <ArrowRight className="w-3 h-3 text-primary" />
              </div>

              <div className="flex items-center gap-2 mb-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-primary truncate">
                  {view.id}
                </div>
                {isAudited && (
                  <div title="Validada por Auditoría" className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                )}
              </div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase leading-tight line-clamp-2">
                {view.description}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
