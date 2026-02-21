'use client';

import React from 'react';
import { useUIStore } from "@/store";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CostSheetModeDropdown, CostSheetViewMode } from "./CostSheetModeDropdown";

interface CostSheetBannerProps {
  viewMode: CostSheetViewMode;
  setViewMode: (mode: CostSheetViewMode) => void;
}

export const CostSheetBanner = ({ viewMode, setViewMode }: CostSheetBannerProps) => {
  const { setCurrentView } = useUIStore();
  return (
    <div className="hidden sm:flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 px-2">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          className="mr-4 rounded-xl border-primary/20 text-primaryhover:bg-primary/10 font-black uppercase tracking-widest text-[10px] h-11 px-4"
          onClick={() => setCurrentView('dashboard')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Regresar
        </Button>
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 rotate-3">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-tight">
            Vista Costo
          </h1>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">
            Sistema de Gestión COSTPRO
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <CostSheetModeDropdown viewMode={viewMode} setViewMode={setViewMode} />
        <ThemeToggle />
        <div className="hidden lg:flex neu-badge !text-success !bg-success/10 border border-success/20 py-1 px-3">
          Sistema Activo
        </div>
      </div>
    </div>
  );
};
