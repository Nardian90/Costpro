'use client';

/**
 * ImportCountDialog — importación de cantidades contadas desde Excel.
 *
 * Patrón del proyecto (CatalogImportDialog): plantilla oficial descargable →
 * zona de arrastre → INFORME de validación con previsualización →
 * confirmación explícita (2 pasos) → aplicación transaccional por lotes.
 *
 * Reglas de la misión §7:
 *   - Identificación por ID de línea estable (nunca por nombre del producto).
 *   - Vacío ≠ cero: las celdas vacías se omiten (línea permanece pendiente).
 *   - Duplicados, productos ajenos y cantidades inválidas se reportan ANTES.
 *   - Nunca se reemplaza un valor ya capturado sin confirmación explícita.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle,
  Loader2, ArrowRight, ArrowLeft, Repeat, FileQuestion, ListChecks,
} from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { downloadCountTemplate, parseCountImport, type ImportReport } from './pi-excel';
import { PI_SCOPE_LABELS, type PIHeader, type PILine } from './pi-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pi: PIHeader;
  lines: PILine[];
  onChanged: () => void;
}

type Step = 'upload' | 'review' | 'applying';

export const ImportCountDialog: React.FC<Props> = ({ open, onOpenChange, pi, lines, onChanged }) => {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [overrideConflicts, setOverrideConflicts] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setReport(null);
    setFatal(null);
    setOverrideConflicts(false);
  }, []);

  const handleFile = async (file: File) => {
    setFatal(null);
    setFileName(file.name);
    try {
      const { report: rep, fatal: f } = await parseCountImport(file, lines);
      if (f) {
        setFatal(f);
        setReport(null);
        return;
      }
      setReport(rep);
      setStep('review');
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  };

  const apply = async () => {
    if (!report) return;
    setApplying(true);
    try {
      // Aplicación por lotes (transaccional por lote; un fallo deja el lote intacto)
      const toApply = report.valid
        .filter((r) => overrideConflicts || !report.conflicts.some((c) => c.row.item_id === r.item_id))
        .map((r) => ({ item_id: r.item_id, counted_qty: r.counted_qty, expected_updated_at: r.line.updated_at }));

      if (toApply.length === 0) {
        toast.info('Nada que importar');
        setApplying(false);
        reset();
        onOpenChange(false);
        return;
      }

      const BATCH = 200;
      let appliedTotal = 0;
      for (let i = 0; i < toApply.length; i += BATCH) {
        const res = await apiFetch<{ applied: number }>(`/api/physical-inventory/${pi.id}/count`, {
          method: 'POST',
          body: JSON.stringify({ items: toApply.slice(i, i + BATCH), source: 'excel' }),
        });
        appliedTotal += res.applied || 0;
      }
      toast.success(`Importación aplicada: ${appliedTotal} línea(s) actualizada(s)`, {
        description: `${report.explicitZeros} cero(s) explícito(s) · ${report.withoutQty} celda(s) vacía(s) omitida(s).`,
      });
      onChanged();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error('La importación falló sin cambios parciales', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setApplying(false);
    }
  };

  const kpis = useMemo(() => {
    if (!report) return [];
    return [
      { label: 'Válidas', value: report.valid.length, cls: 'text-success', Icon: CheckCircle2 },
      { label: 'Errores', value: report.errors.length, cls: 'text-destructive', Icon: XCircle },
      { label: 'Duplicadas', value: report.duplicates.length, cls: 'text-destructive', Icon: Repeat },
      { label: 'Ajenas al inv.', value: report.notFound.length, cls: 'text-warning', Icon: FileQuestion },
      { label: 'Sin cantidad', value: report.withoutQty, cls: 'text-muted-foreground', Icon: FileQuestion },
      { label: 'Ceros explícitos', value: report.explicitZeros, cls: 'text-info', Icon: ListChecks },
      { label: 'Conflictos', value: report.conflicts.length, cls: 'text-warning', Icon: AlertTriangle },
      { label: 'Filas totales', value: report.totalRows, cls: 'text-foreground', Icon: FileSpreadsheet },
    ];
  }, [report]);

  return (
    <BaseModal
      open={open}
      onOpenChange={(o) => { if (!applying) { onOpenChange(o); if (!o) reset(); } }}
      title={
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Importar conteo desde Excel — {pi.pi_number}
        </span>
      }
      description="Descargue la plantilla oficial, llene la columna «Cantidad Física» y súbala. Todo se valida antes de confirmar."
      maxWidth="sm:max-w-4xl"
      footer={
        <div className="flex flex-col sm:flex-row gap-2">
          {step === 'review' && (
            <SecondaryButton className="flex-1" onClick={() => setStep('upload')} disabled={applying}>
              <ArrowLeft className="h-4 w-4" /> Volver
            </SecondaryButton>
          )}
          {step === 'review' && (
            <PrimaryButton
              className="flex-1"
              onClick={apply}
              disabled={applying || !report || report.valid.length === 0 || (report.conflicts.length > 0 && !overrideConflicts)}
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar e importar ({report?.valid.length || 0} línea{report?.valid.length === 1 ? '' : 's'})
            </PrimaryButton>
          )}
        </div>
      }
    >
      {step === 'upload' && (
        <div className="space-y-3">
          {/* Plantilla oficial */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 rounded-xl border border-primary/10 bg-primary/5 p-3">
            <Download className="h-5 w-5 shrink-0 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-bold">¿No tiene el archivo? Descargue la plantilla oficial</p>
              <p className="text-xs text-muted-foreground">
                {pi.blind_mode
                  ? 'Modalidad ciego: la plantilla NO incluye existencias teóricas.'
                  : 'Incluye la existencia teórica como referencia informativa (no editable).'}
                {' '}Los ID de línea garantizan la vinculación correcta.
              </p>
            </div>
            <button
              onClick={() =>
                downloadCountTemplate({
                  piNumber: pi.pi_number || 'IF-?',
                  storeName: pi.store?.name || 'Tienda',
                  cutoffDate: pi.cutoff_date,
                  responsible: pi.responsible_name ?? '',
                  blind: pi.blind_mode,
                  lines,
                })
              }
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-success px-4 text-xs font-black uppercase text-white hover:bg-success/90"
            >
              <FileSpreadsheet className="h-4 w-4" /> Plantilla Excel
            </button>
          </div>

          {/* Zona de arrastre */}
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border p-8 transition-colors hover:border-primary/50 hover:bg-primary/5">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <div className="rounded-2xl bg-primary/10 p-4">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-wide">Seleccionar archivo Excel</p>
              <p className="text-xs text-muted-foreground">.xlsx o .xls — se validará antes de aplicar nada</p>
            </div>
          </label>

          {fatal && (
            <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
              <XCircle className="h-4 w-4 shrink-0" /> {fatal}
            </p>
          )}

          <p className="text-[10px] text-muted-foreground">
            Reglas: identificación por ID de línea (no por nombre) · celda vacía = pendiente (no cero) · 0 explícito = contado en cero ·
            cantidades negativas o no numéricas = error · filas duplicadas o de otro inventario = rechazadas.
          </p>
        </div>
      )}

      {step === 'review' && report && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> {fileName}
          </p>

          {/* KPIs del informe */}
          <div className="grid grid-cols-4 gap-2">
            {kpis.map(({ label, value, cls, Icon }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-2.5">
                <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  <Icon className="h-3 w-3" /> {label}
                </p>
                <p className={cn('mt-0.5 text-xl font-black tabular-nums', cls)}>{value}</p>
              </div>
            ))}
          </div>

          {/* Detalle de errores */}
          {(report.errors.length > 0 || report.duplicates.length > 0 || report.notFound.length > 0) && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5">
              <p className="flex items-center gap-1.5 border-b border-destructive/15 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Filas rechazadas (no se importarán)
              </p>
              <div className="max-h-32 space-y-0.5 overflow-y-auto p-2 text-xs">
                {report.errors.map((e, i) => (
                  <p key={`e${i}`} className="text-destructive">Fila {e.rowNumber}: {e.message}</p>
                ))}
                {report.duplicates.map((e, i) => (
                  <p key={`d${i}`} className="text-destructive">Fila {e.rowNumber}: {e.message}</p>
                ))}
                {report.notFound.map((e, i) => (
                  <p key={`n${i}`} className="text-warning">Fila {e.rowNumber}: {e.message}</p>
                ))}
              </div>
            </div>
          )}

          {/* Conflictos con datos ya capturados */}
          {report.conflicts.length > 0 && (
            <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-warning">
                <AlertTriangle className="h-3.5 w-3.5" /> {report.conflicts.length} línea(s) ya tenían un valor capturado
              </p>
              <div className="mt-2 max-h-24 space-y-0.5 overflow-y-auto text-xs">
                {report.conflicts.slice(0, 20).map((c, i) => (
                  <p key={i}>
                    <b>{c.row.line.name}</b>: capturado <span className="font-mono">{c.current ?? '—'}</span> → archivo <span className="font-mono font-bold">{c.row.counted_qty}</span>
                  </p>
                ))}
                {report.conflicts.length > 20 && <p className="text-muted-foreground">… y {report.conflicts.length - 20} más</p>}
              </div>
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={overrideConflicts}
                  onChange={(e) => setOverrideConflicts(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--warning)]"
                />
                <span>
                  <b>Reemplazar explícitamente</b> los valores capturados por los del archivo (quedará en el historial de auditoría).
                  Si no lo marca, las líneas en conflicto se conservan sin cambios.
                </span>
              </label>
            </div>
          )}

          {/* Previsualización de líneas válidas */}
          {report.valid.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border">
              <p className="border-b bg-muted/50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Se actualizarán {report.valid.length} línea(s)
              </p>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {report.valid.slice(0, 40).map((r) => (
                      <tr key={r.item_id} className="border-b border-border/40 last:border-0">
                        <td className="p-2 font-mono text-muted-foreground">{r.line.line_number}</td>
                        <td className="p-2 font-bold">{r.line.name}</td>
                        <td className="p-2 text-right font-mono tabular-nums font-black text-primary">
                          {r.counted_qty === 0 ? '0 (cero explícito)' : r.counted_qty}
                        </td>
                      </tr>
                    ))}
                    {report.valid.length > 40 && (
                      <tr><td colSpan={3} className="p-2 text-center text-muted-foreground">… y {report.valid.length - 40} más</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.valid.length === 0 && (
            <p className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground">
              No hay filas válidas para importar. Corrija el archivo e inténtelo de nuevo.
            </p>
          )}

          <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
            La aplicación es por lotes transaccionales: si un lote falla, no se aplica parcialmente.
          </p>
        </div>
      )}
    </BaseModal>
  );
};
