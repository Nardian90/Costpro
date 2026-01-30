'use client';

import React from 'react';
import { cn, formatDate } from '@/lib/utils';

type CostSheetHeaderProps = {
  header: {
    code: string;
    name: string;
    date: string;
    unit: string;
    quantity: number;
    currency: string;
    category: string;
    type: string;
    productionLevel?: string;
    utilization?: string;
    salePrice?: string;
  };
};

const CostSheetHeader: React.FC<CostSheetHeaderProps> = ({ header }) => {
  return (
    <div className="space-y-6">
      {/* Formal Government Headers */}
      <div className="text-center space-y-1 mb-8">
        <h2 className="text-sm font-black tracking-[0.25em] text-slate-900 dark:text-white uppercase">
          MINISTERIO DE FINANZAS Y PRECIOS
        </h2>
        <h3 className="text-[11px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
          FICHA DE COSTOS Y GASTOS DE PRODUCTOS Y SERVICIOS
        </h3>
        <p className="text-[9px] font-medium tracking-widest text-slate-400 uppercase">
          PARA LA EVALUACIÓN DE PRECIOS Y TARIFAS
        </p>
      </div>

      <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-inner">
        <div className="flex flex-col gap-6">
          <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary block mb-1">
              Datos generales de la Ficha de Costo (FC)
            </span>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white leading-tight uppercase">
              {header.name || 'Sin nombre'}
            </h1>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-6">
            {[
              { label: 'No. FC', value: header.code },
              { label: 'Cod. Producto', value: '5587' },
              { label: 'Fecha', value: formatDate(header.date) },
              { label: 'UM', value: header.unit },
              { label: 'Cantidad', value: header.quantity },
              { label: 'Moneda', value: header.currency },
              { label: 'ORGANISMO', value: header.category },
              { label: 'EMPRESA', value: header.type },
              { label: 'Nivel de Producción', value: header.productionLevel },
              { label: '% Utilización Capacidad', value: header.utilization },
              { label: 'Precio de Venta', value: header.salePrice, highlight: true },
            ].map((item, idx) => (
              <div key={idx} className={cn("space-y-1", item.highlight && "col-span-1 sm:col-span-2 lg:col-span-1")}>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">
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
