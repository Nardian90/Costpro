'use client';

/**
 * LISTADO DE PRECIOS (misión CP-SALES-PRICE-LIST-001).
 *
 * Vista canónica ÚNICA (viewId `listado-precios`, bajo OPERACIÓN → Ventas,
 * inmediatamente después de «Vender»). Herramienta de CONSULTA y
 * presentación documental: no modifica productos, inventarios ni precios.
 *
 * Arquitectura (patrón IPV — configuración ≠ cálculo):
 *  · Nada se consulta ni genera hasta pulsar «Generar vista previa».
 *  · UNA fuente de generación: `buildDoc()` (modelo puro + renderPriceListPdf)
 *    alimenta el iframe de previsualización (`doc.output('bloburl')`) y la
 *    exportación (`doc.save`) — el PDF previsualizado es EXACTAMENTE el
 *    exportado (mismos productos, precios, orden, filtros y fecha).
 *  · Caché por firma: re-previsualizar sin cambios es gratis; cambiar los
 *    filtros tras generar marca la vista previa «desactualizada» (badge) y
 *    NO regenera automáticamente nada por campo.
 *  · Datos: usePriceListProducts (RPC get_products_for_pos, tienda activa,
 *    RLS) + modelo puro (stock > 0, orden SKU numérico→alfanumérico).
 *
 * Accesibilidad (WCAG 2.2 AA): labels asociados, aria-live del estado,
 * targets táctiles ≥44px, mensajes con icono+texto (no solo color).
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Tags, FileDown, RefreshCw, Store as StoreIcon, AlertTriangle, FileText, X, Info } from 'lucide-react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePriceListProducts, fetchPriceListStoreInfo } from '@/hooks/api/usePriceListProducts';
import { parseSkuRange } from '@/lib/price-list/sku-order';
import { buildPriceListModel, type PriceListModel, type PriceListStoreInfo } from '@/lib/price-list/model';
import {
  applyOperationalPriceFilter,
  isNeutralOperationalFilter,
  operationalFilterLabel,
  UNCLASSIFIED_FILTER,
  type OperationalPriceFilter,
  type PriceClassSelection,
  type PricePriceStatus,
} from '@/lib/price-list/operational-filters';
import { OPERATIONAL_CLASS_OPTIONS, UNCLASSIFIED_LABEL } from '@/lib/product-operational-class';
import { renderPriceListPdf, priceListFileName } from '@/lib/price-list/pdf';
import { cn } from '@/lib/utils';

const touch = 'min-h-[44px]';

interface AppliedPreview {
  signature: string;
  url: string;
  model: PriceListModel;
  generatedAt: Date;
}

/** Rango aplicado como texto para el resumen («1–50», «desde 10», «hasta 50», «Sin rango»). */
function rangeLabel(from: bigint | null, to: bigint | null): string {
  if (from === null && to === null) return 'Sin rango';
  if (from !== null && to !== null) return `${from}–${to}`;
  if (from !== null) return `Desde ${from}`;
  return `Hasta ${to}`;
}

