'use client';

/**
 * ValeSalidaCreateModal — Flujo DEDICADO «Crear Vale de Salida».
 *
 * Requisito 1/3/13 del brief: desde el módulo Almacén → Vales de Salida la
 * intención es inequívoca («crear un documento de salida de almacén»), por lo
 * que el modal es PROPIO del módulo — NO reutiliza el carrito ni el checkout
 * de Vender (que sigue existiendo como mecanismo operativo independiente).
 *
 * La lógica de negocio NO se duplica (requisito 4): la emisión llama al MISMO
 * endpoint POST /api/vale-salida (Zod + RPC create_vale_salida server-side:
 * costo promedio, stock, sobreconsumo de OT, idempotencia, numeración
 * VS-NNNNNN-YYYY, movimientos issue_slip_out, audit_logs).
 *
 * Tres estados documentales explícitos (requisito 3):
 *   1. EDITANDO   — búsqueda de productos, líneas, concepto, OT opcional.
 *   2. CONFIRMANDO — resumen del documento + impacto de inventario +
 *                    advertencias; botón «Emitir Vale» es el acto definitivo.
 *   3. REGISTRADO  — documento emitido con número real VS-NNNNNN-YYYY.
 *
 * El número NO se inventa en cliente: «se asignará al emitir».
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  Search,
  X,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  FileText,
  Factory,
  CheckCircle2,
  Loader2,
  Plus,
  ChevronDown,
  ClipboardList,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { BaseModal } from '@/components/ui/BaseModal';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { formatearCantidad } from '@/lib/inventory/kardexPeriod';
import { useCrearValeSalida, type CrearValeResult } from './useCrearValeSalida';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos locales (espejo de los datos reales disponibles)
// ─────────────────────────────────────────────────────────────────────────────

type ProductoPos = {
  id: string;
  name: string;
  sku?: string | null;
  unit_of_measure?: string | null;
  stock_current?: number;
  cost_average?: number | null;
  product_variants?: Array<{ id: string; name: string; sku?: string | null; conversion_factor?: number }> | null;
};

interface LineaVale {
  /** Clave estable product_id|variant_id (una línea por producto+variante). */
  key: string;
  product_id: string;
  variant_id: string | null;
  name: string;
  sku?: string | null;
  unidad: string;
  stock: number;
  costo: number;
  quantity: number;
  /** Línea de OT asociada (requisito RPC: opcional, solo si hay OT). */
  production_order_item_id: string | null;
}

interface ProductionOrder {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
  customer_name?: string | null;
}

interface ProductionOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  budgeted_qty: number;
  actual_qty: number;
}

type Paso = 'editando' | 'confirmando' | 'registrado';

const claveLinea = (productId: string, variantId: string | null) =>
  `${productId}|${variantId ?? 'null'}`;

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────

export interface ValeSalidaCreateModalProps {
  open: boolean;
  onClose: () => void;
  /** UUID de la tienda activa. */
  storeId: string | null;
  /** Nombre del almacén activo para el encabezado documental. */
  storeName?: string | null;
  /** Callback tras emitir: el padre invalida queries y puede abrir el detalle. */
  onEmitido: (resultado: CrearValeResult) => void;
}

