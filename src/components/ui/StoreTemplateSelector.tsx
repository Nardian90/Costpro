'use client';

import { useTranslations } from 'next-intl';
import { FileText, Eye } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  FC_MODALIDADES,
  FC_MODALIDAD_LABELS,
  FC_PDF_FORMATS,
  FC_PDF_FORMAT_LABELS,
} from '@/contracts/store-cost-template';
import type { FCModalidad, FCPdfFormat } from '@/contracts/store-cost-template';

// ── Template options (mirrors TEMPLATE_REGISTRY in fc-generator-service) ──

export const FC_TEMPLATE_OPTIONS: { id: string; label: string; category: string }[] = [
  { id: 'costpro-reinicio', label: 'CostPro — Reinicio (General)', category: 'General' },
  { id: 'template-pizza', label: 'Pizza — Gastronomía', category: 'Gastronomía' },
  { id: 'template-juice', label: 'Jugos — Bebidas', category: 'Bebidas' },
  { id: 'template-icecream', label: 'Helados — Gastronomía', category: 'Gastronomía' },
  { id: 'template-shoes', label: 'Calzado — Manufactura', category: 'Manufactura' },
  { id: 'template-furniture', label: 'Muebles — Carpintería', category: 'Carpintería' },
  { id: 'template-repair', label: 'Reparación — Servicios', category: 'Servicios' },
  { id: 'template-consultancy', label: 'Consultoría — Servicios', category: 'Servicios' },
  { id: 'template-logistics', label: 'Logística — Servicios', category: 'Servicios' },
  { id: 'template-industrial', label: 'Industrial — Producción', category: 'Producción' },
  { id: 'template-lavar', label: 'Lavandería — Servicios', category: 'Servicios' },
  { id: 'template-pastry', label: 'Pastelería — Gastronomía', category: 'Gastronomía' },
];

// ── Template visual preview metadata ──

const TEMPLATE_PREVIEW: Record<string, { icon: string; color: string; description: string }> = {
  'costpro-reinicio': { icon: '🔄', color: 'bg-blue-50 border-blue-200', description: 'Plantilla general para reinicio de costo. Incluye todos los campos de la Resolución 148.' },
  'template-pizza': { icon: '🍕', color: 'bg-red-50 border-red-200', description: 'Gastronomía: Pizza. Cálculo de costo con ingredientes, mano de obra y overhead.' },
  'template-juice': { icon: '🧃', color: 'bg-orange-50 border-orange-200', description: 'Bebidas: Jugos. Materias primas, procesamiento y envasado.' },
  'template-icecream': { icon: '🍦', color: 'bg-pink-50 border-pink-200', description: 'Gastronomía: Helados. Base láctea, insumos y conservación.' },
  'template-shoes': { icon: '👟', color: 'bg-amber-50 border-amber-200', description: 'Manufactura: Calzado. Materiales, corte, ensamblaje y acabado.' },
  'template-furniture': { icon: '🪑', color: 'bg-yellow-50 border-yellow-200', description: 'Carpintería: Muebles. Madera, herrajes, acabado y mano de obra.' },
  'template-repair': { icon: '🔧', color: 'bg-slate-50 border-slate-200', description: 'Servicios: Reparación. Repuestos, mano de obra y diagnóstico.' },
  'template-consultancy': { icon: '💼', color: 'bg-indigo-50 border-indigo-200', description: 'Servicios: Consultoría. Horas profesionales y deliverables.' },
  'template-logistics': { icon: '🚛', color: 'bg-green-50 border-green-200', description: 'Servicios: Logística. Transporte, almacenamiento y distribución.' },
  'template-industrial': { icon: '🏭', color: 'bg-zinc-50 border-zinc-200', description: 'Producción: Industrial. Materias primas, procesos y energía.' },
  'template-lavar': { icon: '🧺', color: 'bg-cyan-50 border-cyan-200', description: 'Servicios: Lavandería. Insumos, agua, energía y mano de obra.' },
  'template-pastry': { icon: '🧁', color: 'bg-rose-50 border-rose-200', description: 'Gastronomía: Pastelería. Ingredientes, decoración y horneado.' },
};

// ── Props ──────────────────────────────────────────────────────────────

