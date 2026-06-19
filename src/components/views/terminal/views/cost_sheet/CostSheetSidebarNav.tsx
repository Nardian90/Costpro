'use client';

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { CheckCircle2, FileSpreadsheet, ListFilter, Layout, ClipboardList, Activity, Plus, Calculator, Layers } from 'lucide-react';
import { useUIStore } from "@/store";
import { Button } from '@/components/ui/button';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import type { CostSheetSection, CostSheetAnnex } from '@/types/cost-sheet';

interface SidebarNavItem {
  id: string;
  label?: string;
  title?: string;
  data?: unknown[];
  icon?: React.ElementType;
}

interface CostSheetSidebarNavProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: SidebarNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  type: 'sections' | 'annexes';
}

export const CostSheetSidebarNav: React.FC<CostSheetSidebarNavProps> = ({
  isOpen,
  onClose,
  title,
  items,
  activeId,
  onSelect,
  type
}) => {
  const addMainSection = useCostSheetStore(state => state.addMainSection);
  const setIsCalculatorOpen = useUIStore(state => state.setIsCalculatorOpen);

  const allOptionId = type === 'sections' ? 'all' : 'all-annexes';
  const isAllActive = activeId === allOptionId;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[300px] sm:w-[400px] bg-sidebar/95 backdrop-blur-xl border-l border-sidebar-border shadow-2xl p-0 flex flex-col">
        <SheetHeader className="p-6 border-b border-sidebar-border/50 bg-sidebar/5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                {type === 'sections' ? <ListFilter className="w-5 h-5 text-sidebar-foreground" /> : <FileSpreadsheet className="w-5 h-5 text-primary" />}
                </div>
                <SheetTitle className="text-xs font-black uppercase tracking-[0.2em] text-sidebar-foreground">
                    {title}
                </SheetTitle>
                <SheetDescription className="sr-only">
                    Navegación lateral para seleccionar {type === 'sections' ? 'secciones de la ficha' : 'anexos disponibles'}.
                </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
          {/* Option "Todos" */}
          <button type="button"
            onClick={() => {
              onSelect(allOptionId);
              onClose();
            }}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95 text-left border border-transparent",
              isAllActive
                ? "bg-primary text-foreground shadow-xl shadow-primary/20 scale-[1.02]"
                : "hover:bg-primary/5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:border-primary/10"
            )}
          >
            <div className={cn(
              "p-2 rounded-lg transition-colors",
              isAllActive ? "bg-white/20" : "bg-primary/5 group-hover:bg-primary/10"
            )}>
                <Layers className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-widest leading-none mb-1">
                    Todos
                </span>
                <span className={cn("text-[10px] font-bold uppercase tracking-tight truncate", isAllActive ? "text-white/70" : "text-sidebar-foreground/50")}>
                    Ver todas las {type === 'sections' ? 'secciones' : 'anexos'} juntas
                </span>
            </div>
          </button>

          <div className="h-px bg-sidebar-border/50 my-2" />

          {items.map((item) => {
            const isActive = activeId === item.id;
            const hasData = type === 'annexes' && item.data && item.data.length > 0;

            return (
              <button type="button"
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95 text-left border border-transparent",
                  isActive
                    ? "bg-primary text-foreground shadow-xl shadow-primary/20 scale-[1.02]"
                    : "hover:bg-primary/5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:border-primary/10"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg transition-colors",
                  isActive ? "bg-white/20" : "bg-primary/5 group-hover:bg-primary/10"
                )}>
                    {type === 'annexes' ? (
                        hasData ? <CheckCircle2 className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />
                    ) : (
                        item.icon ? <item.icon className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />
                    )}
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-widest leading-none mb-1">
                        {type === 'annexes' ? `Anexo ${item.id}` : item.label}
                    </span>
                    {type === 'annexes' && (
                        <span className={cn("text-xs font-bold uppercase tracking-tight truncate max-w-[180px]", isActive ? "text-white/70" : "text-sidebar-foreground/50")}>
                            {item.title}
                        </span>
                    )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-sidebar-border/50 bg-sidebar/5 space-y-4">
            {type === 'sections' && (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                      onClick={() => {
                          addMainSection();
                          onClose();
                      }}
                      className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-foreground font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 gap-2 px-2"
                  >
                      <Plus className="w-4 h-4" />
                      Nueva Sección
                  </Button>
                  <Button
                      onClick={() => {
                          setIsCalculatorOpen(true);
                          onClose();
                      }}
                      variant="outline"
                      className="w-full h-12 rounded-2xl border-primary/20 hover:bg-primary/10 text-primary font-black uppercase tracking-widest text-[10px] gap-2 px-2"
                  >
                      <Calculator className="w-4 h-4" />
                      Calculadora
                  </Button>
                </div>
            )}
            <p className="text-xs font-black uppercase tracking-[0.3em] text-sidebar-foreground/50 text-center">
                Navegación de Ficha
            </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
