'use client';

import React, { useState, useRef } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

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
    pdfFormat: "standard"
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

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast.error('El logo no puede superar los 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoPreview(base64);
        setOptions(prev => ({ ...prev, logo: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setOptions(prev => ({ ...prev, logo: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = '';
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
                {/* PDF Format Selection */}
                <div className="space-y-4">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 px-1">
                        Formato del Reporte
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setOptions(prev => ({ ...prev, pdfFormat: "standard" }))}
                            className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-1.5 ${
                                options.pdfFormat === "standard"
                                ? "bg-primary/10 border-primary shadow-sm"
                                : "bg-sidebar/40 border-sidebar-border/50 hover:bg-sidebar/60"
                            }`}
                        >
                            <FileText className={`w-5 h-5 ${options.pdfFormat === "standard" ? "text-primary" : "text-muted-foreground"}`} />
                            <span className={`text-xs font-bold ${options.pdfFormat === "standard" ? "text-primary" : "text-muted-foreground"}`}>Estándar</span>
                            <span className={`text-[10px] leading-tight text-center ${options.pdfFormat === "standard" ? "text-primary/60" : "text-muted-foreground/60"}`}>
                                Formato limpio y profesional sin logo
                            </span>
                        </button>
                        <button
                            onClick={() => setOptions(prev => ({ ...prev, pdfFormat: "pro" }))}
                            className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-1.5 relative ${
                                options.pdfFormat === "pro"
                                ? "bg-amber-500/10 border-amber-500/60 shadow-sm shadow-amber-500/10"
                                : "bg-sidebar/40 border-sidebar-border/50 hover:bg-sidebar/60"
                            }`}
                        >
                            <Layout className={`w-5 h-5 ${options.pdfFormat === "pro" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
                            <span className={`text-xs font-bold ${options.pdfFormat === "pro" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>Pro (Ink-Save)</span>
                            <span className={`text-[10px] leading-tight text-center ${options.pdfFormat === "pro" ? "text-amber-600/60 dark:text-amber-400/60" : "text-muted-foreground/60"}`}>
                                Diseño premium con logo y énfasis visual
                            </span>
                        </button>
                    </div>

                    {/* Logo Upload for Pro Mode */}
                    {options.pdfFormat === "pro" && (
                        <div className="space-y-3 p-3 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                            <div className="flex items-center gap-2 px-1">
                                <ImagePlus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                <span className="text-xs font-black uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400">
                                    Logo de la Empresa
                                </span>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleLogoUpload}
                            />

                            {logoPreview ? (
                                <div className="flex items-center gap-3">
                                    <div className="relative w-16 h-16 rounded-xl border border-amber-500/30 bg-sidebar/80 overflow-hidden shrink-0">
                                        <img
                                            src={logoPreview}
                                            alt="Logo preview"
                                            className="w-full h-full object-contain p-1"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-muted-foreground truncate">Logo cargado</p>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 mt-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 px-2"
                                            onClick={handleRemoveLogo}
                                        >
                                            <X className="w-3 h-3 mr-1" />
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
                                    <Upload className="w-3.5 h-3.5 mr-2" />
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
