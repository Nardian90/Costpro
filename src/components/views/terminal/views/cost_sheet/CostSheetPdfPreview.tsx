'use client';

/**
 * CostSheetPdfPreview — Vista «Vistazo» de la sección Fichas de Costo.
 * @description FC-VISTAZO (misión 2026-11-13 — «Fichas de Costo: auditoría
 * integral»).
 *
 * ANTES el modo 'preview' era un dead-end: `CostSheetView` no tenía rama de
 * render para viewMode==='preview' y `CostSheetPreview` (HTML) era código
 * muerto inalcanzable (`isEditing` nunca pasaba a false). Seleccionar
 * «Vistazo» dejaba el área de contenido en blanco.
 *
 * AHORA «Vistazo» muestra una representación REAL del documento exportable:
 * genera el PDF en el navegador con `generateCostSheetPDF` — EL MISMO MOTOR
 * que usa «Exportar PDF» (CostSheetExportModal → handleExportPDF) — y lo
 * presenta en un iframe (blob URL). Coherencia garantizada (misión §3.2):
 * lo que se ve en el Vistazo es exactamente lo que se descarga, incluido el
 * formato seleccionado (las mismas 10 alternativas del selector de export).
 *
 * El selector de formato solo cambia la PRESENTACIÓN (misión §3.1): no
 * recalcula, no toca la ficha, no persiste nada.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, Download, Edit, FileStack, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { generateCostSheetPDF } from '@/lib/export/pdf-generator';
import { PDF_FORMATS_META, defaultExportOptions, type PDFFormat } from '@/lib/export/pdf-export-types';
import type { CostSheetData } from '@/types/cost-sheet';
import type { CalculationResult } from '@/lib/cost-engine/types';

interface CostSheetPdfPreviewProps {
  /** Ficha en edición (store Zustand) */
  data: CostSheetData | null;
  calculatedValues: { [key: string]: any };
  calculatedHeader: any | null;
  calculatedAnnexes: any[];
  calculationResult: CalculationResult | null;
  /** Abre CostSheetExportModal — el MISMO mecanismo de exportación que el
   *  botón Exportar PDF de la barra (coherencia preview ↔ export). */
  onOpenExportModal: () => void;
  /** Vuelve al editor (modo experto). */
  onBackToEditor: () => void;
  className?: string;
}

