'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
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
import { Download, FileText, CheckCircle2, X, Layout, Upload, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface ExportOptions {
  includeFC: boolean;
  includeAudit: boolean;
  includeAnnexes: string[]; // IDs of annexes to include
  consolidated: boolean;
  skipZeros: boolean;
  includeFinancialSummary: boolean;
  includeUtilityNote: boolean;
  showDateTime: boolean;
  alwaysZip?: boolean;
  pdfFormat: "standard" | "pro";
  logo?: string; // base64 string for Pro mode company logo
  includeComparison?: boolean;
  scenarioId?: string;
  includeFC_v2?: boolean; // For backward compatibility if needed
  includeFC_v3?: boolean;
  includeFC_v4?: boolean;
  includeFC_v5?: boolean;
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
    includeUtilityNote: true,
    showDateTime: true,
    alwaysZip: false,
    pdfFormat: "standard"
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("El logo debe ser menor a 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setOptions(prev => ({ ...prev, logo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setOptions(prev => ({ ...prev, logo: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-sidebar-border shadow-2xl rounded-3xl">
        <DialogHeader className="p-6 sm:p-8 pb-4 shrink-0 bg-sidebar/50 backdrop-blur-md border-b border-sidebar-border/50">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Download className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black tracking-tight">Exportar Documentos</DialogTitle>
              <DialogDescription className="font-medium text-muted-foreground/80">
                Selecciona los documentos y el formato de salida.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-auto px-6 sm:px-8 py-6 min-h-0">
            <div className="space-y-8 pb-6">
                {/* Format selection */}
                <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label="Seleccionar formato de exportación PDF">
                    <button
                        onClick={() => setOptions(prev => ({ ...prev, pdfFormat: 'standard' }))}
                        className={cn(
                            "flex flex-col items-start p-4 rounded-3xl border-2 transition-all text-left group",
                            options.pdfFormat === 'standard'
                                ? "bg-primary/5 border-primary shadow-lg shadow-primary/5"
                                : "bg-sidebar/40 border-transparent hover:border-sidebar-border/80"
                        )}
                        type="button"
                        role="radio"
                        aria-checked={options.pdfFormat === 'standard'}
                        aria-label="Modo Estándar: formato básico y limpio"
                    >
                        <div className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center mb-3 transition-colors",
                            options.pdfFormat === 'standard' ? "bg-primary text-primary-foreground" : "bg-sidebar text-muted-foreground group-hover:bg-sidebar-border"
                        )}>
                            <FileText className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <span className="font-black uppercase tracking-widest text-[10px] mb-1">Modo Estándar</span>
                        <span className="text-xs text-muted-foreground font-medium">Básico y limpio</span>
                    </button>

                    <button
                        onClick={() => setOptions(prev => ({ ...prev, pdfFormat: 'pro' }))}
                        className={cn(
                            "flex flex-col items-start p-4 rounded-3xl border-2 transition-all text-left group",
                            options.pdfFormat === 'pro'
                                ? "bg-amber-500/5 border-amber-500 shadow-lg shadow-amber-500/5"
                                : "bg-sidebar/40 border-transparent hover:border-sidebar-border/80"
                        )}
                        type="button"
                        role="radio"
                        aria-checked={options.pdfFormat === 'pro'}
                        aria-label="Modo Pro: con logo corporativo"
                    >
                        <div className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center mb-3 transition-colors",
                            options.pdfFormat === 'pro' ? "bg-amber-500 text-white" : "bg-sidebar text-muted-foreground group-hover:bg-sidebar-border"
                        )}>
                            <ImagePlus className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <span className="font-black uppercase tracking-widest text-[10px] mb-1">Modo Pro</span>
                        <span className="text-xs text-muted-foreground font-medium">Con logo corporativo</span>
                    </button>
                </div>

                {/* Logo Upload (Only Pro) */}
                <div className={cn(
                    "overflow-hidden transition-all duration-500",
                    options.pdfFormat === 'pro' ? "max-h-40 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                )}>
                    {options.pdfFormat === 'pro' && (
                        <div className="p-5 rounded-3xl bg-amber-500/5 border border-amber-500/20">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-3 block">Identidad Visual</Label>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                aria-label="Seleccionar archivo de logo corporativo"
                            />
                            {options.logo ? (
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl border-2 border-amber-500/20 bg-white p-2 overflow-hidden">
                                        <Image src={options.logo} alt="Logo corporativo de exportación" width={48} height={48} className="w-full h-full object-contain" unoptimized />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-muted-foreground truncate">Logo cargado</p>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 mt-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 px-2"
                                            onClick={handleRemoveLogo}
                                        >
                                            <X className="w-3 h-3 mr-1" aria-hidden="true" />
                                            Eliminar
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-9 text-xs font-bold border-dashed border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:text-amber-500"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Upload className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                                    Subir Logo
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* Main Documents */}
                <div className="space-y-4">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 px-1">
                        Documentos Principales
                    </div>

                    <div className="grid gap-3">
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/40 border border-sidebar-border/50">
                            <div className="flex items-center gap-3">
                                <FileText className="w-4 h-4" aria-hidden="true" />
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
                                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
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
                            type="button"
                            className="h-auto p-0 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary"
                            onClick={handleSelectAllAnnexes}
                            aria-label={options.includeAnnexes.length === annexes.length ? 'Desmarcar todos los anexos' : 'Marcar todos los anexos'}
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

                        <div className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/40 border border-sidebar-border/50">
                            <div>
                                <Label htmlFor="showDateTime" className="font-bold text-sm block">Mostrar Fecha y Hora</Label>
                                <span className="text-xs text-muted-foreground uppercase font-medium">Incluir marca de tiempo en el pie de página</span>
                            </div>
                            <Switch
                                id="showDateTime"
                                checked={options.showDateTime}
                                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, showDateTime: checked }))}
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-2xl bg-sidebar/40 border border-sidebar-border/50">
                            <div>
                                <Label htmlFor="alwaysZip" className="font-bold text-sm block">Forzar ZIP</Label>
                                <span className="text-xs text-muted-foreground uppercase font-medium">Comprimir salida incluso para un solo archivo</span>
                            </div>
                            <Switch
                                id="alwaysZip"
                                checked={options.alwaysZip || false}
                                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, alwaysZip: checked }))}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>

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
