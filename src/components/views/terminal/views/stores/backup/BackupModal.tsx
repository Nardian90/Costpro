'use client';

/**
 * @file BackupModal
 * @description Modal para exportar un respaldo de tienda en 3 formatos
 * (JSON, PDF, XLSX) y con filtros temporales (todo, año, mes).
 *
 * UX:
 *   - Selección de formato con cards visuales (icono + descripción + casos de uso)
 *   - Selección de rango temporal (segmented control)
 *   - Si rango = año/mes, mostrar pickers de año/mes
 *   - Botón "Descargar" dispara la descarga binaria
 *   - Loading state con spinner
 *   - Toast de éxito con conteo de registros + tamaño
 *
 * Mobile-first: layout en una sola columna, todos los touch targets ≥ 44px.
 */

import React, { useState, useMemo } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Download, FileJson, FileText, FileSpreadsheet, Loader2, ShieldCheck, AlertCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { logger } from '@/lib/logger';

interface BackupWarning {
  table: string;
  message: string;
  severity: 'warn' | 'error';
}

type BackupFormat = 'json' | 'pdf' | 'xlsx';
type BackupRange = 'all' | 'year' | 'month';

interface BackupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName: string;
}

const FORMAT_OPTIONS: ReadonlyArray<{
  value: BackupFormat;
  icon: React.ElementType;
  label: string;
  description: string;
  badge?: string;
}> = [
  {
    value: 'json',
    icon: FileJson,
    label: 'JSON',
    description: 'Restaurable. Preserva tipos, relaciones y UUIDs. Ideal para migraciones y respaldo completo.',
    badge: 'Recomendado',
  },
  {
    value: 'pdf',
    icon: FileText,
    label: 'PDF',
    description: 'Snapshot legible para archivo fiscal/contable. Solo lectura, no restaurable.',
  },
  {
    value: 'xlsx',
    icon: FileSpreadsheet,
    label: 'Excel',
    description: 'Una hoja por tabla. Filtrable y ordenable. Abre en Google Sheets / LibreOffice.',
  },
];

