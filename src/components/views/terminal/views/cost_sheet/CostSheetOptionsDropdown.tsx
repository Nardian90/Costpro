'use client';

import * as React from 'react';
import { Upload, Save, FileSpreadsheet, FileType2, Settings, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface CostSheetOptionsDropdownProps {
  onImport: () => void;
  onSave: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
}

export function CostSheetOptionsDropdown({
  onImport,
  onSave,
  onExportExcel,
  onExportPdf,
}: CostSheetOptionsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group relative flex items-center gap-2 px-3 h-10 rounded-xl bg-background/50 border border-border/50 hover:bg-muted hover:border-primary/20 transition-all outline-none"
        >
          <Settings className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
            Opciones
          </span>
          <ChevronDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl bg-card border-border shadow-2xl">
        <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 border-b border-border/50 pb-2">
          Acciones de Ficha
        </div>
        <DropdownMenuItem onClick={onImport} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer">
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-black uppercase tracking-widest">Importar</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSave} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer">
          <Save className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-black uppercase tracking-widest">Exportar</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportExcel} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-black uppercase tracking-widest">Guardar como Excel</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportPdf} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer">
          <FileType2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-black uppercase tracking-widest">Como PDF</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