export default function PriceListView() {
  const user = useAuthStore((s) => s.user);
  const activeStoreId = user?.activeStoreId ?? '';

  // ── Datos (solo lectura; la consulta espera la acción del usuario) ────────
  const productsQuery = usePriceListProducts(activeStoreId);

  // ── Configuración de filtros (no dispara cálculo) ────────────────────────
  const [skuFrom, setSkuFrom] = useState('');
  const [skuTo, setSkuTo] = useState('');
  // CP-OPERATIONAL-CLASS-001 (§3-§5): filtro de Clasificación operativa
  // (multi-select: sin selección = Todas; «Sin clasificar» es un valor más
  // del conjunto — marcarlo SOLO muestra los pendientes) + Estado del
  // precio. Se combinan entre sí y con el rango de SKU.
  const [selClasses, setSelClasses] = useState<PriceClassSelection[]>([]);
  const [priceStatus, setPriceStatus] = useState<PricePriceStatus>('all');

  const opFilter = useMemo<OperationalPriceFilter>(
    () => ({ classes: selClasses, priceStatus }),
    [selClasses, priceStatus],
  );
  const opFilterActive = !isNeutralOperationalFilter(opFilter);
  const opFilterText = operationalFilterLabel(opFilter);

  const toggleClass = useCallback((value: PriceClassSelection) => {
    setSelClasses((prev) => (prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]));
  }, []);
  const clearClassFilters = useCallback(() => setSelClasses([]), []);

  // Contador EN VIVO (misión §5): dataset completo de la tienda con el
  // criterio de inclusión vigente (stock>0, activo) + filtros operativos.
  // Responde al instante, sin necesidad de generar la vista previa.
  const liveCount = useMemo(
    () => applyOperationalPriceFilter(
      (productsQuery.data ?? []).filter((i) => i.is_active !== false && (i.stock_current ?? 0) > 0),
      opFilter,
    ).length,
    [productsQuery.data, opFilter],
  );

  // ── Estado de la vista previa ─────────────────────────────────────────────
  const [preview, setPreview] = useState<AppliedPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const buildingRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);

  // ── Tienda activa (identidad institucional) ───────────────────────────────
  const [storeInfo, setStoreInfo] = useState<PriceListStoreInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!activeStoreId) {
      setStoreInfo(null);
      return;
    }
    fetchPriceListStoreInfo(activeStoreId).then((info) => {
      if (!cancelled) setStoreInfo(info);
    });
    return () => { cancelled = true; };
  }, [activeStoreId]);

  // Validación del rango (pura, compartida con los tests).
  const rangeValidation = useMemo(() => parseSkuRange(skuFrom, skuTo), [skuFrom, skuTo]);
  const rangeInvalid = !rangeValidation.ok;
  const rangeError = rangeInvalid ? rangeValidation.error : null;
  const range = rangeInvalid ? null : rangeValidation;
  const rangeActive = !!range && (range.from !== null || range.to !== null);

  // La vista previa queda DESACTUALIZADA si los filtros cambian tras generar
  // (incluye clasificación operativa y estado del precio).
  const previewSignature = `${activeStoreId}|${skuFrom.trim()}|${skuTo.trim()}|${selClasses.join(',')}|${priceStatus}`;
  const stale = !!preview && preview.signature !== previewSignature;

  const clearFilters = useCallback(() => {
    setSkuFrom('');
    setSkuTo('');
    setSelClasses([]);
    setPriceStatus('all');
  }, []);

  const handleGeneratePreview = useCallback(async () => {
    if (buildingRef.current || rangeInvalid || !storeInfo || loading) return;
    buildingRef.current = true;
    setLoading(true);
    try {
      const generatedAt = new Date();
      const model = buildPriceListModel({
        items: productsQuery.data ?? [],
        store: storeInfo,
        range: rangeActive ? range : null,
        generatedAt,
        // CP-OPERATIONAL-CLASS-001: el PDF previsualizado/exportado usa los
        // MISMOS filtros que la pantalla (un solo pipeline).
        operationalFilter: opFilter,
      });
      if (model.meta.totalProducts === 0) {
        toast.info('No hay productos que cumplan las condiciones (stock > 0 con los filtros de clasificación, precio y rango de SKU indicados).');
        return;
      }
      const doc = await renderPriceListPdf(model);
      const url = String(doc.output('bloburl'));
      const old = previewUrlRef.current;
      previewUrlRef.current = url;
      setPreview({
        signature: previewSignature,
        url,
        model,
        generatedAt,
      });
      if (old && old !== url) { try { URL.revokeObjectURL(old); } catch { /* noop */ } }
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'No se pudo generar la vista previa.');
    } finally {
      buildingRef.current = false;
      setLoading(false);
    }
  }, [rangeInvalid, rangeActive, range, storeInfo, productsQuery.data, activeStoreId, skuFrom, skuTo, selClasses, priceStatus, previewSignature, opFilter, loading]);

  const handleExportPdf = useCallback(async () => {
    if (!preview || exporting) return;
    setExporting(true);
    try {
      const doc = await renderPriceListPdf(preview.model);
      doc.save(priceListFileName(preview.model.store.name, preview.model.dateLabel));
      toast.success('PDF generado');
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Error al exportar el PDF.');
    } finally {
      setExporting(false);
    }
  }, [preview, exporting]);

  // Cambio de tienda: invalida la vista previa (los datos son de otra tienda).
  useEffect(() => {
    setPreview(null);
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch { /* noop */ }
      previewUrlRef.current = null;
    }
  }, [activeStoreId]);

  const storeName = storeInfo?.name ?? '…';
  const canGenerate = !rangeInvalid && !!storeInfo && !loading && !productsQuery.isLoading;

  return (
    <div className="space-y-6 pb-8" data-view="listado-precios">
      <PageHeader
        title="Listado de precios"
        description="Consulta y genera listados de precios de los productos disponibles en la tienda."
        icon={Tags}
        context={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground">
            <StoreIcon className="h-3.5 w-3.5" aria-hidden />
            Tienda activa: <span className="font-bold text-foreground">{storeName}</span>
          </span>
        }
      />

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros del listado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── CP-OPERATIONAL-CLASS-001 (§3): Clasificación operativa ─────
              Multi-select combinable: sin selección = Todas; «Sin clasificar»
              es marcador aparte. Estados visibles con aria-pressed. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Clasificación operativa</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por clasificación operativa">
                <button
                  type="button"
                  aria-pressed={selClasses.length === 0}
                  data-testid="opclass-all"
                  onClick={clearClassFilters}
                  className={cn(
                    'min-h-[36px] rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                    selClasses.length === 0
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:border-primary/40'
                  )}
                >
                  Todas
                </button>
                {OPERATIONAL_CLASS_OPTIONS.map((opt) => {
                  const active = selClasses.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      data-testid={`opclass-${opt.value}`}
                      onClick={() => toggleClass(opt.value)}
                      className={cn(
                        'min-h-[36px] rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card hover:border-primary/40'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={selClasses.includes(UNCLASSIFIED_FILTER)}
                  data-testid="opclass-unclassified"
                  onClick={() => toggleClass(UNCLASSIFIED_FILTER)}
                  className={cn(
                    'min-h-[36px] rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                    selClasses.includes(UNCLASSIFIED_FILTER)
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-border bg-card hover:border-primary/40'
                  )}
                >
                  {UNCLASSIFIED_LABEL}
                </button>
              </div>
            </div>
            {/* ── CP-OPERATIONAL-CLASS-001 (§4): Estado del precio ─────────
                price NULL = Sin precio (no configurado); price = 0 = Con
                precio (cero legítimo configurado). */}
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Estado del precio</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado del precio">
                {([
                  { value: 'all' as PricePriceStatus, label: 'Todos' },
                  { value: 'with_price' as PricePriceStatus, label: 'Con precio' },
                  { value: 'without_price' as PricePriceStatus, label: 'Sin precio' },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={priceStatus === opt.value}
                    data-testid={`price-status-${opt.value}`}
                    onClick={() => setPriceStatus(opt.value)}
                    className={cn(
                      'min-h-[36px] rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                      priceStatus === opt.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card hover:border-primary/40'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground italic ml-1">
                Sin precio = sin precio configurado para la tienda (campo vacío). Un precio 0 configurado cuenta como Con precio.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label htmlFor="price-list-sku-from" className="text-sm font-medium">SKU desde</label>
              <Input
                id="price-list-sku-from"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej: 1"
                value={skuFrom}
                onChange={(e) => setSkuFrom(e.target.value.replace(/[^\d]/g, ''))}
                aria-invalid={rangeInvalid}
                className={cn(touch, rangeInvalid && 'border-red-500 focus-visible:ring-red-500')}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="price-list-sku-to" className="text-sm font-medium">SKU hasta</label>
              <Input
                id="price-list-sku-to"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej: 50"
                value={skuTo}
                onChange={(e) => setSkuTo(e.target.value.replace(/[^\d]/g, ''))}
                aria-invalid={rangeInvalid}
                className={cn(touch, rangeInvalid && 'border-red-500 focus-visible:ring-red-500')}
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button
                type="button"
                className={cn(touch, 'flex-1')}
                disabled={!canGenerate}
                onClick={handleGeneratePreview}
                aria-busy={loading}
              >
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <FileText className="mr-2 h-4 w-4" aria-hidden />}
                {loading ? 'Generando…' : 'Generar vista previa'}
              </Button>
              <Button type="button" variant="outline" className={touch} onClick={clearFilters} disabled={loading}>
                <X className="mr-2 h-4 w-4" aria-hidden />
                Limpiar filtros
              </Button>
            </div>
          </div>

          <div aria-live="polite" className="space-y-2">
            {!rangeError && !productsQuery.isLoading && liveCount === 0 && (productsQuery.data?.length ?? 0) > 0 && (
              <p className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Ningún producto cumple la combinación de filtros actual (stock &gt; 0, clasificación operativa y estado del precio). Usa «Limpiar filtros» para recuperar el listado completo.
              </p>
            )}
            {rangeError ? (
              <p className="flex items-center gap-2 text-sm font-medium text-red-600" role="alert">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {rangeError}
              </p>
            ) : (
              rangeActive && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  El rango aplica solo a los SKU numéricos: los códigos alfanuméricos quedan excluidos mientras el rango esté activo.
                </p>
              )
            )}
          </div>

          {/* Resumen compacto de la selección */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-semibold"
              data-testid="price-list-live-count"
              aria-live="polite"
            >
              {productsQuery.isLoading
                ? 'Cargando productos…'
                : `${liveCount} producto(s) que cumplen los filtros (stock > 0)`}
            </span>
            {opFilterActive && (
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-semibold text-primary" data-testid="price-list-active-filters">
                Filtros: {opFilterText}
              </span>
            )}
            {preview && (
              <>
                <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-semibold">
                  Rango aplicado: {rangeLabel(preview.model.meta.rangeFrom, preview.model.meta.rangeTo)}
                </span>
                <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-semibold">
                  Generado: {preview.model.dateLabel} {preview.model.timeLabel}
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Vista previa del PDF real ───────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Vista previa del PDF</CardTitle>
          <div className="flex items-center gap-2">
            {stale && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Vista previa desactualizada — vuelve a generarla
              </span>
            )}
            <Button type="button" size="sm" className={cn(touch, 'sm:min-h-[36px]')} onClick={handleExportPdf} disabled={!preview || exporting} aria-busy={exporting}>
              {exporting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="mr-2 h-4 w-4" aria-hidden />}
              Exportar PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div aria-live="polite">
            {preview ? (
              <iframe
                src={preview.url}
                title="Vista previa del listado de precios (el mismo documento que se exporta)"
                className="h-[640px] w-full rounded-xl border border-border bg-white"
              />
            ) : (
              <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium text-foreground">
                  {rangeInvalid
                    ? 'Corrige el rango de SKU para poder generar la vista previa.'
                    : 'Establece los filtros y pulsa «Generar vista previa» para ver el PDF real.'}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  La vista previa muestra exactamente el documento que se exporta (mismos productos, precios, orden y fecha de generación).
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