const RANGE_OPTIONS: ReadonlyArray<{ value: BackupRange; label: string; hint: string }> = [
  { value: 'all', label: 'Histórico completo', hint: 'Todos los registros de la tienda' },
  { value: 'year', label: 'Por año', hint: 'Ej: 2026 completo' },
  { value: 'month', label: 'Por mes', hint: 'Ej: Julio 2026' },
];

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function BackupModal({ open, onOpenChange, storeId, storeName }: BackupModalProps) {
  const [format, setFormat] = useState<BackupFormat>('json');
  const [range, setRange] = useState<BackupRange>('all');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [lastWarnings, setLastWarnings] = useState<BackupWarning[]>([]);

  const { token } = useAuthStore();

  // Available years: from 2020 to current year + 1 (in case of late exports)
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear + 1; y >= 2020; y--) years.push(y);
    return years;
  }, []);

  const canDownload = !isDownloading && (
    range === 'all' ||
    (range === 'year' && year) ||
    (range === 'month' && year && month)
  );

  async function handleDownload() {
    if (!canDownload) return;
    setIsDownloading(true);

    try {
      const params = new URLSearchParams({
        format,
        range,
      });
      if (range === 'year' || range === 'month') params.set('year', String(year));
      if (range === 'month') params.set('month', String(month));

      const url = `/api/stores/${storeId}/backup?${params.toString()}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          message = body.message || body.error || message;
        } catch { /* keep default */ }
        throw new Error(message);
      }

      // Extract metadata from headers (set by the API)
      const totalRecords = res.headers.get('X-Backup-Total-Records') || '?';
      const warningsCount = Number(res.headers.get('X-Backup-Warnings-Count') || '0');
      const warningsHeader = res.headers.get('X-Backup-Warnings') || '';
      const contentType = res.headers.get('Content-Type') || 'application/octet-stream';

      // Decode warnings from base64 header
      let warnings: BackupWarning[] = [];
      if (warningsHeader) {
        try {
          const decoded = atob(warningsHeader);
          warnings = JSON.parse(decoded) as BackupWarning[];
        } catch (e) {
          logger.warn('UI', 'BACKUP_WARNINGS_DECODE_FAILED', { error: String(e) });
        }
      }
      setLastWarnings(warnings);

      // Get filename from Content-Disposition
      const cd = res.headers.get('Content-Disposition') || '';
      const filenameMatch = cd.match(/filename="?([^";]+)"?/);
      const filename = filenameMatch
        ? filenameMatch[1]
        : `backup_${storeId}_${Date.now()}.${format}`;

      // Convert response to blob and trigger download
      const blob = await res.blob();
      const blobWithType = new Blob([blob], { type: contentType });
      const downloadUrl = URL.createObjectURL(blobWithType);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      const sizeKb = Math.round(blob.size / 1024);
      if (warnings.length > 0) {
        // Show a warning toast listing tables that failed
        const errorCount = warnings.filter(w => w.severity === 'error').length;
        const warnCount = warnings.filter(w => w.severity === 'warn').length;
        const summary = warnings.slice(0, 3).map(w => `${w.table}: ${w.message}`).join('\n');
        const moreSuffix = warnings.length > 3 ? `\n... y ${warnings.length - 3} más` : '';
        if (errorCount > 0) {
          toast.error(`Backup descargado con ${errorCount} error(es)`, {
            description: `${filename} · ${totalRecords} registros · ${sizeKb} KB\n\nTablas con problemas:\n${summary}${moreSuffix}`,
            duration: 10000,
          });
        } else {
          toast.warning(`Backup descargado con ${warnCount} advertencia(s)`, {
            description: `${filename} · ${totalRecords} registros · ${sizeKb} KB\n\n${summary}${moreSuffix}`,
            duration: 10000,
          });
        }
      } else {
        toast.success('Backup descargado', {
          description: `${filename} · ${totalRecords} registros · ${sizeKb} KB`,
        });
      }

      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      logger.error('UI', 'BACKUP_DOWNLOAD_FAILED', { storeId, format, range, error: message });
      toast.error('Error al descargar backup', { description: message });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Respaldo de tienda
        </span>
      }
      description={
        <span>
          Exporta los datos de <strong className="font-bold">{storeName}</strong> en el formato y rango que elijas.
        </span>
      }
      maxWidth="sm:max-w-2xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDownloading}
            className="min-h-[44px]"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={!canDownload}
            className="min-h-[44px] gap-2"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Descargar backup
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* ── Format selection ──────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">
            1. Formato
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {FORMAT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = format === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormat(opt.value)}
                  disabled={isDownloading}
                  aria-pressed={isActive}
                  className={cn(
                    'relative p-4 rounded-xl border-2 text-left transition-all min-h-[120px] flex flex-col gap-2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    isActive
                      ? 'border-primary bg-primary/5 shadow-md'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40',
                    isDownloading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Icon className={cn('w-6 h-6', isActive ? 'text-primary' : 'text-muted-foreground')} />
                    {opt.badge && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-success/15 text-success">
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  <p className="font-black text-sm uppercase tracking-wider">{opt.label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{opt.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Range selection ───────────────────────────────────────────────── */}
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">
            2. Alcance temporal
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {RANGE_OPTIONS.map((opt) => {
              const isActive = range === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRange(opt.value)}
                  disabled={isDownloading}
                  aria-pressed={isActive}
                  className={cn(
                    'p-3 rounded-xl border-2 text-left transition-all min-h-[68px] flex flex-col gap-1',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    isActive
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40',
                    isDownloading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <p className="font-black text-xs uppercase tracking-wider">{opt.label}</p>
                  <p className="text-[11px] text-muted-foreground">{opt.hint}</p>
                </button>
              );
            })}
          </div>

          {/* Year picker */}
          {range !== 'all' && (
            <div className="mt-3 flex flex-col sm:flex-row gap-3">
              <label className="flex-1 flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Año</span>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  disabled={isDownloading}
                  className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
              {range === 'month' && (
                <label className="flex-1 flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Mes</span>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    disabled={isDownloading}
                    className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>

        {/* ── Info banner ───────────────────────────────────────────────────── */}
        <div className="rounded-xl bg-muted/30 border border-border p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p className="font-bold mb-1 text-foreground">¿Qué incluye el respaldo?</p>
            <p>
              Productos, categorías, ventas, recibos, caja, movimientos de inventario,
              órdenes de producción, trabajadores, comisiones y pagos.
              {' '}
              {format === 'json' && 'Solo JSON es restaurable vía el botón "Importar".'}
              {format === 'pdf' && 'PDF es solo lectura (snapshot para archivo).'}
              {format === 'xlsx' && 'Excel es solo lectura (para análisis).'}
            </p>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
