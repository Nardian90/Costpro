'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Package, Shuffle, Download, AlertTriangle, CheckCircle2, ImageOff } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { PrimaryButton, SecondaryButton } from '@/components/ui/atomic';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  renderTelegramProductImages,
  type RenderedTelegramImageWithError,
  type RenderTelegramImageOptions,
} from '@/lib/telegram/telegram-image-renderer';
import type { ProductPresentationInput } from '@/lib/storefront/product-presentation';

/**
 * ExportTelegramCatalogModal
 *
 * Lets the user export a ZIP of JPGs (one per product) that visually
 * match what the Telegram auto-publisher would send.
 *
 * Reuses:
 *   - renderTelegramProductImages() — the SAME generator used for the
 *     Telegram publish design.
 *
 * Selection modes:
 *   - "todos" → all eligible products
 *   - "random" → N random unique products
 *
 * Output:
 *   - ZIP containing one JPG per product
 *   - Filenames: {NN}-{slug}.jpg where NN is the index (avoids overwrites)
 *   - Sanitized for Windows/macOS/Linux
 */

export interface ExportTelegramCatalogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Eligible products (already filtered: is_active=true, visible_en_tienda=true). */
  products: ProductPresentationInput[];
  /** Store ID (for filename prefix). */
  storeId: string;
  /** Optional Telegram message options (show_price, show_physical_units). */
  telegramOptions?: RenderTelegramImageOptions;
}

type SelectionMode = 'todos' | 'random';
type Stage = 'config' | 'rendering' | 'done' | 'error';

