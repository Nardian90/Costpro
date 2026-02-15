'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Download, FileText, CheckCircle2, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface ExportOptions {
  includeFC: boolean;
  includeAudit: boolean;
  includeAnnexes: string[]; // IDs of annexes to include
  consolidated: boolean;
  skipZeros: boolean;
  includeFinancialSummary: boolean;
  includeUtilityNote: boolean;
}

interface CostSheetExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
  annexes: { id: string; title: string }[];
}

export const CostSheetExportModal: React.FC<CostSheetExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  annexes
}) => {
  const [options, setOptions] = useState<ExportOptions>({
    includeFC: true,
    includeAudit: false,
    includeAnnexes: annexes.map(a => a.id),
    consolidated: true,
    skipZeros: true,
    includeFinancialSummary: true,
    includeUtilityNote: true
  });

  const handleToggleAnnex = (id: string) => {
    setOptions(prev => ({
      ...prev,
      includeAnnexes: prev.includeAnnexes.includes(id)
        ? prev.includeAnnexes.filter(a => a !== id)
        : [...prev.includeAnnexes, id]
    }));
  };

  const handleSelectAllAnnexes = () => {
    setOptions(prev => ({
      ...prev,
      includeAnnexes: prev.includeAnnexes.length === annexes.length ? [] : annexes.map(a => a.id)
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0 bg-sidebar/95 backdrop-blur-2xl border-sidebar-border shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[85vh] w-[95vw] sm:w-full">
        <DialogHeader className="p-4 sm:p-6 border-b border-sidebar-border/50 shrink-0 z-10 relative bg-sidebar/95 backdrop-blur-md">
          <div className="flex items-center gap-4">
             <div className="p-2 sm:p-3 rounded-2xl bg-primary/10 shrink-0">
                <Download className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
             </div>
             <div className="min-w-0">
                <DialogTitle className="text-lg sm:text-xl font-black uppercase tracking-tight text-foreground truncate">
                    Opciones de Exportación
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm text-muted-foreground font-medium line-clamp-1 sm:line-clamp-none">
                    Selecciona qué elementos deseas incluir en el PDF.
                </DialogDescription>
             </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-4 sm:p-6 space-y-6 pb-12">
                {/* Main Documents */}
                <div className="space-y-4">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 px-1">
                        Documentos Principales
                    </div>

                    <div className="grid gap-3">
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/40 border border-sidebar-border/50">
                            <div className="flex items-center gap-3">
                                <FileText className="w-4 h-4 text-muted-foreground" />
                                <Label htmlFor="includeFC" className="font-bold text-sm cursor-pointer">Ficha de Costo (FC)</Label>
                            </div>
                            <Checkbox
                                id="includeFC"
                                checked={options.includeFC}
                                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeFC: !!checked }))}
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/40 border border-sidebar-border/50">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                                <Label htmlFor="includeAudit" className="font-bold text-sm cursor-pointer">Trazabilidad (Auditoría)</Label>
                            </div>
                            <Checkbox
                                id="includeAudit"
                                checked={options.includeAudit}
                                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeAudit: !!checked }))}
                            />
                        </div>
                    </div>
                </div>

                {/* Annexes */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <div className="text-xs font-black uppercase tracking-[0.2em] text-primary/70">
                            Anexos
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary"
                            onClick={handleSelectAllAnnexes}
                        >
                            {options.includeAnnexes.length === annexes.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                        </Button>
                    </div>

                    <div className="grid gap-2">
                        {annexes.map((annex) => (
                            <div key={annex.id} className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/20 border border-sidebar-border/30 hover:bg-sidebar/40 transition-colors">
                                <Label htmlFor={`annex-${annex.id}`} className="font-medium text-xs cursor-pointer flex-1 pr-4">
                                    {annex.id} - {annex.title}
                                </Label>
                                <Checkbox
                                    id={`annex-${annex.id}`}
                                    checked={options.includeAnnexes.includes(annex.id)}
                                    onCheckedChange={() => handleToggleAnnex(annex.id)}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Advanced Options */}
                <div className="space-y-4">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 px-1">
                        Configuración Avanzada
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/5 border border-primary/10">
                            <div>
                                <Label htmlFor="consolidated" className="font-bold text-sm block">Consolidar Documentos</Label>
                                <span className="text-xs text-muted-foreground uppercase font-medium">Un solo PDF con todo lo seleccionado</span>
                            </div>
                            <Switch
                                id="consolidated"
                                checked={options.consolidated}
                                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, consolidated: checked }))}
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/40 border border-sidebar-border/50">
                            <div>
                                <Label htmlFor="skipZeros" className="font-bold text-sm block">Omitir Ceros</Label>
                                <span className="text-xs text-muted-foreground uppercase font-medium">No exportar filas o anexos en cero</span>
                            </div>
                            <Switch
                                id="skipZeros"
                                checked={options.skipZeros}
                                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, skipZeros: checked }))}
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/40 border border-sidebar-border/50">
                            <div>
                                <Label htmlFor="includeUtilityNote" className="font-bold text-sm block">Nota de Utilidad</Label>
                                <span className="text-xs text-muted-foreground uppercase font-medium">Incluir desglose del % de utilidad</span>
                            </div>
                            <Switch
                                id="includeUtilityNote"
                                checked={options.includeUtilityNote}
                                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeUtilityNote: checked }))}
                            />
                        </div>

                    </div>
                </div>
            </div>
        </ScrollArea>

        <DialogFooter className="p-4 sm:p-6 border-t border-sidebar-border/50 bg-sidebar/95 backdrop-blur-md shrink-0 z-10 relative">
            <div className="flex w-full gap-3">
                <Button
                    variant="outline"
                    onClick={onClose}
                    className="flex-1 rounded-2xl font-black uppercase tracking-widest text-xs h-11"
                >
                    Cancelar
                </Button>
                <Button
                    onClick={() => onExport(options)}
                    disabled={!options.includeFC && !options.includeAudit && options.includeAnnexes.length === 0}
                    className="flex-1 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 h-11"
                >
                    Generar PDF
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
