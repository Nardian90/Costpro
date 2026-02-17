'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const CostSheetBanner = () => {
  return (
    <div className="hidden sm:flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 px-2">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 rotate-3">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-tight">
            Ficha de Costo
          </h1>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">
            Sistema de Gestión COSTPRO
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="neu-badge !text-success !bg-success/10 border border-success/20 py-1 px-3">
          Sistema Activo
        </div>
      </div>
    </div>
  );
};