export function CostSheetPdfPreview({
  data,
  calculatedValues,
  calculatedHeader,
  calculatedAnnexes,
  calculationResult,
  onOpenExportModal,
  onBackToEditor,
  className,
}: CostSheetPdfPreviewProps) {
  const [pdfFormat, setPdfFormat] = useState<PDFFormat>('standard');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs de datos inestables: la generación lee el estado vigente sin
  // re-dispararse en cada recálculo de la ficha (regenera SOLO al cambiar de
  // formato o al pulsar Actualizar — datos frescos en cada generación).
  const dataRef = useRef(data);
  const calcValuesRef = useRef(calculatedValues);
  const calcHeaderRef = useRef(calculatedHeader);
  const calcAnnexesRef = useRef(calculatedAnnexes);
  const calcResultRef = useRef(calculationResult);
  useEffect(() => { dataRef.current = data; });
  useEffect(() => { calcValuesRef.current = calculatedValues; });
  useEffect(() => { calcHeaderRef.current = calculatedHeader; });
  useEffect(() => { calcAnnexesRef.current = calculatedAnnexes; });
  useEffect(() => { calcResultRef.current = calculationResult; });

  const generatePreview = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      // Un respiro para que el overlay de carga renderice antes del trabajo pesado
      await new Promise(r => setTimeout(r, 60));

      const doc = await generateCostSheetPDF({
        data: dataRef.current,
        options: defaultExportOptions(pdfFormat),
        calculatedValues: calcValuesRef.current,
        calculatedHeader: calcHeaderRef.current,
        calculatedAnnexes: calcAnnexesRef.current,
        calculationResult: calcResultRef.current,
      });

      // Mismo motor → misma salida que la exportación (blob en vez de save)
      const url = doc.output('bloburl') as unknown as string;
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [pdfFormat]);

  // Genera al montar y al cambiar de formato (incluye el primer render)
  useEffect(() => {
    void generatePreview();
    // Limpieza del blob al desmontar
    return () => {
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [generatePreview]);

  const handleFormatChange = useCallback((format: PDFFormat) => {
    setPdfFormat(prev => (prev === format ? prev : format));
    // generatePreview es dep de este efecto vía pdfFormat → regenera solo
  }, []);

  return (
    <div className={cn('animate-in fade-in duration-500 flex flex-col gap-3', className)} data-testid="cost-sheet-pdf-preview">
      {/* Barra superior: título + acciones */}
      <div className="max-w-6xl w-full mx-auto flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-muted/30 p-3 rounded-2xl">
        <div className="flex items-center gap-3 px-2">
          <FileStack className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
            Vistazo — vista previa del documento exportable
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onBackToEditor}
            aria-label="Volver al editor de la ficha"
            className="text-muted-foreground hover:text-primary font-bold uppercase tracking-widest text-xs h-11 px-4 rounded-xl"
          >
            <Edit className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
            Volver al Editor
          </Button>
          <Button
            size="sm"
            type="button"
            onClick={onOpenExportModal}
            aria-label="Exportar PDF con el mismo mecanismo de exportación"
            className="h-11 px-4 rounded-xl font-bold uppercase tracking-widest text-xs"
          >
            <Download className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Selector de formato — las mismas 10 alternativas del selector de
          exportación; cambia la presentación, no los cálculos (§3.1). */}
      <div className="max-w-6xl w-full mx-auto flex flex-col sm:flex-row sm:items-center gap-2">
        <label
          htmlFor="cost-sheet-preview-format"
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0"
        >
          <FileStack className="size-3.5" aria-hidden="true" />
          Formato
        </label>
        <select
          id="cost-sheet-preview-format"
          data-testid="cost-sheet-preview-format"
          value={pdfFormat}
          onChange={(e) => handleFormatChange(e.target.value as PDFFormat)}
          disabled={isGenerating}
          className="h-11 w-full sm:max-w-[300px] bg-muted/20 border border-primary/10 focus:border-primary/30 transition-all font-bold rounded-lg px-3 text-sm"
        >
          {PDF_FORMATS_META.map(f => (
            <option key={f.id} value={f.id}>{f.label} — {f.description}</option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground/80 hidden sm:block">
          La vista previa y el PDF exportado usan el mismo formato y motor de generación.
        </p>
      </div>

      {/* Área del documento */}
      <div className="relative w-full max-w-6xl mx-auto min-h-[400px] md:min-h-[600px] rounded-2xl border border-border bg-white overflow-hidden">
        {isGenerating && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm">
            <Loader2 className="size-10 animate-spin text-primary" />
            <p className="text-sm font-bold text-muted-foreground">Generando vista previa…</p>
          </div>
        )}
        {error ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center p-6">
            <div className="rounded-full bg-destructive/10 p-4">
              <AlertCircle className="size-10 text-destructive" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No se pudo generar la vista previa</p>
              <p className="text-xs text-muted-foreground max-w-sm break-words">{error}</p>
            </div>
            <Button variant="outline" onClick={() => void generatePreview()} className="min-h-[44px]">
              <RotateCw className="size-4" />
              Reintentar
            </Button>
          </div>
        ) : (
          <iframe
            src={blobUrl || ''}
            className="w-full h-full min-h-[400px] md:min-h-[600px] border-0"
            title="Vista previa del PDF de la Ficha de Costos"
            data-testid="cost-sheet-preview-iframe"
          />
        )}
      </div>
    </div>
  );
}

export default CostSheetPdfPreview;
