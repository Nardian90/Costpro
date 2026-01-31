'use client';

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { CheckCircle2, FileSpreadsheet, ListFilter, Layout, ClipboardList, Activity } from 'lucide-react';

interface CostSheetSidebarNavProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: any[];
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
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[300px] sm:w-[400px] bg-sidebar/95 backdrop-blur-xl border-l border-sidebar-border shadow-2xl p-0 flex flex-col">
        <SheetHeader className="p-6 border-b border-sidebar-border/50 bg-sidebar/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              {type === 'sections' ? <ListFilter className="w-5 h-5 text-primary" /> : <FileSpreadsheet className="w-5 h-5 text-primary" />}
            </div>
            <SheetTitle className="text-xs font-black uppercase tracking-[0.2em] text-foreground">
                {title}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
          {items.map((item) => {
            const isActive = activeId === item.id;
            const hasData = type === 'annexes' && item.data && item.data.length > 0;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95 text-left border border-transparent",
                  isActive
                    ? "bg-primary text-white shadow-xl shadow-primary/20 scale-[1.02]"
                    : "hover:bg-primary/5 text-sidebar-foreground/70 hover:border-primary/10"
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
                    <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">
                        {type === 'annexes' ? `Anexo ${item.id}` : item.label}
                    </span>
                    {type === 'annexes' && (
                        <span className={cn("text-[8px] font-bold uppercase tracking-tight truncate max-w-[180px]", isActive ? "text-white/70" : "text-muted-foreground")}>
                            {item.title}
                        </span>
                    )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-6 border-t border-sidebar-border/50 bg-sidebar/5">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground/50 text-center">
                Navegación de Ficha
            </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
