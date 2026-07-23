'use client';

/**
 * @file RestoreBackupModal
 * @description Modal para importar un backup JSON a una tienda.
 *
 * Características:
 *   - Upload por drag & drop o selección manual
 *   - Validación inicial del archivo (extensión .json, tamaño ≤ 100 MB)
 *   - Previsualización del contenido (metadata: tienda origen, fecha, conteos)
 *   - Opción "Dry run" (simulación sin escribir) — recomendada para pruebas
 *   - Opción "Upsert" (default on): si un registro ya existe, lo actualiza;
 *     si off, lo salta
 *   - Tabla de resultados después de ejecutar: inserted/skipped/errors por tabla
 *
 * Seguridad:
 *   - Antes de ejecutar, el usuario debe escribir el nombre de la tienda
 *     destino para confirmar (previene clicks accidentales)
 *   - El backend reescribe store_id en cada fila (defensa en profundidad)
 *
 * Mobile-first: layout en una sola columna, touch targets ≥ 44px.
 */

import React, { useState, useRef, useCallback } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Upload, Loader2, AlertTriangle, FileJson, CheckCircle2, XCircle,
  Eye, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { logger } from '@/lib/logger';

interface RestoreBackupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName: string;
}

interface BackupMeta {
  format?: string;
  version?: string;
  storeName?: string;
  storeId?: string;
  exportedAt?: string;
  range?: string;
  totalRecords?: number;
  recordCounts?: Record<string, number>;
}

interface RestoreResult {
  success: boolean;
  dryRun: boolean;
  summary: {
    totalInserted: number;
    totalSkipped: number;
    errorsCount: number;
    durationMs: number;
  };
  inserted: Record<string, number>;
  skipped: Record<string, number>;
  errors: Array<{ table: string; message: string; sample?: unknown }>;
}

