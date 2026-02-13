'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { LayoutGrid, FileText, Plus, Package, Settings, FileDown, Layers, Zap } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 sm:hidden">
      <div className="mx-auto max-w-md bg-[#151B28]/95 backdrop-blur-xl border border-white/5 rounded-[2.5rem] shadow-2xl flex items-center justify-around p-2 relative h-20">

        {/* Tablero */}
        <button
          onClick={() => onTabChange('kpis')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300",
            activeTab === 'kpis' ? "text-[#39FF14]" : "text-gray-400"
          )}
        >
          <LayoutGrid className={cn("w-6 h-6", activeTab === 'kpis' && "drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]")} />
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">Tablero</span>
        </button>

        {/* Fichas */}
        <button
          onClick={() => onTabChange('main')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300",
            activeTab === 'main' ? "text-[#39FF14]" : "text-gray-400"
          )}
        >
          <FileText className={cn("w-6 h-6", activeTab === 'main' && "drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]")} />
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">Fichas</span>
        </button>

        {/* Central FAB with Dropdown */}
        <div className="relative -mt-12">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="w-16 h-16 rounded-full bg-[#39FF14] text-black flex items-center justify-center shadow-[0_0_20px_rgba(57,255,20,0.4)] active:scale-95 transition-all border-4 border-[#151B28]">
                        <Plus className="w-8 h-8 font-bold" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" side="top" className="mb-4 bg-[#151B28] border-white/10 rounded-2xl p-2 w-56 animate-in slide-in-from-bottom-2">
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
                </DropdownMenuContent>
            </DropdownMenu>
        </div>

        {/* Stock */}
        <button
          onClick={() => onAction('inventory')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300",
            activeTab === 'inventory' ? "text-[#39FF14]" : "text-gray-400"
          )}
        >
          <Package className={cn("w-6 h-6", activeTab === 'inventory' && "drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]")} />
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">Stock</span>
        </button>

        {/* Config */}
        <button
          onClick={() => onAction('config')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all duration-300",
            activeTab === 'config' ? "text-[#39FF14]" : "text-gray-400"
          )}
        >
          <Settings className={cn("w-6 h-6", activeTab === 'config' && "drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]")} />
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">Config</span>
        </button>

      </div>
    </div>
  );
};
