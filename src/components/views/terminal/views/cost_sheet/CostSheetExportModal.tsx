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
import { Download, FileText, CheckCircle2, X, Layout, Upload, ImagePlus, Scale, BarChart3, Calculator, ShieldCheck, Minimize2, Globe, Columns, Ship } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type PDFFormat =
  | 'standard'
  | 'pro'
  | 'res148'
  | 'ejecutivo'
  | 'contabilidad'
  | 'auditoria'
  | 'simplificado'
  | 'bilingue'
  | 'comparativo'
  | 'exportacion';
export interface ExportOptions {
  // Documents
  includeFC: boolean;
  includeAudit: boolean;
  includeAnnexes: string[];

  // Format
  pdfFormat: PDFFormat;
  logo?: string;

  // Advanced
  consolidated: boolean;
  skipZeros: boolean;
  includeFinancialSummary: boolean;
  includeUtilityNote: boolean;
  showDateTime: boolean;
  alwaysZip: boolean;

  // Comparison
  includeComparison?: boolean;
  scenarioId?: string;
}
const PDF_FORMATS: Array<{
  id: PDFFormat;
  label: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
}> = [
  {
    id: 'standard',
    label: 'Estándar',
    description: 'Básico y limpio',
    icon: FileText,
    accent: 'primary',
    accentBg: 'bg-primary/5',
    accentBorder: 'border-primary',
    accentText: 'text-primary',
  },
  {
    id: 'pro',
    label: 'Pro Corporativo',
    description: 'Con logo e identidad visual',
    icon: ImagePlus,
    accent: 'amber',
    accentBg: 'bg-amber-500/5',
    accentBorder: 'border-amber-500',
    accentText: 'text-amber-600 dark:text-amber-400',
  },
  {
    id: 'res148',
    label: 'Res 148/2023',
    description: 'Formato oficial MINCIN Cuba',
    icon: Scale,
    accent: 'blue',
    accentBg: 'bg-blue-500/5',
    accentBorder: 'border-blue-500',
    accentText: 'text-blue-600 dark:text-blue-400',
  },
  {
    id: 'ejecutivo',
    label: 'Ejecutivo',
    description: 'KPIs y estructura — dirección',
    icon: BarChart3,
    accent: 'purple',
    accentBg: 'bg-purple-500/5',
    accentBorder: 'border-purple-500',
    accentText: 'text-purple-600 dark:text-purple-400',
  },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    description: 'Cuentas, referencias y verificación',
    icon: Calculator,
    accent: 'teal',
    accentBg: 'bg-teal-500/5',
    accentBorder: 'border-teal-500',
    accentText: 'text-teal-600 dark:text-teal-400',
  },
  {
    id: 'auditoria',
    label: 'Auditoría',
    description: 'Trazabilidad y firmas',
    icon: ShieldCheck,
    accent: 'orange',
    accentBg: 'bg-orange-500/5',
    accentBorder: 'border-orange-500',
    accentText: 'text-orange-600 dark:text-orange-400',
  },
  {
    id: 'simplificado',
    label: 'Simplificado',
    description: 'Una página, solo totales',
    icon: Minimize2,
    accent: 'gray',
    accentBg: 'bg-muted/30',
    accentBorder: 'border-muted-foreground/40',
    accentText: 'text-muted-foreground',
  },
  {
    id: 'bilingue',
    label: 'Bilingüe ES/EN',
    description: 'Columnas paralelas español e inglés',
    icon: Globe,
    accent: 'indigo',
    accentBg: 'bg-indigo-500/5',
    accentBorder: 'border-indigo-500',
    accentText: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    id: 'comparativo',
    label: 'Escenarios Paralelos',
    description: 'Base vs variaciones +10% +20% -10%',
    icon: Columns,
    accent: 'cyan',
    accentBg: 'bg-cyan-500/5',
    accentBorder: 'border-cyan-500',
    accentText: 'text-cyan-600 dark:text-cyan-400',
  },
  {
    id: 'exportacion',
    label: 'Para Exportación',
    description: 'CUP + USD, campos internacionales',
    icon: Ship,
    accent: 'emerald',
    accentBg: 'bg-emerald-500/5',
    accentBorder: 'border-emerald-500',
    accentText: 'text-emerald-600 dark:text-emerald-400',
  },
];

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
                                {/* Format Selection */}
<div className="space-y-3">
  <div className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 px-1">
    Formato de Exportación
  </div>
  <div
    className="grid grid-cols-2 gap-2"
    role="radiogroup"
    aria-label="Seleccionar formato de exportación PDF"
  >
    {PDF_FORMATS.map((fmt) => {
      const Icon = fmt.icon;
      const isSelected = options.pdfFormat === fmt.id;
      return (
        <button
          key={fmt.id}
          type="button"
          role="radio"
          aria-checked={isSelected}
          aria-label={`${fmt.label}: ${fmt.description}`}
          onClick={() => setOptions(prev => ({ ...prev, pdfFormat: fmt.id }))}
          className={cn(
            'flex items-start gap-3 p-3 rounded-2xl border-2 transition-all text-left group',
            isSelected
              ? `${fmt.accentBg} ${fmt.accentBorder} shadow-sm`
              : 'bg-sidebar/40 border-transparent hover:border-sidebar-border/80'
          )}
        >
          <div className={cn(
            'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-colors',
            isSelected ? `${fmt.accentBg} ${fmt.accentText}` : 'bg-sidebar text-muted-foreground'
          )}>
            <Icon className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className={cn(
              'font-black uppercase tracking-widest text-[9px] truncate',
              isSelected ? fmt.accentText : 'text-foreground'
            )}>
              {fmt.label}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium leading-tight mt-0.5 line-clamp-2">
              {fmt.description}
            </div>
          </div>
        </button>
      );
    })}
  </div>
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