export function ExportTelegramCatalogModal({
  open,
  onOpenChange,
  products,
  storeId,
  telegramOptions = {},
}: ExportTelegramCatalogModalProps) {
  const [mode, setMode] = useState<SelectionMode>('todos');
  const [randomCount, setRandomCount] = useState<string>('10');
  const [stage, setStage] = useState<Stage>('config');
  const [progress, setProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [results, setResults] = useState<RenderedTelegramImageWithError[] | null>(null);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const abortRef = useRef(false);

  const totalProducts = products.length;
  const randomCountNum = parseInt(randomCount, 10) || 0;
  const tooMany = mode === 'random' && randomCountNum > totalProducts;
  const canExport = totalProducts > 0 && !tooMany && (mode === 'todos' || randomCountNum > 0);

  const reset = useCallback(() => {
    abortRef.current = true;
    setStage('config');
    setProgress(null);
    setResults(null);
    setZipBlob(null);
  }, []);

  const handleExport = useCallback(async () => {
    if (!canExport) return;

    // Build the selected products list
    let selected: ProductPresentationInput[];
    if (mode === 'todos') {
      selected = [...products];
    } else {
      // Random unique sampling — Fisher-Yates shuffle + take first N
      const shuffled = [...products];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      selected = shuffled.slice(0, Math.min(randomCountNum, totalProducts));
    }

    abortRef.current = false;
    setStage('rendering');
    setProgress({ current: 0, total: selected.length, name: '' });
    setResults(null);
    setZipBlob(null);

    try {
      const renderResults = await renderTelegramProductImages(
        selected,
        telegramOptions,
        (p) => {
          if (abortRef.current) return;
          setProgress({ current: p.current, total: p.total, name: p.productName });
        },
      );

      if (abortRef.current) return;

      setResults(renderResults);

      // Build ZIP
      const zip = new JSZip();
      const folderName = `catalogo-telegram-${new Date().toISOString().slice(0, 10)}`;
      const folder = zip.folder(folderName);
      if (!folder) throw new Error('No se pudo crear la carpeta del ZIP');

      const usedFilenames = new Set<string>();
      let successCount = 0;

      for (let i = 0; i < renderResults.length; i++) {
        const r = renderResults[i];
        if (!r.ok || !r.image) continue;
        successCount++;

        // Build unique filename: 001-slug.jpg
        const idx = String(i + 1).padStart(3, '0');
        const slug = r.image.filename || 'producto';
        let filename = `${idx}-${slug}.jpg`;
        // Guard against duplicate names (shouldn't happen with index prefix, but be safe)
        let dupCount = 1;
        while (usedFilenames.has(filename)) {
          filename = `${idx}-${slug}-${dupCount}.jpg`;
          dupCount++;
        }
        usedFilenames.add(filename);

        // Convert data URL to binary
        const base64 = r.image.dataUrl.split(',')[1];
        if (!base64) continue;
        folder.file(filename, base64, { base64: true });
      }

      if (successCount === 0) {
        setStage('error');
        toast.error('No se pudo generar ninguna imagen');
        return;
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      setZipBlob(blob);
      setStage('done');
      toast.success(`${successCount} imágenes generadas correctamente`);
    } catch (e: any) {
      setStage('error');
      toast.error(`Error al generar: ${e?.message ?? String(e)}`);
    }
  }, [canExport, mode, products, randomCountNum, totalProducts, telegramOptions]);

  const handleDownload = useCallback(() => {
    if (!zipBlob) return;
    const filename = `catalogo-telegram-${storeId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.zip`;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [zipBlob, storeId]);

  const successCount = results?.filter((r) => r.ok).length ?? 0;
  const failCount = results?.filter((r) => !r.ok).length ?? 0;
  const failItems = results?.filter((r) => !r.ok) ?? [];

  return (
    <BaseModal open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }} title="Exportar catálogo (formato Telegram)" maxWidth="sm:max-w-lg">
      <div className="space-y-4">
        {stage === 'config' && (
          <>
            {/* Eligible products info */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-start gap-3">
              <Package className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black uppercase tracking-widest">
                  {totalProducts} producto{totalProducts !== 1 ? 's' : ''} elegible{totalProducts !== 1 ? 's' : ''}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Solo se incluyen productos activos visibles en la vitrina (las mismas reglas
                  que usa la publicación automática de Telegram).
                </p>
              </div>
            </div>

            {totalProducts === 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-start gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-xs">No hay productos elegibles para exportar.</p>
              </div>
            )}

            {/* Selection mode */}
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-widest">Selección</p>
              <button
                type="button"
                onClick={() => setMode('todos')}
                disabled={totalProducts === 0}
                className={cn(
                  'w-full p-3 rounded-xl border text-left transition-colors',
                  mode === 'todos' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <Package className={cn('w-4 h-4', mode === 'todos' && 'text-primary')} />
                  <span className="text-xs font-black uppercase tracking-widest">Todos los productos</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Exporta {totalProducts} producto{totalProducts !== 1 ? 's' : ''} en JPG individuales.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('random')}
                disabled={totalProducts === 0}
                className={cn(
                  'w-full p-3 rounded-xl border text-left transition-colors',
                  mode === 'random' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <Shuffle className={cn('w-4 h-4', mode === 'random' && 'text-primary')} />
                  <span className="text-xs font-black uppercase tracking-widest">Cantidad aleatoria</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Selecciona N productos al azar (sin repetir).
                </p>
              </button>
            </div>

            {/* Random count input */}
            <AnimatePresence>
              {mode === 'random' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1 p-2">
                    <label className="text-[10px] font-black uppercase tracking-widest">Cantidad</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={totalProducts}
                        value={randomCount}
                        onChange={(e) => setRandomCount(e.target.value)}
                        className="w-24 text-sm font-bold p-2 rounded-lg border border-border bg-background"
                        placeholder="10"
                      />
                      <span className="text-xs text-muted-foreground">de {totalProducts} disponibles</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {[5, 10, 20, 50].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRandomCount(String(n))}
                          disabled={n > totalProducts}
                          className="px-2 py-1 text-[10px] font-bold uppercase rounded-md border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    {tooMany && (
                      <p className="text-[10px] text-red-600 mt-1">
                        ⚠ Solo hay {totalProducts} productos disponibles. Solicitaste {randomCountNum}.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Design note */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-[10px] text-muted-foreground">
              <p>
                <strong className="text-foreground">Diseño idéntico a Telegram:</strong>{' '}
                Cada JPG utiliza el mismo diseño que la publicación automática (imagen del
                producto + nombre + descripción + precio/stock si Vitrina lo permite).
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <SecondaryButton onClick={() => onOpenChange(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={handleExport} disabled={!canExport}>
                Generar ZIP
              </PrimaryButton>
            </div>
          </>
        )}

        {stage === 'rendering' && progress && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-xs font-black uppercase tracking-widest">
                Generando {progress.current} de {progress.total}…
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              {progress.name}
            </p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {Math.round((progress.current / progress.total) * 100)}%
            </p>
          </div>
        )}

        {stage === 'done' && results && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-200">
                  {successCount} imágenes generadas correctamente
                </p>
                {failCount > 0 && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                    {failCount} producto{failCount !== 1 ? 's' : ''} con error (ver detalles abajo)
                  </p>
                )}
              </div>
            </div>

            {/* Errors list (if any) */}
            {failCount > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-200 mb-1">
                  Errores
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {failItems.map((r) => (
                    <div key={r.product.id} className="text-[10px] text-amber-900 dark:text-amber-100">
                      <span className="font-bold truncate">{r.product.name}</span>: {r.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <SecondaryButton onClick={reset}>Generar otro</SecondaryButton>
              <PrimaryButton onClick={handleDownload} disabled={successCount === 0}>
                <Download className="w-4 h-4 mr-1" />
                Descargar ZIP ({successCount} JPG{successCount !== 1 ? 's' : ''})
              </PrimaryButton>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-4 flex items-start gap-3">
              <ImageOff className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-red-800 dark:text-red-200">
                  Error al generar imágenes
                </p>
                <p className="text-[10px] text-red-700 dark:text-red-300 mt-1">
                  Revisa la consola para más detalles. Puede ser por problemas de CORS en las imágenes.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <SecondaryButton onClick={reset}>Reintentar</SecondaryButton>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