interface StoreTemplateSelectorProps {
  /** Whether FC auto-generation is enabled for this store */
  fcAutoEnabled: boolean;
  onFcAutoEnabledChange: (enabled: boolean) => void;
  /** Selected template ID */
  templateId: string;
  onTemplateIdChange: (id: string) => void;
  /** Selected modalidad */
  modalidad: FCModalidad;
  onModalidadChange: (m: FCModalidad) => void;
  /** Selected PDF format */
  pdfFormat: FCPdfFormat;
  onPdfFormatChange: (f: FCPdfFormat) => void;
  /** Whether to show the template preview */
  showPreview?: boolean;
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function StoreTemplateSelector({
  fcAutoEnabled,
  onFcAutoEnabledChange,
  templateId,
  onTemplateIdChange,
  modalidad,
  onModalidadChange,
  pdfFormat,
  onPdfFormatChange,
  className,
}: StoreTemplateSelectorProps) {
  const t = useTranslations('stores');

  return (
    <div className={cn('col-span-full mt-2 pt-4 border-t border-border', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-primary/60" />
        <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">
          Plantilla de Ficha de Costo (FC)
        </span>
      </div>
      <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-4">
        Configure la plantilla predeterminada de FC para todos los productos de esta tienda. Resolución 148/2023 MFP.
      </p>

      {/* FC Auto-activación */}
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4 mb-4">
        <Label className="text-left sm:text-right font-black uppercase text-[10px] tracking-widest text-primary/70">
          Activar FC
        </Label>
        <div className="sm:col-span-3 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={fcAutoEnabled}
            aria-label="Activar Ficha de Costo automática"
            onClick={() => onFcAutoEnabledChange(!fcAutoEnabled)}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              fcAutoEnabled ? 'bg-primary' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
                fcAutoEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
          <span
            className={cn(
              'text-[10px] font-black uppercase tracking-widest',
              fcAutoEnabled ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            {fcAutoEnabled ? 'Activada' : 'Desactivada'}
          </span>
        </div>
      </div>

      {fcAutoEnabled && (
        <>
        <div className="fc-template-selector-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Modalidad Selector */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-primary/70 mb-1 block">
              Modalidad
            </label>
            <select
              value={modalidad}
              onChange={(e) => onModalidadChange(e.target.value as FCModalidad)}
              className="w-full h-9 px-3 rounded-lg border border-primary/10 bg-muted/20 text-sm font-bold focus:border-primary/30 focus:ring-1 focus:ring-primary outline-none cursor-pointer"
              aria-label="Modalidad de FC"
            >
              {FC_MODALIDADES.map((m) => (
                <option key={m} value={m}>
                  {FC_MODALIDAD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          {/* Template Selector */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-primary/70 mb-1 block">
              Plantilla FC
            </label>
            <select
              value={templateId}
              onChange={(e) => onTemplateIdChange(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-primary/10 bg-muted/20 text-sm font-bold focus:border-primary/30 focus:ring-1 focus:ring-primary outline-none cursor-pointer"
              aria-label="Plantilla de FC"
            >
              {FC_TEMPLATE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* PDF Format Selector */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-primary/70 mb-1 block">
              Formato PDF
            </label>
            <select
              value={pdfFormat}
              onChange={(e) => onPdfFormatChange(e.target.value as FCPdfFormat)}
              className="w-full h-9 px-3 rounded-lg border border-primary/10 bg-muted/20 text-sm font-bold focus:border-primary/30 focus:ring-1 focus:ring-primary outline-none cursor-pointer"
              aria-label="Formato PDF de FC"
            >
              {FC_PDF_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FC_PDF_FORMAT_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Visual Preview of selected template */}
        {templateId && TEMPLATE_PREVIEW[templateId] && (
          <div className={cn(
            'mt-4 p-3 rounded-lg border',
            TEMPLATE_PREVIEW[templateId].color,
          )}>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/80 border border-current/10 shrink-0">
                <span className="text-lg">{TEMPLATE_PREVIEW[templateId].icon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-3.5 h-3.5 text-primary/50 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">
                    Vista Previa
                  </span>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {TEMPLATE_PREVIEW[templateId].description}
                </p>
                <p className="text-[9px] text-muted-foreground mt-1">
                  Resolución 148/2023 MFP — Formato: {FC_PDF_FORMAT_LABELS[pdfFormat]}
                </p>
              </div>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
