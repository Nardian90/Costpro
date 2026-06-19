'use client';

import React from 'react';
import { cn, formatDate } from '@/lib/utils';
import type { CostSheetHeader as CostSheetHeaderType } from '@/types/cost-sheet';

type CostSheetHeaderProps = {
  header: Partial<CostSheetHeaderType>;
};

const CostSheetHeader: React.FC<CostSheetHeaderProps> = ({ header }) => {
  return (
    <div className="space-y-6">
      {/* Formal Government Headers */}
      <div className="text-center space-y-1 mb-8">
        <h2 className="text-sm font-black tracking-[0.25em] text-slate-900 dark:text-foreground uppercase">
          MINISTERIO DE FINANZAS Y PRECIOS
        </h2>
        <h3 className="text-xs font-bold tracking-widest text-muted-foreground dark:text-muted-foreground uppercase">
          FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS
        </h3>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          PARA LA EVALUACIÓN DE PRECIOS Y TARIFAS
        </p>
      </div>

      <div className="bg-white/50 dark:bg-slate-900/50 p-6 rounded-[2rem] border border-slate-200 dark:border-primary/20 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col gap-6">
          <div className="border-b border-slate-200 dark:border-primary/10 pb-4">
            <span className="text-[clamp(0.6rem,2vw,0.75rem)] font-black uppercase tracking-[0.3em] text-primary block mb-2 px-1">
              Datos generales de la Ficha de Costo (FC)
            </span>
            <h1 className="text-[clamp(1.5rem,6vw,2.5rem)] font-black text-slate-900 dark:text-foreground leading-tight uppercase tracking-tight">
              {header.name || 'Sin nombre'}
            </h1>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-6 overflow-x-auto no-scrollbar">
            {[
              { label: 'No. FC', value: header.code },
              { label: 'Cod. Producto', value: header.product_code },
              { label: 'Fecha', value: formatDate(header.date) },
              { label: 'UM', value: header.unit },
              { label: 'Cantidad', value: header.quantity },
              { label: 'Moneda', value: header.currency },
              { label: 'EMPRESA', value: header.company },
              { label: 'ORGANISMO', value: header.organism },
              { label: 'Nivel de Producción', value: header.production_level },
              { label: '% Utilización Capacidad', value: header.capacity_utilization ? `${header.capacity_utilization}%` : 'N/A' },
              { label: 'Precio de Venta', value: header.sale_price, highlight: true },
            ].map((item, idx) => (
              <div key={idx} className={cn("space-y-1", item.highlight && "col-span-1 sm:col-span-2 lg:col-span-1")}>
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground block">
                  {item.label}
                </span>
                <div className={cn(
                  "font-bold text-sm",
                  item.highlight ? "text-primary font-black" : "text-slate-700 dark:text-slate-300"
                )}>
                  {item.value || 'N/A'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CostSheetHeader;
