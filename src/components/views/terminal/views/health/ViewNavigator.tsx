'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { VIEW_REGISTRY } from '@/config/viewRegistry';
import { useUIStore, ViewType } from '@/store';
import { LayoutGrid, ArrowRight } from 'lucide-react';

export function ViewNavigator() {
  const { setCurrentView } = useUIStore();

  // Filter key views for navigation
  const keyViews = VIEW_REGISTRY.filter(v =>
    ['dashboard', 'cost-sheets', 'ipv', 'pos', 'inventory', 'reports', 'audit', 'settings'].includes(v.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 px-2">
        <LayoutGrid className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Navegación de Vistas</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {keyViews.map((view, idx) => (
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

            <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-1 truncate">
              {view.id}
            </div>
            <div className="text-[9px] font-bold text-muted-foreground uppercase leading-tight line-clamp-2">
              {view.description}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
