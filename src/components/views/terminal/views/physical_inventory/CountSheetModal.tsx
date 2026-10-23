'use client';

/**
 * CountSheetModal — generación y previsualización de hojas de conteo en PDF.
 *
 * Modalidades (misión §5):
 *   - CON existencias teóricas: incluye la columna «Teórica» a la fecha de
 *     corte (solo roles autorizados en modo ciego — la RPC lo impide en BD).
 *   - CONTEO CIEGO: sin teóricas, sin diferencias, sin ningún indicador que
 *     permita deducirlas — ni en la previsualización ni en el PDF.
 *
 * Cada generación registra su versión en physical_inventory_sheets (auditoría)
 * y la previsualización usa el MISMO documento (bloburl + iframe).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, FileText, Download, Printer, Eye, EyeOff, RefreshCcw } from 'lucide-react';
import type { jsPDF } from 'jspdf';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { buildCountSheetPdf, countSheetFileName } from './pi-pdf';
import { PI_SCOPE_LABELS, type PIHeader, type PILine } from './pi-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pi: PIHeader;
  lines: PILine[];
  canSeeTheoretical: boolean;
}

type SheetMode = 'with_theoretical' | 'blind';

export const CountSheetModal: React.FC<Props> = ({ open, onOpenChange, pi, lines, canSeeTheoretical }) => {
  const [mode, setMode] = useState<SheetMode>(pi.blind_mode ? 'blind' : 'with_theoretical');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [sheetSeq, setSheetSeq] = useState<number | null>(null);
  const docRef = useRef<jsPDF | null>(null);
  const dataFingerprint = useRef<string>('');

  useEffect(() => {
    if (open) {
      setMode(pi.blind_mode ? 'blind' : 'with_theoretical');
      setPreviewUrl(null);
      setSheetSeq(null);
      dataFingerprint.current = '';
      docRef.current = null;
    }
  }, [open, pi.blind_mode]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const buildDoc = useCallback(async (): Promise<jsPDF> => {
    // 1. Registrar la versión en BD ANTES de generar (auditoría de versiones)
    const reg = await apiFetch<{ sheet_id: string; seq: number }>(`/api/physical-inventory/${pi.id}/sheet`, {
      method: 'POST',
      body: JSON.stringify({ mode, totalLines: lines.length, filterSummary: null }),
    });
    setSheetSeq(reg.seq);

    // 2. Construir el PDF (en ciego, las líneas ya vienen sin teóricas del
    //    servidor; además el builder NUNCA las pide en modo blind)
    const doc = await buildCountSheetPdf({
      piNumber: pi.pi_number || 'IF-?',
      storeName: pi.store?.name || 'Tienda',
      cutoffDate: pi.cutoff_date,
      mode,
      responsible: pi.responsible_name,
      scopeLabel: PI_SCOPE_LABELS[pi.scope_type],
      observations: pi.observations || null,
      sheetSeq: reg.seq,
      lines: lines.map((l) => ({
        line_number: l.line_number,
        sku: l.sku,
        name: l.name,
        unit: l.unit,
        // En ciego NUNCA se pasan teóricas aunque existieran en memoria
        theoretical_qty: mode === 'blind' ? undefined : l.theoretical_qty,
      })),
    });
    docRef.current = doc;
    dataFingerprint.current = `${pi.id}|${mode}|${lines.length}|${reg.seq}`;
    return doc;
  }, [mode, lines, pi]);

  const handlePreview = async () => {
    if (building) return;
    setBuilding(true);
    try {
      const doc = await buildDoc();
      const url = String(doc.output('bloburl'));
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    } catch (e) {
      toast.error('No se pudo generar la hoja', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBuilding(false);
    }
  };

  const handleDownload = async () => {
    if (building) return;
    setBuilding(true);
    try {
      let doc = docRef.current;
      if (!doc || dataFingerprint.current === '') {
        doc = await buildDoc();
      }
      doc.save(countSheetFileName(pi.pi_number || 'IF', mode));
    } catch (e) {
      toast.error('No se pudo descargar la hoja', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBuilding(false);
    }
  };

  const handlePrint = () => {
    if (previewUrl) {
      const w = window.open(previewUrl, '_blank');
      w?.addEventListener('load', () => { try { w.print(); } catch { /* noop */ } });
    }
  };

  const blindForced = pi.blind_mode && !canSeeTheoretical;
  const effectiveMode: SheetMode = blindForced ? 'blind' : mode;

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Hoja de conteo — {pi.pi_number}
        </span>
      }
      description="Previsualice antes de imprimir. Cada generación se registra como versión auditable."
      maxWidth="sm:max-w-4xl"
      footer={
        <div className="flex flex-col sm:flex-row gap-2">
          <SecondaryButton className="flex-1" onClick={handlePreview} disabled={building}>
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            {previewUrl ? 'Regenerar vista previa' : 'Generar vista previa'}
          </SecondaryButton>
          <PrimaryButton className="flex-1" onClick={handleDownload} disabled={building}>
            <Download className="h-4 w-4" /> Descargar PDF
          </PrimaryButton>
          <SecondaryButton className="flex-1" onClick={handlePrint} disabled={!previewUrl}>
            <Printer className="h-4 w-4" /> Imprimir
          </SecondaryButton>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Selección de modalidad */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={blindForced || building}
            onClick={() => { setMode('with_theoretical'); setPreviewUrl(null); docRef.current = null; }}
            className={cn(
              'flex min-h-[64px] flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
              effectiveMode === 'with_theoretical'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:bg-muted/50',
              blindForced && 'cursor-not-allowed opacity-50'
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-black">
              <Eye className="h-4 w-4" /> Con existencias teóricas
            </span>
            <span className="text-[10px] text-muted-foreground">
              Muestra la existencia a la fecha de corte. Requiere autorización en modo ciego.
            </span>
          </button>
          <button
            type="button"
            disabled={building}
            onClick={() => { setMode('blind'); setPreviewUrl(null); docRef.current = null; }}
            className={cn(
              'flex min-h-[64px] flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
              effectiveMode === 'blind'
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:bg-muted/50'
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-black">
              <EyeOff className="h-4 w-4" /> Conteo ciego
            </span>
            <span className="text-[10px] text-muted-foreground">
              Sin teóricas ni diferencias: quien cuenta no ve el saldo del sistema.
            </span>
          </button>
        </div>

        {blindForced && (
          <p className="rounded-xl border border-muted bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Este inventario es de conteo ciego y su rol no está autorizado a consultar existencias teóricas:
            solo puede generar la hoja ciega.
          </p>
        )}

        {sheetSeq !== null && (
          <p className="text-[10px] text-muted-foreground">
            Versión registrada: <b className="font-mono">#{sheetSeq}</b> — modo {effectiveMode === 'blind' ? 'ciego' : 'con teóricas'} · {lines.length} líneas.
          </p>
        )}

        {/* Previsualización fiel (mismo blob del PDF) */}
        {previewUrl ? (
          <iframe
            src={previewUrl}
            title={`Vista previa de la hoja de conteo ${pi.pi_number}`}
            className="h-[520px] w-full rounded-xl border border-border bg-white"
          />
        ) : (
          <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 text-center">
            {building ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
            ) : (
              <>
                <FileText className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  Pulse «Generar vista previa» para construir el documento antes de imprimirlo.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </BaseModal>
  );
};
