'use client';

import React from 'react';
import { useUIStore } from "@/store";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface CostSheetBannerProps {
  activeSection?: string;
  onAction?: (action: string) => void;
}

export const CostSheetBanner = ({ activeSection, onAction }: CostSheetBannerProps) => {
  const { setCurrentView } = useUIStore();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 sm:mb-8 px-2 sticky top-0 z-[40] bg-background/80 backdrop-blur-xl py-3 sm:py-0 sm:bg-transparent sm:backdrop-blur-none sm:relative border-b border-white/5 sm:border-none -mx-4 sm:mx-0 px-4 sm:px-2">
      <div className="flex items-center justify-between w-full sm:w-auto gap-4">
        <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-primary/20 text-primary hover:bg-primary/10 font-black uppercase tracking-widest text-[10px] h-11 px-4"
              onClick={() => setCurrentView('dashboard')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Regresar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl text-muted-foreground font-black uppercase tracking-widest text-[10px] h-11 px-4"
              onClick={() => onAction?.('templates')}
            >
              Plantillas
            </Button>
        </div>

        <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 rotate-3 shrink-0">
              <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[clamp(1.25rem,6vw,1.875rem)] font-black text-foreground tracking-tight leading-tight truncate">
                FC
              </h1>
              <p className="text-[clamp(0.6rem,3vw,0.75rem)] font-black uppercase tracking-[0.2em] text-primary/60 truncate">
                COSTPRO
              </p>
            </div>
        </div>
      </div>

      <div className="flex items-center justify-between w-full sm:w-auto gap-4">
        <div className="flex items-center gap-3 flex-1 sm:flex-none">
            <ThemeToggle />
        </div>
        <div className="hidden lg:flex neu-badge !text-success !bg-success/10 border border-success/20 py-1 px-3">
          SISTEMA SIMPLIFICADO
        </div>
      </div>
    </div>
  );
};

export default CostSheetBanner;
