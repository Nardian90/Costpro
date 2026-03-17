'use client';

import React from 'react';
import { LayoutGrid, ShieldCheck, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ViewNavigation: React.FC = () => {
  const views = [
    { id: 'DASHBOARD', desc: 'Tablero principal con indicadores clave de rendimiento (KPIs), ventas del día y estado...' },
    { id: 'COST-SHEETS', desc: 'Gestión de fichas de costo para productos procesados y servicios.' },
    { id: 'IPV', desc: 'Índice de precios de venta (IPV) y reportes de transferencias bancarias.' },
    { id: 'POS', desc: 'Punto de venta para realizar facturación y ventas directas.' },
    { id: 'INVENTORY', desc: 'Control de existencias y niveles de stock por almacén.' },
    { id: 'SETTINGS', desc: 'Configuración general del sistema, empresa y preferencias de usuario.' },
    { id: 'REPORTS', desc: 'Generación de reportes avanzados y analítica de datos.' },
    { id: 'AUDIT', desc: 'Logs de auditoría y rastreo de acciones de usuarios en el sistema.' }
  ];

  return (
    <section className="bg-card/30 p-8 rounded-[40px] border border-border/50">
       <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <LayoutGrid className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-black uppercase tracking-widest">Navegación de Vistas</h2>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span className="text-[9px] font-black text-emerald-500 uppercase">Vistas Validadas por Auditor</span>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {views.map(v => (
            <div key={v.id} className="p-5 rounded-[24px] bg-background/50 border border-border/50 hover:border-primary/30 transition-all cursor-pointer group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black text-primary tracking-widest">{v.id}</span>
                <ChevronRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed line-clamp-2">
                {v.desc}
              </p>
            </div>
          ))}
       </div>
    </section>
  );
};