const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export function RestoreBackupModal({ open, onOpenChange, storeId, storeName }: RestoreBackupModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [meta, setMeta] = useState<BackupMeta | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [upsert, setUpsert] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);

  const { token } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setFileContent(null);
    setMeta(null);
    setParseError(null);
    setDryRun(true);
    setUpsert(true);
    setConfirmText('');
    setIsRunning(false);
    setResult(null);
  }, []);

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function parseFile(f: File) {
    setFile(f);
    setParseError(null);
    setMeta(null);
    setResult(null);
    setFileContent(null);

    if (!f.name.toLowerCase().endsWith('.json')) {
      setParseError('El archivo debe tener extensión .json');
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      setParseError(`Archivo demasiado grande: ${Math.round(f.size / 1024 / 1024)} MB. Máximo 100 MB.`);
      return;
    }

    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      if (!parsed.meta || parsed.meta.format !== 'costpro-store-backup') {
        setParseError('Formato de backup no reconocido. Se espera format=costpro-store-backup.');
        return;
      }
      setFileContent(text);
      setMeta(parsed.meta as BackupMeta);
    } catch (e) {
      setParseError(`JSON inválido: ${e instanceof Error ? e.message : 'parse error'}`);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void parseFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void parseFile(f);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  const canExecute =
    !!fileContent &&
    !!meta &&
    !isRunning &&
    confirmText.trim().toLowerCase() === storeName.trim().toLowerCase();

  async function handleExecute() {
    if (!canExecute || !fileContent) return;
    setIsRunning(true);
    setResult(null);

    try {
      const res = await fetch(`/api/stores/${storeId}/backup/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content: fileContent,
          upsert,
          dryRun,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }

      setResult(body as RestoreResult);

      const summary = body.summary || {};
      if (dryRun) {
        toast.success('Simulación completada', {
          description: `${summary.totalInserted ?? 0} registros se insertarían (sin cambios reales)`,
        });
      } else if (summary.errorsCount) {
        toast.warning('Restauración completada con errores', {
          description: `${summary.totalInserted ?? 0} insertados · ${summary.totalSkipped ?? 0} omitidos · ${summary.errorsCount} errores`,
        });
      } else {
        toast.success('Restauración completada', {
          description: `${summary.totalInserted ?? 0} insertados · ${summary.totalSkipped ?? 0} omitidos`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      logger.error('UI', 'BACKUP_RESTORE_FAILED', { storeId, error: message });
      toast.error('Error al restaurar', { description: message });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <BaseModal
      open={open}
      onOpenChange={handleOpenChange}
      title={
        <span className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-primary" />
          Importar respaldo
        </span>
      }
      description={
        <span>
          Restaura un backup JSON en <strong className="font-bold">{storeName}</strong>.
          {' '}Verifica siempre con "Simular" antes de aplicar cambios.
        </span>
      }
      maxWidth="sm:max-w-2xl"
      footer={
        result ? (
          <Button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="min-h-[44px]"
          >
            Cerrar
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isRunning}
              className="min-h-[44px]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleExecute}
              disabled={!canExecute}
              variant={dryRun ? 'outline' : 'destructive'}
              className="min-h-[44px] gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ejecutando...
                </>
              ) : dryRun ? (
                <>
                  <Eye className="w-4 h-4" />
                  Simular (dry-run)
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Restaurar (aplicar cambios)
                </>
              )}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {/* ── Result view (replaces form when result is set) ─────────────────── */}
        {result ? (
          <RestoreResultView result={result} />
        ) : (
          <>
            {/* ── File dropzone ──────────────────────────────────────────────── */}
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">
                1. Selecciona el archivo
              </h3>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
                className={cn(
                  'rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all min-h-[140px] flex flex-col items-center justify-center gap-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-muted/40',
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileInput}
                  className="hidden"
                />
                {file ? (
                  <>
                    <FileJson className="w-8 h-8 text-primary" />
                    <p className="text-sm font-bold">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{Math.round(file.size / 1024)} KB</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm font-bold">Arrastra un archivo .json o haz clic para seleccionar</p>
                    <p className="text-xs text-muted-foreground">Máximo 100 MB</p>
                  </>
                )}
              </div>

              {/* Parse errors */}
              {parseError && (
                <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/30 p-3 flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive font-bold">{parseError}</p>
                </div>
              )}
            </div>

            {/* ── Metadata preview ───────────────────────────────────────────── */}
            {meta && (
              <div className="rounded-xl bg-muted/30 border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <p className="text-sm font-black uppercase tracking-widest">Backup válido</p>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="font-bold text-muted-foreground">Tienda origen</dt>
                    <dd className="font-bold">{meta.storeName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-muted-foreground">Exportado</dt>
                    <dd className="font-bold">{meta.exportedAt ? new Date(meta.exportedAt).toLocaleString('es-CU') : '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-muted-foreground">Alcance</dt>
                    <dd className="font-bold capitalize">{meta.range || 'all'}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-muted-foreground">Total registros</dt>
                    <dd className="font-bold">{meta.totalRecords ?? '?'}</dd>
                  </div>
                </dl>
                {meta.recordCounts && (
                  <details className="mt-3">
                    <summary className="text-xs font-bold uppercase tracking-widest text-muted-foreground cursor-pointer">
                      Ver desglose por tabla
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                      {Object.entries(meta.recordCounts).map(([t, n]) => (
                        <div key={t} className="flex justify-between">
                          <span className="text-muted-foreground">{t}</span>
                          <span className="font-bold tabular-nums">{n}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* ── Options ────────────────────────────────────────────────────── */}
            {fileContent && (
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">
                  2. Opciones
                </h3>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/30">
                    <input
                      type="checkbox"
                      checked={dryRun}
                      onChange={(e) => setDryRun(e.target.checked)}
                      className="mt-0.5 w-5 h-5 accent-primary shrink-0"
                    />
                    <div>
                      <p className="text-sm font-bold flex items-center gap-2">
                        <Eye className="w-3.5 h-3.5" />
                        Simular primero (dry-run)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Recomendado. Muestra qué se insertaría sin tocar la base de datos.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/30">
                    <input
                      type="checkbox"
                      checked={upsert}
                      onChange={(e) => setUpsert(e.target.checked)}
                      className="mt-0.5 w-5 h-5 accent-primary shrink-0"
                    />
                    <div>
                      <p className="text-sm font-bold">Actualizar existentes (upsert)</p>
                      <p className="text-xs text-muted-foreground">
                        Si un registro con el mismo ID ya existe, lo actualiza. Si está desactivado, lo salta.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* ── Confirmation ───────────────────────────────────────────────── */}
            {fileContent && !dryRun && (
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">
                  3. Confirmación
                </h3>
                <div className="rounded-xl bg-destructive/5 border border-destructive/30 p-3 mb-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">
                    Vas a <strong>modificar</strong> los datos de <strong>{storeName}</strong>.
                    Esto puede sobreescribir registros existentes.
                    Haz una prueba con "Simular" primero.
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-800 p-3 mb-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    <strong>Tablas con triggers contables</strong> (stock_movements, inventory_adjustments)
                    pueden fallar al restaurar sobre una tienda con datos existentes, porque los
                    triggers impiden stock negativo o doble registro. Para restauración completa,
                    considera primero reiniciar la tienda y luego importar.
                  </p>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Escribe el nombre de la tienda para confirmar: <strong className="text-foreground">{storeName}</strong>
                  </span>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={storeName}
                    className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                  />
                </label>
              </div>
            )}
          </>
        )}
      </div>
    </BaseModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RestoreResultView — sub-component
// ─────────────────────────────────────────────────────────────────────────────

function RestoreResultView({ result }: { result: RestoreResult }) {
  const hasErrors = result.summary.errorsCount > 0;
  const isPartialSuccess = result.summary.totalInserted > 0 && hasErrors;

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div
        className={cn(
          'rounded-xl p-4 border flex items-start gap-3',
          hasErrors && result.summary.totalInserted === 0
            ? 'bg-destructive/10 border-destructive/30'
            : isPartialSuccess
              ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
              : 'bg-success/10 border-success/30',
        )}
      >
        {hasErrors && result.summary.totalInserted === 0 ? (
          <XCircle className="w-6 h-6 text-destructive shrink-0" />
        ) : isPartialSuccess ? (
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
        ) : (
          <CheckCircle2 className="w-6 h-6 text-success shrink-0" />
        )}
        <div className="flex-1">
          <p className="font-black text-sm">
            {result.dryRun ? 'Simulación completada' : 'Restauración completada'}
            {isPartialSuccess && ' (con errores parciales)'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {result.summary.totalInserted} insertados · {result.summary.totalSkipped} omitidos ·{' '}
            {result.summary.errorsCount} errores · {Math.round(result.summary.durationMs / 1000)}s
          </p>
        </div>
      </div>

      {/* Per-table breakdown */}
      <div>
        <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
          Detalle por tabla
        </h4>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left font-black uppercase tracking-widest p-2">Tabla</th>
                <th className="text-right font-black uppercase tracking-widest p-2">Insertados</th>
                <th className="text-right font-black uppercase tracking-widest p-2">Omitidos</th>
                <th className="text-right font-black uppercase tracking-widest p-2">Errores</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys({ ...result.inserted, ...result.skipped }).map((table) => {
                const ins = result.inserted[table] || 0;
                const skp = result.skipped[table] || 0;
                const errCount = result.errors.filter((e) => e.table === table).length;
                return (
                  <tr key={table} className="border-t border-border/50">
                    <td className="p-2 font-mono">{table}</td>
                    <td className="p-2 text-right tabular-nums font-bold text-success">{ins}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{skp}</td>
                    <td className={cn('p-2 text-right tabular-nums', errCount ? 'font-bold text-destructive' : 'text-muted-foreground')}>
                      {errCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Errors */}
      {result.errors.length > 0 && (
        <div>
          <h4 className="text-xs font-black uppercase tracking-widest text-destructive mb-2">
            Errores ({result.errors.length})
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {result.errors.slice(0, 50).map((e, i) => (
              <div key={i} className="rounded-lg bg-destructive/5 border border-destructive/20 p-2 text-xs">
                <p className="font-bold text-destructive">{e.table}</p>
                <p className="text-muted-foreground">{e.message}</p>
              </div>
            ))}
            {result.errors.length > 50 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                ... y {result.errors.length - 50} más
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
