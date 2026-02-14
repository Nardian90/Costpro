'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { LayoutGrid, FileText, Plus, Package, Settings, FileDown, Layers, Zap, Bot, Sparkles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from '@/store';

interface CostSheetBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onAction: (actionId: string) => void;
}

export const CostSheetBottomNav: React.FC<CostSheetBottomNavProps> = ({
  activeTab,
  onTabChange,
  onAction
}) => {
  const { isChatBotOpen } = useUIStore();

  return (
    <div className="fixed bottom-6 left-4 right-4 z-50 px-4 pb-6 sm:hidden">
      <div className="mx-auto max-w-md bg-background/95 dark:bg-card/95 backdrop-blur-xl border border-border/50 rounded-[2.5rem] shadow-2xl flex items-center justify-around p-2 relative h-20 transition-colors duration-500">

        {/* Tablero */}
        <button
          onClick={() => onTabChange('kpis')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300",
            activeTab === 'kpis' ? "text-primary" : "text-muted-foreground/60"
          )}
        >
          <LayoutGrid className={cn("w-5 h-5", activeTab === 'kpis' && "drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]")} />
          <span className="text-[9px] font-black uppercase tracking-widest leading-none">Tablero</span>
        </button>

        {/* Ficha */}
        <button
          onClick={() => onTabChange('main')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300",
            activeTab === 'main' ? "text-primary" : "text-muted-foreground/60"
          )}
        >
          <FileText className={cn("w-5 h-5", activeTab === 'main' && "drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]")} />
          <span className="text-[9px] font-black uppercase tracking-widest leading-none">Ficha</span>
        </button>

        {/* Central FAB with Dropdown */}
        <div className="relative -mt-10">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[0_0_20px_rgba(57,255,20,0.4)] active:scale-95 transition-all border-4 border-background">
                        <Plus className="w-7 h-7 font-bold" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" side="top" className="mb-4 bg-popover/95 backdrop-blur-xl border-border/50 rounded-2xl p-2 w-56 animate-in slide-in-from-bottom-2 shadow-2xl">
                    <DropdownMenuItem
                        onClick={() => onAction('export-pdf')}
                        className="flex items-center gap-3 p-3 rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer border-none"
                    >
                        <div className="p-2 rounded-lg bg-primary/10">
                            <FileDown className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-bold uppercase tracking-tight text-xs">Generar PDF</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => onAction('massive-pdf')}
                        className="flex items-center gap-3 p-3 rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer border-none"
                    >
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Layers className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-bold uppercase tracking-tight text-xs">PDF Masivo</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => onAction('quick-mode')}
                        className="flex items-center gap-3 p-3 rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer border-none"
                    >
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Zap className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-bold uppercase tracking-tight text-xs">Modo Rápido</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => onAction('inventory')}
                        className="flex items-center gap-3 p-3 rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer border-none sm:hidden"
                    >
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Package className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-bold uppercase tracking-tight text-xs">Inventario</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>

        {/* Eli (AI) */}
        <button
          onClick={() => onAction('ai')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300 relative",
            isChatBotOpen ? "text-primary" : "text-muted-foreground/60"
          )}
        >
          {isChatBotOpen && (
              <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-primary animate-pulse" />
          )}
          <Bot className={cn("w-5 h-5", isChatBotOpen && "drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]")} />
          <span className="text-[9px] font-black uppercase tracking-widest leading-none">Eli</span>
        </button>

        {/* Config */}
        <button
          onClick={() => onAction('config')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300",
            activeTab === 'config' ? "text-primary" : "text-muted-foreground/60"
          )}
        >
          <Settings className={cn("w-5 h-5", activeTab === 'config' && "drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]")} />
          <span className="text-[9px] font-black uppercase tracking-widest leading-none">Menú</span>
        </button>

      </div>
    </div>
  );
};
