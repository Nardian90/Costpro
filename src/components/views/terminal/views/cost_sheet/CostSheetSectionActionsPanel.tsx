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
import { Download, Upload, Plus, Trash2, Settings, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CostSheetSection } from '@/types/cost-sheet';

interface CostSheetSectionActionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  section: CostSheetSection | null;
  onExport: () => void;
  onImport: () => void;
  onAddRow: () => void;
  onRemove: () => void;
}

export const CostSheetSectionActionsPanel: React.FC<CostSheetSectionActionsPanelProps> = ({
  isOpen,
  onClose,
  section,
  onExport,
  onImport,
  onAddRow,
  onRemove
}) => {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[300px] sm:w-[400px] bg-sidebar/95 backdrop-blur-xl border-l border-sidebar-border shadow-2xl p-0 flex flex-col">
        <SheetHeader className="p-6 border-b border-sidebar-border/50 bg-sidebar/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
                <SheetTitle className="text-xs font-black uppercase tracking-[0.2em] text-foreground">
                    Acciones de Sección
                </SheetTitle>
                <SheetDescription className="text-xs font-bold uppercase text-muted-foreground mt-1">
                    {section?.label || 'Sin título'}
                </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
          <div className="space-y-1">
            <div className="px-4 text-xs font-black text-primary/70 tracking-[0.4em] uppercase mb-4">
              Operaciones de Datos
            </div>

            <button
              onClick={() => { onAddRow(); onClose(); }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95 text-left hover:bg-primary/5 text-sidebar-foreground/70"
            >
              <div className="p-2 rounded-lg bg-primary/5 group-hover:bg-primary/10 transition-colors">
                <Plus className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest">Añadir Fila</span>
            </button>

            <button
              onClick={() => { onExport(); onClose(); }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95 text-left hover:bg-primary/5 text-sidebar-foreground/70"
            >
              <div className="p-2 rounded-lg bg-primary/5 group-hover:bg-primary/10 transition-colors">
                <Download className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest">Exportar a Excel</span>
            </button>

            <button
              onClick={() => { onImport(); onClose(); }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95 text-left hover:bg-primary/5 text-sidebar-foreground/70"
            >
              <div className="p-2 rounded-lg bg-primary/5 group-hover:bg-primary/10 transition-colors">
                <Upload className="w-4 h-4 text-primary" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest">Importar de Excel</span>
            </button>
          </div>

          <div className="pt-4 border-t border-sidebar-border/50 space-y-1">
            <div className="px-4 text-xs font-black text-destructive/70 tracking-[0.4em] uppercase mb-4">
              Peligro
            </div>

            <button
              onClick={() => { onRemove(); onClose(); }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95 text-left hover:bg-destructive/5 text-destructive"
            >
              <div className="p-2 rounded-lg bg-destructive/5 group-hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-4 h-4 text-destructive" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest">Eliminar Sección</span>
            </button>
          </div>
        </div>

        <div className="p-6 border-t border-sidebar-border/50 bg-sidebar/5">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground/50 text-center">
                Gestión de Sección de Ficha
            </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