export function ValeSalidaCreateModal({
  open,
  onClose,
  storeId,
  storeName,
  onEmitido,
}: ValeSalidaCreateModalProps) {
  const { user } = useAuthStore();

  // ── Paso documental ──
  const [paso, setPaso] = useState<Paso>('editando');
  const [resultado, setResultado] = useState<CrearValeResult | null>(null);

  // ── Cabecera documental ──
  const [notas, setNotas] = useState('');
  const [productionOrderId, setProductionOrderId] = useState<string | null>(null);

  // ── Líneas ──
  const [lineas, setLineas] = useState<LineaVale[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // ── OT (opcional) ──
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [poItems, setPoItems] = useState<ProductionOrderItem[]>([]);

  const { isSubmitting, submitError, emitirVale } = useCrearValeSalida();

  // Reset total al (re)abrir: flujo nuevo, sin arrastrar estado anterior.
  useEffect(() => {
    if (open) {
      setPaso('editando');
      setResultado(null);
      setNotas('');
      setProductionOrderId(null);
      setLineas([]);
      setSearchTerm('');
    }
  }, [open]);

  // Búsqueda de productos vía EL MISMO RPC que el POS (get_products_for_pos):
  // una sola fuente de verdad del catálogo. Solo busca con ≥2 caracteres
  // (evita catálogos completos en cada apertura).
  const habilitarBusqueda = open && !!storeId && debouncedSearch.trim().length >= 2;
  // `undefined` (no null) → useProducts queda DESHABILITADO sin búsqueda activa.
  const productosQuery = useProducts(habilitarBusqueda ? storeId : undefined, debouncedSearch.trim());
  const productosEncontrados = useMemo(() => {
    if (!habilitarBusqueda) return [] as ProductoPos[];
    const enVale = new Set(lineas.map(l => l.key));
    return ((productosQuery.data ?? []) as unknown as ProductoPos[])
      .filter(p => !enVale.has(claveLinea(p.id, null)))
      .slice(0, 12);
  }, [habilitarBusqueda, productosQuery.data, lineas]);

  // OTs activas de la tienda (misma consulta que el panel de Vender — paridad).
  const fetchProductionOrders = useCallback(async () => {
    if (!storeId) return;
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from('production_orders')
        .select('id, order_number, order_type, status, customer_name')
        .eq('store_id', storeId)
        .in('status', ['approved', 'in_progress', 'paused'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setProductionOrders(data || []);
    } catch {
      setProductionOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (open) fetchProductionOrders();
  }, [open, fetchProductionOrders]);

  // Líneas de la OT seleccionada (para asociar productos ↔ líneas de OT).
  useEffect(() => {
    if (!productionOrderId) {
      setPoItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('production_order_items')
          .select('id, order_id, product_id, variant_id, budgeted_qty, actual_qty')
          .eq('order_id', productionOrderId);
        if (error) throw error;
        if (!cancelled) setPoItems(data || []);
      } catch {
        if (!cancelled) setPoItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [productionOrderId]);

  // Con OT seleccionada: limpiar asociaciones que ya no corresponden
  // (misma regla del panel de Vender — sin asociaciones stale).
  useEffect(() => {
    if (!productionOrderId) {
      setLineas(prev => prev.map(l => (l.production_order_item_id ? { ...l, production_order_item_id: null } : l)));
      return;
    }
    setLineas(prev =>
      prev.map(l =>
        l.production_order_item_id && !poItems.some(pi => pi.id === l.production_order_item_id)
          ? { ...l, production_order_item_id: null }
          : l
      )
    );
  }, [productionOrderId, poItems]);

  // ── Acciones de líneas ──
  const agregarProducto = useCallback((p: ProductoPos) => {
    setLineas(prev => {
      if (prev.some(l => l.key === claveLinea(p.id, null))) return prev;
      return [
        ...prev,
        {
          key: claveLinea(p.id, null),
          product_id: p.id,
          variant_id: null,
          name: p.name,
          sku: p.sku ?? null,
          unidad: p.unit_of_measure?.trim() || '',
          stock: Number(p.stock_current ?? 0),
          costo: Number(p.cost_average ?? 0),
          quantity: 1,
          production_order_item_id: null,
        },
      ];
    });
    setSearchTerm('');
  }, []);

  const cambiarCantidad = useCallback((key: string, cantidad: number) => {
    setLineas(prev =>
      prev.map(l => (l.key === key ? { ...l, quantity: Math.max(0, Number.isFinite(cantidad) ? cantidad : 0) } : l))
    );
  }, []);

  const eliminarLinea = useCallback((key: string) => {
    setLineas(prev => prev.filter(l => l.key !== key));
  }, []);

  const asociarLineaOT = useCallback((key: string, poItemId: string | null) => {
    setLineas(prev => prev.map(l => (l.key === key ? { ...l, production_order_item_id: poItemId } : l)));
  }, []);

  // ── Validación (pre-confirmación; el servidor sigue siendo la última barrera) ──
  const advertencias = useMemo(() => {
    const lista: string[] = [];
    for (const l of lineas) {
      if (l.quantity <= 0) lista.push(`«${l.name}»: la cantidad debe ser mayor que cero.`);
      else if (l.quantity > l.stock)
        lista.push(`«${l.name}»: la cantidad (${formatearCantidad(l.quantity)}) supera el stock disponible (${formatearCantidad(l.stock)}${l.unidad ? ` ${l.unidad}` : ''}).`);
      if (l.production_order_item_id) {
        const pi = poItems.find(x => x.id === l.production_order_item_id);
        if (pi && l.quantity > Math.max(0, Number(pi.budgeted_qty) - Number(pi.actual_qty)))
          lista.push(`«${l.name}»: supera el presupuesto restante de la línea de OT.`);
      }
    }
    return lista;
  }, [lineas, poItems]);

  const validoParaConfirmar =
    lineas.length > 0 &&
    notas.trim().length > 0 &&
    lineas.every(l => l.quantity > 0);

  const costoEstimado = useMemo(
    () => lineas.reduce((s, l) => s + l.costo * l.quantity, 0),
    [lineas]
  );

  const otsLineaPorClave = useCallback(
    (l: LineaVale): ProductionOrderItem[] =>
      poItems.filter(
        pi => pi.product_id === l.product_id && (pi.variant_id ?? null) === (l.variant_id ?? null)
      ),
    [poItems]
  );

  // ── Emisión (paso CONFIRMANDO → REGISTRADO) ──
  const emitir = useCallback(async () => {
    const result = await emitirVale({
      items: lineas.map(l => ({
        product_id: l.product_id,
        variant_id: l.variant_id,
        quantity: l.quantity,
        production_order_item_id: l.production_order_item_id,
      })),
      production_order_id: productionOrderId,
      notes: notas.trim(),
    });
    if (result) {
      setResultado(result);
      setPaso('registrado');
      onEmitido(result);
    }
  }, [emitirVale, lineas, productionOrderId, notas, onEmitido]);

  // ── Render ──
  return (
    <BaseModal
      open={open}
      onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}
      aria-label="Crear Vale de Salida"
      maxWidth="sm:max-w-3xl"
      title={
        <span className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" aria-hidden="true" />
          Crear Vale de Salida
        </span>
      }
      description="Documento de salida de almacén sin venta comercial · Módulo Vales de Salida"
      footer={
        paso === 'editando' ? (
          <div className="flex items-center justify-between gap-2 w-full">
            <p className="text-[10px] text-muted-foreground font-bold hidden sm:block">
              El número de documento se asigna automáticamente al emitir.
            </p>
            <Button
              type="button"
              onClick={() => setPaso('confirmando')}
              disabled={!validoParaConfirmar}
              className="h-10 rounded-lg font-black uppercase text-xs tracking-wide"
            >
              Revisar y confirmar
              <ArrowRight className="w-4 h-4 ml-1.5" aria-hidden="true" />
            </Button>
          </div>
        ) : paso === 'confirmando' ? (
          <div className="flex items-center justify-between gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPaso('editando')}
              disabled={isSubmitting}
              className="h-10 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Volver a editar
            </Button>
            <Button
              type="button"
              onClick={emitir}
              disabled={isSubmitting || lineas.length === 0}
              className="h-10 rounded-lg font-black uppercase text-xs tracking-wide"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
                  Emitiendo…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  Emitir Vale
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg font-black uppercase text-xs tracking-wide"
            >
              Listo
            </Button>
          </div>
        )
      }
    >
      {/* ─────────── PASO 1 · EDITANDO ─────────── */}
      {paso === 'editando' && (
        <div className="space-y-5">
          {/* Cabecera documental */}
          <section aria-label="Cabecera del documento" className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <DatoCabecera etiqueta="Documento" valor="Vale de Salida · se asignará al emitir" />
            <DatoCabecera etiqueta="Fecha" valor="Se registrará con la fecha actual" />
            <DatoCabecera etiqueta="Almacén" valor={storeName || '—'} />
            <DatoCabecera etiqueta="Responsable" valor={user?.fullName || '—'} />
          </section>

          {/* OT opcional */}
          <section aria-label="Orden de producción opcional" className="space-y-1.5">
            <label htmlFor="vale-create-ot" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Factory className="w-3 h-3" aria-hidden="true" />
              Orden de Producción (opcional)
            </label>
            <div className="relative">
              <select
                id="vale-create-ot"
                value={productionOrderId ?? ''}
                onChange={e => setProductionOrderId(e.target.value || null)}
                disabled={loadingOrders || isSubmitting}
                className="w-full h-10 appearance-none rounded-lg border border-border bg-background px-3 pr-9 text-xs font-bold disabled:opacity-50"
              >
                <option value="">— Sin OT (solo descuenta stock) —</option>
                {productionOrders.map(po => (
                  <option key={po.id} value={po.id}>
                    {po.order_number} · {po.order_type} · {po.status}
                    {po.customer_name ? ` · ${po.customer_name}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" aria-hidden="true" />
            </div>
            {productionOrderId && (
              <p className="text-[10px] text-muted-foreground">
                Se descontará <code className="font-bold">actual_qty</code> en las líneas de OT asociadas.
              </p>
            )}
          </section>

          {/* Búsqueda de productos */}
          <section aria-label="Búsqueda de productos" className="space-y-2">
            <label htmlFor="vale-create-search" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Search className="w-3 h-3" aria-hidden="true" />
              Buscar productos
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="vale-create-search"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Nombre o código del producto… (mín. 2 caracteres)"
                className="pl-9 h-10 rounded-lg text-sm"
                autoComplete="off"
              />
            </div>
            {habilitarBusqueda && productosQuery.isLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Buscando…
              </p>
            )}
            {habilitarBusqueda && !productosQuery.isLoading && productosEncontrados.length > 0 && (
              <ul className="rounded-lg border border-border divide-y divide-border/50 overflow-hidden max-h-56 overflow-y-auto" role="listbox" aria-label="Resultados de búsqueda">
                {productosEncontrados.map(p => {
                  const stock = Number(p.stock_current ?? 0);
                  const unidad = p.unit_of_measure?.trim() || '';
                  const sinStock = stock <= 0;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => agregarProducto(p)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 focus-visible:bg-muted/40 transition-colors"
                        role="option"
                        aria-selected={false}
                      >
                        <Plus className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
                        <span className="text-xs font-bold flex-1 truncate">{p.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{p.sku || '—'}</span>
                        <span className={cn('text-[10px] font-black tabular-nums whitespace-nowrap', sinStock ? 'text-destructive' : 'text-success')}>
                          {formatearCantidad(stock)}{unidad ? ` ${unidad}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {habilitarBusqueda && !productosQuery.isLoading && productosEncontrados.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Sin resultados para «{debouncedSearch.trim()}».</p>
            )}
          </section>

          {/* Líneas del documento */}
          <section aria-label="Productos del vale" className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Package className="w-3 h-3" aria-hidden="true" />
              Productos ({lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'})
            </p>
            {lineas.length === 0 ? (
              <div className="text-center py-8 rounded-lg border-2 border-dashed border-border">
                <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" aria-hidden="true" />
                <p className="text-xs font-bold text-muted-foreground">Busca y agrega productos al vale</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Cada línea registrará una salida de inventario al emitir el documento.
                </p>
              </div>
            ) : (
              <ul className="space-y-2" aria-label="Líneas del vale">
                {lineas.map(l => {
                  const excedeStock = l.quantity > l.stock;
                  const matchOT = productionOrderId ? otsLineaPorClave(l) : [];
                  return (
                    <li key={l.key} className={cn(
                      'rounded-lg border p-2.5 space-y-2',
                      excedeStock ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'
                    )}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate" title={l.name}>{l.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {l.sku || '—'} · disponible: {formatearCantidad(l.stock)}{l.unidad ? ` ${l.unidad}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <label className="sr-only" htmlFor={`qty-${l.key}`}>
                            Cantidad de {l.name}
                          </label>
                          <Input
                            id={`qty-${l.key}`}
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={l.quantity}
                            onChange={e => cambiarCantidad(l.key, parseFloat(e.target.value))}
                            className={cn(
                              'w-20 h-9 rounded-lg text-sm font-black tabular-nums text-right',
                              excedeStock && 'border-destructive focus-visible:ring-destructive/30'
                            )}
                            aria-invalid={excedeStock}
                          />
                          <span className="text-[10px] font-bold text-muted-foreground w-8">{l.unidad || '—'}</span>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => eliminarLinea(l.key)}
                            className="w-9 h-9 p-0 rounded-lg"
                            aria-label={`Eliminar ${l.name} del vale`}
                          >
                            <X className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                      {productionOrderId && (
                        <div>
                          {matchOT.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground italic">
                              {excedeStock && 'Cantidad mayor que el stock disponible. '}
                              Sin línea de OT que coincida con este producto.
                            </p>
                          ) : (
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] font-bold text-muted-foreground whitespace-nowrap" htmlFor={`ot-${l.key}`}>
                                Línea de OT
                              </label>
                              <select
                                id={`ot-${l.key}`}
                                value={l.production_order_item_id ?? ''}
                                onChange={e => asociarLineaOT(l.key, e.target.value || null)}
                                className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-[11px] font-medium"
                              >
                                <option value="">— No asociar —</option>
                                {matchOT.map(pi => (
                                  <option key={pi.id} value={pi.id}>
                                    Presup: {formatearCantidad(pi.budgeted_qty)} · Actual: {formatearCantidad(pi.actual_qty)} (queda {formatearCantidad(Math.max(0, Number(pi.budgeted_qty) - Number(pi.actual_qty)))})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Concepto / notas (requerido por el RPC) */}
          <section aria-label="Concepto del vale" className="space-y-1.5">
            <label htmlFor="vale-create-notas" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <FileText className="w-3 h-3" aria-hidden="true" />
              Concepto / notas <span className="text-destructive">*</span>
            </label>
            <textarea
              id="vale-create-notas"
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Motivo de la salida: consumo interno, merma, traslado, desperdicio, etc."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium resize-none focus:outline-none focus:ring-2 focus:ring-ring/30"
              aria-required="true"
            />
            <p className="text-[10px] text-muted-foreground text-right">{notas.length}/2000</p>
          </section>
        </div>
      )}

      {/* ─────────── PASO 2 · CONFIRMANDO ─────────── */}
      {paso === 'confirmando' && (
        <div className="space-y-5" aria-live="polite">
          <section aria-label="Resumen del documento" className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <DatoCabecera etiqueta="Documento" valor="Vale de Salida · se asignará al emitir" />
              <DatoCabecera etiqueta="Almacén" valor={storeName || '—'} />
              <DatoCabecera etiqueta="Responsable" valor={user?.fullName || '—'} />
              <DatoCabecera etiqueta="Orden relacionada" valor={productionOrderId ? (productionOrders.find(po => po.id === productionOrderId)?.order_number ?? '—') : '—'} />
              <DatoCabecera etiqueta="Concepto" valor={notas.trim() || '—'} full />
            </div>
          </section>

          <section aria-label="Productos a descontar">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
              <Package className="w-3 h-3" aria-hidden="true" />
              Impacto en inventario — {lineas.length} {lineas.length === 1 ? 'salida' : 'salidas'}
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="p-2.5 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Producto</th>
                    <th className="p-2.5 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">Salida</th>
                    <th className="p-2.5 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">Stock actual</th>
                    <th className="p-2.5 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground hidden sm:table-cell">Costo est.</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map(l => (
                    <tr key={l.key} className={cn('border-b border-border/50 last:border-0', l.quantity > l.stock && 'bg-destructive/5')}>
                      <td className="p-2.5 font-bold max-w-[240px] truncate" title={l.name}>{l.name}</td>
                      <td className="p-2.5 text-right font-black tabular-nums whitespace-nowrap text-destructive">
                        −{formatearCantidad(l.quantity)}{l.unidad ? ` ${l.unidad}` : ''}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatearCantidad(l.stock)}{l.unidad ? ` ${l.unidad}` : ''}
                      </td>
                      <td className="p-2.5 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                        {formatCurrency(l.costo * l.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30">
                    <td colSpan={3} className="p-2.5 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                      Costo estimado del documento
                    </td>
                    <td className="p-2.5 text-right font-black tabular-nums">{formatCurrency(costoEstimado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground italic mt-1.5">
              El costo final lo calcula el servidor con el costo promedio actual de cada producto.
            </p>
          </section>

          {/* Advertencias — bloqueantes o informativas antes del acto definitivo */}
          {(advertencias.length > 0 || submitError) && (
            <section aria-label="Advertencias" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-destructive flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                {advertencias.length > 0 ? 'Revisa antes de emitir' : 'Error al emitir'}
              </p>
              <ul className="space-y-1">
                {advertencias.map((a, i) => (
                  <li key={i} className="text-xs text-destructive font-medium">• {a}</li>
                ))}
              </ul>
              {submitError && <p className="text-xs text-destructive font-black">{submitError}</p>}
            </section>
          )}
        </div>
      )}

      {/* ─────────── PASO 3 · REGISTRADO ─────────── */}
      {paso === 'registrado' && resultado && (
        <div className="py-6 text-center space-y-4" aria-live="polite">
          <CheckCircle2 className="w-14 h-14 text-success mx-auto" aria-hidden="true" />
          <div>
            <p className="text-sm font-black uppercase tracking-widest">Vale registrado</p>
            <p className="font-mono text-lg font-black text-primary mt-1">
              {resultado.slip_number || '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
              El stock fue descontado y el documento quedó registrado con estado
              {' '}<span className="font-black text-foreground">Completado</span>.
              Ya es visible en el listado de Vales de Salida y en el inventario.
            </p>
            {resultado.total_cost != null && resultado.total_cost > 0 && (
              <p className="text-xs font-bold mt-2">Costo del documento: {formatCurrency(Number(resultado.total_cost))}</p>
            )}
          </div>
        </div>
      )}
    </BaseModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Átomo local
// ─────────────────────────────────────────────────────────────────────────────

function DatoCabecera({ etiqueta, valor, full }: { etiqueta: string; valor: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn('flex flex-col', full && 'sm:col-span-2')}>
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{etiqueta}</span>
      <span className="text-sm font-bold break-words">{valor}</span>
    </div>
  );
}
