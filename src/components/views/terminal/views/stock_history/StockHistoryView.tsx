'use client';

/**
 * TRAZABILIDAD — Inicio → Operación → Almacén → Inventario → Trazabilidad
 * AMPLIACIÓN: DOS MODOS DE CONSULTA (§1-§29 de Trazabilidad Global).
 *
 *   MODO A — TRAZABILIDAD GLOBAL (§2/§3): modo inicial. Todos los
 *     movimientos del almacén con filtros combinables en la fuente de
 *     datos (§8/§9): producto (modo híbrido §16), tipo de movimiento
 *     (grupos SOLO con valores reales del enum en BD, §6) y período.
 *     Tabla de auditoría con «Saldo del producto» por fila (§10/§11),
 *     unidades reales por producto (§12), resumen por conteos reales
 *     (§13/§24), chips-filtro con contadores (§14), detalle del
 *     movimiento (§19) y exportación que respeta los filtros (§25).
 *
 *   MODO B — KARDEX DEL PRODUCTO (§4): al seleccionar un producto desde
 *     el buscador. Cabecera identificada (§8), saldo inicial (§10),
 *     movimientos cronológicos con saldo corrido `balance_after`
 *     (§11/§12), resumen del período (§23), exportación CSV (§32) y
 *     experiencia móvil en tarjetas (§26).
 *
 *   Transición natural sin recargar (§17) e indicador de contexto (§18).
 *   NO se mezclan saldos de productos con unidades distintas (§11):
 *   en modo global no existe «saldo total», solo conteos de movimientos.
 *
 * Fuente única de verdad (§34): tabla `stock_movements`, saldos
 * `balance_after` calculados server-side. Esta vista NUNCA recalcula saldos.
 * Las etiquetas de movimiento SIEMPRE pasan por el diccionario central
 * `movementPresentation` (§7): jamás se imprime el enum interno.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  History,
  Calendar,
  Download,
  RefreshCw,
  SearchX,
  BookOpen,
  Loader2,
  PackageSearch,
  ArrowLeftRight,
  Layers,
  Eye,
  X,
  Filter,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { QueryInspector } from '@/components/ui/QueryInspector';
import { SecondaryButton } from '@/components/ui/atomic';
import { BaseModal } from '@/components/ui/BaseModal';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { getCleanStoreId } from '@/hooks/api/base';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { useAuthStore } from '@/store';
import { useProductKardex } from '@/hooks/api/useProductKardex';
import { useStockMovements } from '@/hooks/api/useStockMovements';
import { useMovementCounts } from '@/hooks/api/useMovementCounts';
import {
  rankearCoincidencias,
  formatearCantidad,
  type ProductSearchLike,
} from '@/lib/inventory/kardexPeriod';
import {
  obtenerEtiquetaMovimiento,
  obtenerClaseBadgeMovimiento,
  obtenerIconoMovimiento,
  GRUPOS_FILTRO_MOVIMIENTO,
  obtenerGrupoFiltro,
} from '@/lib/inventory/movementPresentation';

// ─────────────────────────────────────────────────────────────────────────────
// §9 — Períodos rápidos
// ─────────────────────────────────────────────────────────────────────────────

type PeriodKey = 'today' | '7d' | 'month' | 'prevMonth' | 'year' | 'all' | 'custom';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'prevMonth', label: 'Mes anterior' },
  { key: 'year', label: 'Este año' },
  { key: 'all', label: 'Todo el historial' },
  { key: 'custom', label: 'Personalizado' },
];

/** Fecha local → 'YYYY-MM-DD' (evita desplazamientos de zona horaria). */
const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' para etiquetas del período. */
const fmtFechaCorta = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function resolverRango(
  key: PeriodKey,
  custom: { from: string; to: string }
): { from?: string; to?: string } {
  const today = new Date();
  switch (key) {
    case 'today':
      return { from: fmtLocal(today), to: fmtLocal(today) };
    case '7d': {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: fmtLocal(from), to: fmtLocal(today) };
    }
    case 'month':
      return { from: fmtLocal(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmtLocal(today) };
    case 'prevMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmtLocal(first), to: fmtLocal(last) };
    }
    case 'year':
      return { from: fmtLocal(new Date(today.getFullYear(), 0, 1)), to: fmtLocal(today) };
    case 'all':
      return {};
    case 'custom':
      return custom.from && custom.to ? { from: custom.from, to: custom.to } : {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Movimiento global (vista MODO A) — refleja la fila real de stock_movements
// con el producto embebido. No se inventan campos: solo lo que devuelve la BD.
// ─────────────────────────────────────────────────────────────────────────────

interface ProductoEmbebido {
  id?: string | null;
  name?: string | null;
  sku?: string | null;
  unit_of_measure?: string | null;
  stock_current?: number | null;
}

interface MovimientoGlobal {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: number;
  balance_after: number | null;
  unit_cost?: number | null;
  unit_price?: number | null;
  reference_doc?: string | null;
  created_by?: string | null;
  product?: ProductoEmbebido | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function StockHistoryView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const cleanStoreId = getCleanStoreId(storeId);

  // ── MODO (§1/§17/§18): 'global' al entrar (§2) | 'producto' con Kardex ──
  const [modo, setModo] = useState<'global' | 'producto'>('global');
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchLike | null>(null);

  // ── Filtros compartidos entre modos (§22: conservar contexto de búsqueda) ──
  const [periodKey, setPeriodKey] = useState<PeriodKey>('month');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const rango = useMemo(() => resolverRango(periodKey, customRange), [periodKey, customRange]);

  // ── MODO A: tipo de movimiento (§6) y producto como filtro (§16 híbrido) ──
  const [tipoFiltroId, setTipoFiltroId] = useState<string>('todos');
  const [productoFiltro, setProductoFiltro] = useState<ProductSearchLike | null>(null);
  const grupoActivo = obtenerGrupoFiltro(tipoFiltroId) ?? GRUPOS_FILTRO_MOVIMIENTO[0];

  // ── Buscador de producto (§15: funciona también en modo global) ──────────
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // ── MODO B: Kardex del producto (solo activo en modo producto) ───────────
  const kardex = useProductKardex(
    modo === 'producto' ? selectedProduct?.id ?? null : null,
    storeId,
    rango.from,
    rango.to
  );

  // ── MODO A: movimientos globales paginados, filtros EN la fuente (§9/§23) ──
  const movimientos = useStockMovements(storeId, false, rango.from, rango.to, {
    movementTypes: grupoActivo.tipos,
    productId: modo === 'global' ? productoFiltro?.id ?? null : null,
  });

  // ── MODO A: contadores por grupo (§13/§24) respetando producto + período ──
  const contadores = useMovementCounts(storeId, rango.from, rango.to, productoFiltro?.id ?? null);

  // Búsqueda de productos: misma tabla `products` (fuente única), con
  // coincidencia por código / nombre / descripción y ranking inteligente (§6).
  const productMatches = useQuery({
    queryKey: ['trace-product-search', cleanStoreId, debouncedSearch],
    queryFn: async (): Promise<ProductSearchLike[]> => {
      const term = debouncedSearch.trim().replace(/[,()]/g, ' ').trim();
      if (!term) return [];
      let q = supabase
        .from('products')
        .select('id, name, sku, unit_of_measure, stock_current, description')
        .limit(15);
      if (cleanStoreId) q = q.eq('store_id', cleanStoreId);
      q = q.or(`sku.ilike.%${term}%,name.ilike.%${term}%,description.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return rankearCoincidencias((data || []) as ProductSearchLike[], term);
    },
    enabled: modo === 'global' && debouncedSearch.trim().length > 0,
  });

  const term = debouncedSearch.trim();
  const matches = productMatches.data ?? [];
  const unidad = selectedProduct?.unit_of_measure?.trim() || '';
  const sufijoUnidad = unidad ? ` ${unidad}` : '';

  // Movimientos globales aplanados (paginación progresiva §23)
  const movsGlobales = useMemo(
    () => ((movimientos.data?.pages ?? []).flatMap(p => p.items) as unknown as MovimientoGlobal[]),
    [movimientos.data]
  );

  // Total exacto del conjunto filtrado (§24): proviene de los contadores,
  // que aplican los mismos filtros. Nunca estadísticas globales ajenas.
  const totalFiltrado = useMemo(() => {
    const pg = contadores.data?.porGrupo ?? {};
    if (grupoActivo.tipos.length === 0) return pg['todos'] ?? 0;
    return pg[grupoActivo.id] ?? 0;
  }, [contadores.data, grupoActivo]);

  // ── Transiciones entre modos (§17: sin recargar la aplicación) ───────────
  const seleccionarProducto = (p: ProductSearchLike) => {
    setSelectedProduct(p);
    setModo('producto');
    setSearchTerm('');
  };

  const volverAGlobal = () => {
    // §5: volver al modo global sin recargar la página.
    setModo('global');
  };

  const filtrarProductoEnGlobal = (p: ProductSearchLike) => {
    // §15 Opción 2: continuar en global filtrando los movimientos del producto.
    setProductoFiltro(p);
    setSearchTerm('');
    toast.success(`Filtro activo: ${p.name}. Seleccione «Todos los productos» en el indicador para quitarlo.`);
  };

  const abrirKardexDesdeDetalle = (mov: MovimientoGlobal) => {
    // §29: global → movimiento → producto → Kardex.
    const p = mov.product;
    if (!p?.id) {
      toast.error('Este movimiento no tiene un producto asociado identificable.');
      return;
    }
    seleccionarProducto({
      id: p.id,
      name: p.name || 'Producto',
      sku: p.sku ?? null,
      unit_of_measure: p.unit_of_measure ?? null,
      stock_current: p.stock_current ?? null,
    });
    setDetalle(null);
  };

  // ── §19 — Detalle del movimiento (modal) ─────────────────────────────────
  const [detalle, setDetalle] = useState<MovimientoGlobal | null>(null);

  // ── §32 — Exportar Kardex del producto respetando producto + período ─────
  const handleExportCSV = useCallback(() => {
    const k = kardex.data;
    if (!k || !selectedProduct) return;
    if (k.movimientos.length === 0) {
      toast.error('No hay movimientos para exportar en el período seleccionado.');
      return;
    }

    const headers = ['Fecha', 'Documento', 'Movimiento', 'Entrada', 'Salida', 'Saldo'];
    const rows: string[][] = [];
    if (rango.from) {
      rows.push([rango.from, '', 'Saldo inicial', '', '', formatearCantidad(k.saldoInicial)]);
    }
    for (const m of k.movimientos) {
      const qc = m.quantity_change ?? 0;
      rows.push([
        formatDate(m.created_at),
        m.reference_doc || '',
        obtenerEtiquetaMovimiento(m.movement_type),
        qc > 0 ? formatearCantidad(qc) : '',
        qc < 0 ? formatearCantidad(Math.abs(qc)) : '',
        formatearCantidad(m.balance_after),
      ]);
    }
    rows.push(['', '', 'SALDO FINAL', '', '', formatearCantidad(k.resumen.saldoFinal)]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.map(c => `"${c}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kardex_${selectedProduct.sku || selectedProduct.id}_${rango.from || 'inicio'}_${rango.to || 'hoy'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Kardex exportado (${k.movimientos.length} movimientos).`);
  }, [kardex.data, selectedProduct, rango.from, rango.to]);

  // ── §25 — Exportar movimientos globales respetando TODOS los filtros ─────
  const handleExportGlobalCSV = useCallback(async () => {
    const MAX = 5000;
    const LOTE = 1000;
    const todas: Record<string, unknown>[] = [];
    try {
      for (let offset = 0; offset < MAX; offset += LOTE) {
        let q = supabase
          .from('stock_movements')
          .select(
            'created_at, movement_type, quantity_change, balance_after, reference_doc, product:products(name, sku, unit_of_measure)'
          );
        if (cleanStoreId) q = q.eq('store_id', cleanStoreId);
        if (rango.from) q = q.gte('created_at', rango.from);
        if (rango.to) q = q.lte('created_at', rango.to + 'T23:59:59.999');
        if (grupoActivo.tipos.length > 0) q = q.in('movement_type', grupoActivo.tipos);
        if (productoFiltro?.id) q = q.eq('product_id', productoFiltro.id);
        q = q.order('created_at', { ascending: false }).range(offset, offset + LOTE - 1);
        const { data, error } = await q;
        if (error) throw error;
        const lote = data || [];
        todas.push(...lote);
        if (lote.length < LOTE) break;
      }
    } catch {
      toast.error('Error al exportar: no se pudieron leer los movimientos.');
      return;
    }

    if (todas.length === 0) {
      toast.error('No hay movimientos para exportar con los filtros seleccionados.');
      return;
    }

    const truncated = todas.length >= MAX;
    const headers = ['Fecha', 'Producto', 'Código', 'Movimiento', 'Documento', 'Entrada', 'Salida', 'Saldo del producto', 'Unidad'];
    const rows = todas.map(m => {
      const g = m as unknown as MovimientoGlobal & { product?: ProductoEmbebido | null };
      const qc = Number(g.quantity_change) || 0;
      const u = g.product?.unit_of_measure?.trim() || '';
      return [
        formatDate(g.created_at),
        g.product?.name || 'Producto desconocido',
        g.product?.sku || '',
        obtenerEtiquetaMovimiento(g.movement_type),
        g.reference_doc || '',
        qc > 0 ? formatearCantidad(qc) : '',
        qc < 0 ? formatearCantidad(Math.abs(qc)) : '',
        g.balance_after === null || g.balance_after === undefined ? '' : formatearCantidad(Number(g.balance_after)),
        u,
      ];
    });
    const csvContent = [headers.join(';'), ...rows.map(r => r.map(c => `"${c}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trazabilidad_${productoFiltro?.sku || 'todos-productos'}_${grupoActivo.id}_${rango.from || 'inicio'}_${rango.to || 'hoy'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    if (truncated) {
      toast.warning(`Exportación limitada a ${MAX} movimientos; refine los filtros para el resto.`);
    } else {
      toast.success(`Exportados ${todas.length} movimientos con los filtros activos.`);
    }
  }, [cleanStoreId, rango.from, rango.to, grupoActivo, productoFiltro]);

  const onRefresh = () => {
    if (modo === 'producto') {
      kardex.refetch();
    } else {
      movimientos.refetch();
      contadores.refetch();
    }
    toast.success('Trazabilidad actualizada.');
  };

  const limpiarFiltros = () => {
    setTipoFiltroId('todos');
    setProductoFiltro(null);
    setPeriodKey('month');
    setCustomRange({ from: '', to: '' });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MODO B — KARDEX DEL PRODUCTO (§4/§8-§13, §21-§26, §28)
  // ─────────────────────────────────────────────────────────────────────────
  if (modo === 'producto' && selectedProduct) {
    const k = kardex.data;
    const resumen = k?.resumen;

    return (
      <div className="space-y-3">
        {/* Cabecera identificada del producto (§8) */}
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center border bg-primary/5 border-primary/20 shrink-0">
                <BookOpen className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Trazabilidad · Kardex del producto
                </div>
                <div className="font-black text-lg uppercase tracking-tight leading-tight">
                  {selectedProduct.name}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                  <span className="font-mono font-bold bg-muted/50 px-1.5 py-0.5 rounded">
                    Código: {selectedProduct.sku || '—'}
                  </span>
                  {unidad && <span>Unidad: <span className="font-bold">{unidad}</span></span>}
                  <span>
                    Saldo actual:{' '}
                    <span className="font-black tabular-nums text-primary">
                      {formatearCantidad(selectedProduct.stock_current ?? 0)}{sufijoUnidad}
                    </span>
                  </span>
                </div>
              </div>
            </div>
            {/* §5/§17 — Volver al modo global sin recargar */}
            <SecondaryButton
              label="Todos los productos"
              icon={ArrowLeftRight}
              onClick={volverAGlobal}
              aria-label="Volver a la trazabilidad global de todos los productos"
              className="shrink-0"
            />
          </div>
        </div>

        {/* §9 — Filtro por período con opciones rápidas */}
        <div className="p-3 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Período del Kardex">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">
              Período
            </span>
            {PERIOD_OPTIONS.map(opt => (
              <Button
                key={opt.key}
                type="button"
                variant={periodKey === opt.key ? 'default' : 'outline'}
                aria-pressed={periodKey === opt.key}
                onClick={() => setPeriodKey(opt.key)}
                className="h-auto rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide"
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {periodKey === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label htmlFor="kardex-from" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">
                  Desde
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  <input
                    id="kardex-from"
                    type="date"
                    aria-label="Fecha desde"
                    className="w-full p-2.5 pl-10 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                    value={customRange.from}
                    onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="kardex-to" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">
                  Hasta
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  <input
                    id="kardex-to"
                    type="date"
                    aria-label="Fecha hasta"
                    className="w-full p-2.5 pl-10 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                    value={customRange.to}
                    onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="text-xs font-bold text-muted-foreground">
            {rango.from || rango.to
              ? `Período consultado: ${rango.from ? fmtFechaCorta(rango.from) : 'inicio'} — ${rango.to ? fmtFechaCorta(rango.to) : 'hoy'}`
              : 'Período consultado: todo el historial'}
          </div>
        </div>

        {/* §23/§24 — Resumen del período (el Kardex sigue siendo el protagonista) */}
        {resumen && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-muted/50 border border-border text-center">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Saldo inicial</div>
              <div className="text-xl font-black tabular-nums">{formatearCantidad(resumen.saldoInicial)}{sufijoUnidad}</div>
            </div>
            <div className="p-3 rounded-xl bg-success/5 border border-success/10 text-center">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Entradas</div>
              <div className="text-xl font-black tabular-nums text-success">+{formatearCantidad(resumen.entradas)}{sufijoUnidad}</div>
            </div>
            <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/10 text-center">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Salidas</div>
              <div className="text-xl font-black tabular-nums text-destructive">−{formatearCantidad(resumen.salidas)}{sufijoUnidad}</div>
            </div>
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Saldo final</div>
              <div className="text-xl font-black tabular-nums text-primary">{formatearCantidad(resumen.saldoFinal)}{sufijoUnidad}</div>
            </div>
          </div>
        )}

        {/* §31/§13 — Techo de seguridad visible, nunca ocultar el problema */}
        {kardex.data?.isTruncated && (
          <div className="p-3 rounded-xl border border-warning/30 bg-warning/5 text-xs font-bold text-warning">
            El período contiene más de 10.000 movimientos. Se muestran los primeros 10.000 en orden cronológico; refine el período para ver el resto.
          </div>
        )}

        {/* Acciones: exportar / actualizar */}
        <div className="flex items-center justify-end gap-2">
          {resumen && resumen.cantidadMovimientos > 0 && (
            <span className="text-xs font-black bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full border border-border mr-auto">
              {resumen.cantidadMovimientos} movimiento{resumen.cantidadMovimientos !== 1 ? 's' : ''}
            </span>
          )}
          <ActionMenu
            actions={[
              { id: 'export', label: 'Exportar CSV', icon: Download, onClick: handleExportCSV },
              { id: 'refresh', label: 'Actualizar', icon: RefreshCw, onClick: onRefresh, variant: 'primary' },
            ]}
            className="sm:w-auto"
          />
        </div>

        <QueryInspector />

        {/* §11/§25/§26 — Kardex: tabla profesional (escritorio) / tarjetas (móvil) */}
        {kardex.isLoading ? (
          <div className="p-12 rounded-xl border border-border bg-card/50 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" aria-hidden="true" />
            <p className="mt-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
              Cargando Kardex…
            </p>
          </div>
        ) : kardex.error ? (
          <div className="p-12 rounded-xl border border-destructive/30 bg-destructive/5 text-center">
            <p className="font-black text-destructive">Error al cargar el Kardex.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Intente actualizar; si persiste, verifique la conexión.
            </p>
          </div>
        ) : k && k.movimientos.length === 0 ? (
          /* §29 — Estado vacío del período */
          <div className="text-center py-16 rounded-xl border-2 border-dashed border-border bg-card/50">
            <PackageSearch className="w-14 h-14 mx-auto mb-4 opacity-10" aria-hidden="true" />
            <p className="font-black uppercase tracking-widest text-xs text-muted-foreground max-w-md mx-auto">
              Este producto no tiene movimientos registrados para el período seleccionado.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {rango.from && (
                <SecondaryButton label="Ver todo el historial" onClick={() => setPeriodKey('all')} />
              )}
            </div>
          </div>
        ) : k && (
          <>
            {/* Escritorio: tabla Kardex (§25) */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="p-3 text-left text-xs font-black uppercase text-muted-foreground">Fecha</th>
                    <th className="p-3 text-left text-xs font-black uppercase text-muted-foreground">Documento</th>
                    <th className="p-3 text-left text-xs font-black uppercase text-muted-foreground">Movimiento</th>
                    <th className="p-3 text-right text-xs font-black uppercase text-muted-foreground">Entrada</th>
                    <th className="p-3 text-right text-xs font-black uppercase text-muted-foreground">Salida</th>
                    <th className="p-3 text-right text-xs font-black uppercase text-muted-foreground">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {/* §10/§11 — Fila de saldo inicial cuando hay período definido */}
                  {rango.from && (
                    <tr className="border-b border-border/50 bg-muted/20">
                      <td className="p-3 text-xs text-muted-foreground">{fmtFechaCorta(rango.from)}</td>
                      <td className="p-3 text-xs text-muted-foreground">—</td>
                      <td className="p-3 text-xs font-black uppercase text-muted-foreground">Saldo inicial</td>
                      <td className="p-3 text-right">—</td>
                      <td className="p-3 text-right">—</td>
                      <td className="p-3 text-right font-black tabular-nums">{formatearCantidad(k.saldoInicial)}</td>
                    </tr>
                  )}
                  {k.movimientos.map(mov => {
                    const qc = mov.quantity_change ?? 0;
                    const Icon = obtenerIconoMovimiento(mov.movement_type);
                    return (
                      <tr key={mov.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(mov.created_at)}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground font-mono">
                          {mov.reference_doc || '—'}
                        </td>
                        <td className="p-3">
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs font-black uppercase px-2 py-0.5 rounded-full border',
                            obtenerClaseBadgeMovimiento(mov.movement_type)
                          )}>
                            <Icon className="w-3 h-3" aria-hidden="true" />
                            {obtenerEtiquetaMovimiento(mov.movement_type)}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-success tabular-nums">
                          {qc > 0 ? `+${formatearCantidad(qc)}` : '—'}
                        </td>
                        <td className="p-3 text-right font-bold text-destructive tabular-nums">
                          {qc < 0 ? `−${formatearCantidad(Math.abs(qc))}` : '—'}
                        </td>
                        <td className="p-3 text-right font-black tabular-nums">
                          {formatearCantidad(mov.balance_after)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas de movimiento (§26) */}
            <div className="md:hidden space-y-3">
              {rango.from && (
                <div className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-muted-foreground">Saldo inicial · {fmtFechaCorta(rango.from)}</span>
                  <span className="font-black tabular-nums">{formatearCantidad(k.saldoInicial)}</span>
                </div>
              )}
              {k.movimientos.map(mov => {
                const qc = mov.quantity_change ?? 0;
                const Icon = obtenerIconoMovimiento(mov.movement_type);
                return (
                  <div key={mov.id} className="p-4 rounded-xl border border-border bg-card space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        'inline-flex items-center gap-1 text-xs font-black uppercase px-2 py-0.5 rounded-full border',
                        obtenerClaseBadgeMovimiento(mov.movement_type)
                      )}>
                        <Icon className="w-3 h-3" aria-hidden="true" />
                        {obtenerEtiquetaMovimiento(mov.movement_type)}
                      </span>
                      <span className="text-xs text-muted-foreground font-bold">{formatDate(mov.created_at)}</span>
                    </div>
                    {mov.reference_doc && (
                      <div className="text-xs text-muted-foreground font-mono">
                        Documento: <span className="font-bold">{mov.reference_doc}</span>
                      </div>
                    )}
                    <div className="flex items-end justify-between pt-1">
                      <div className="text-sm">
                        {qc > 0 && (
                          <span className="font-black text-success tabular-nums">Entrada&nbsp;&nbsp;+{formatearCantidad(qc)}{sufijoUnidad}</span>
                        )}
                        {qc < 0 && (
                          <span className="font-black text-destructive tabular-nums">Salida&nbsp;&nbsp;−{formatearCantidad(Math.abs(qc))}{sufijoUnidad}</span>
                        )}
                        {qc === 0 && <span className="text-muted-foreground font-bold">Sin variación</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Saldo</div>
                        <div className="text-lg font-black tabular-nums leading-none">
                          {formatearCantidad(mov.balance_after)}{sufijoUnidad}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODO A — TRAZABILIDAD GLOBAL (§2/§3/§10/§13/§14/§16/§19/§23/§25)
  // ─────────────────────────────────────────────────────────────────────────

  const cargandoLista = movimientos.isLoading;
  const hayMas = movimientos.hasNextPage;

  return (
    <div className="space-y-3">
      {/* §18 — Indicador de contexto: siempre visible el modo actual */}
      <div className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center border bg-primary/5 border-primary/20 shrink-0">
            <Layers className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Trazabilidad · Modo global
            </div>
            <div className="font-black text-lg uppercase tracking-tight leading-tight">
              Trazabilidad de inventario
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              {productoFiltro ? (
                <>
                  <span className="inline-flex items-center gap-1 font-black text-foreground bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                    Producto: {productoFiltro.name}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setProductoFiltro(null)}
                      aria-label="Quitar filtro de producto y volver a todos los productos"
                      className="h-4 w-4 p-0 rounded-full hover:bg-primary/20"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </Button>
                  </span>
                  <span>+ filtro de tipo y período combinables</span>
                </>
              ) : (
                <span>Todos los movimientos del almacén — múltiples productos</span>
              )}
            </div>
          </div>
        </div>
        <ActionMenu
          actions={[
            { id: 'export-global', label: 'Exportar CSV', icon: Download, onClick: handleExportGlobalCSV },
            { id: 'refresh-global', label: 'Actualizar', icon: RefreshCw, onClick: onRefresh, variant: 'primary' },
          ]}
          className="sm:w-auto shrink-0"
        />
      </div>

      {/* Filtros combinables (§8/§9): producto + tipo + período, EN la fuente */}
      <div className="p-3 rounded-xl border border-border bg-card space-y-4">
        {/* §15 — Buscador de producto activo también en modo global */}
        <div className="space-y-2">
          <label htmlFor="trace-product-search" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">
            Producto
          </label>
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            onClear={() => setSearchTerm('')}
            placeholder="Buscar producto por código o nombre…"
            inputId="trace-product-search"
            showSettings={false}
            aria-label="Buscar producto para filtrar la trazabilidad global o abrir su Kardex"
          />
        </div>

        {/* Búsqueda en curso */}
        {term && productMatches.isLoading && (
          <div className="space-y-2" aria-live="polite">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="p-4 rounded-xl border border-border bg-card animate-pulse flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-48" />
                  <div className="h-3 bg-muted rounded w-28" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* §30 — Sin resultados de búsqueda */}
        {term && !productMatches.isLoading && matches.length === 0 && (
          <div className="p-6 rounded-xl border-2 border-dashed border-border bg-card/50 text-center">
            <SearchX className="w-10 h-10 mx-auto mb-2 opacity-10" aria-hidden="true" />
            <p className="font-black text-sm text-foreground/80">
              No se encontraron productos que coincidan con «{term}».
            </p>
            <div className="mt-3 flex justify-center">
              <SecondaryButton label="Limpiar búsqueda" onClick={() => setSearchTerm('')} />
            </div>
          </div>
        )}

        {/* §15 — Coincidencias: elegir abrir Kardex O filtrar la vista global */}
        {term && matches.length > 0 && (
          <div className="space-y-2" aria-live="polite">
            <div className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1">
              {matches.length} coincidencia{matches.length !== 1 ? 's' : ''} — abra el Kardex o filtre la vista global
            </div>
            {matches.map(p => (
              <div key={p.id} className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => seleccionarProducto(p)}
                  aria-label={`Abrir Kardex de ${p.name}${p.sku ? `, código ${p.sku}` : ''}`}
                  className="flex-1 h-auto p-4 justify-between text-left rounded-xl hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center border bg-muted/30 border-border shrink-0">
                      <BookOpen className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black uppercase tracking-tight leading-tight truncate">{p.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs font-bold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                          {p.sku || '—'}
                        </span>
                        {p.unit_of_measure && (
                          <span className="text-[10px] font-black uppercase text-muted-foreground/70">
                            {p.unit_of_measure}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Existencia</div>
                    <div className="text-lg font-black tabular-nums">{formatearCantidad(p.stock_current ?? 0)}</div>
                  </div>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => filtrarProductoEnGlobal(p)}
                  aria-label={`Filtrar la vista global con los movimientos de ${p.name}`}
                  className="sm:w-auto h-auto px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wide"
                >
                  <Filter className="w-4 h-4 sm:mr-2" aria-hidden="true" />
                  <span className="hidden sm:inline">Filtrar en vista global</span>
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* §6/§13/§14/§24 — Tipo de movimiento: chips con contadores reales.
            Los contadores respetan producto + período activos (§24). */}
        <div className="space-y-2">
          <div className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-1">
            Tipo de movimiento
          </div>
          {/* Escritorio: chips con contadores (§14) */}
          <div className="hidden md:flex items-center gap-2 flex-wrap" role="group" aria-label="Filtrar por tipo de movimiento">
            {GRUPOS_FILTRO_MOVIMIENTO.map(g => {
              const activo = tipoFiltroId === g.id;
              const conteo = contadores.data?.porGrupo[g.id];
              return (
                <Button
                  key={g.id}
                  type="button"
                  variant={activo ? 'default' : 'outline'}
                  aria-pressed={activo}
                  onClick={() => setTipoFiltroId(g.id)}
                  className="h-auto rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide"
                >
                  {g.label}
                  {conteo !== undefined && (
                    <span className={cn('ml-1.5 px-1.5 rounded-full text-[10px]', activo ? 'bg-background/20' : 'bg-muted')}>
                      {conteo}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
          {/* Móvil: selector compacto (§14) */}
          <div className="md:hidden">
            <select
              id="filtro-tipo-movil"
              aria-label="Tipo de movimiento"
              value={tipoFiltroId}
              onChange={e => setTipoFiltroId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
            >
              {GRUPOS_FILTRO_MOVIMIENTO.map(g => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* §9 — Período */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Período de la trazabilidad global">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-1">
              Período
            </span>
            {PERIOD_OPTIONS.map(opt => (
              <Button
                key={opt.key}
                type="button"
                variant={periodKey === opt.key ? 'default' : 'outline'}
                aria-pressed={periodKey === opt.key}
                onClick={() => setPeriodKey(opt.key)}
                className="h-auto rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide"
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {periodKey === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="global-from" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">
                  Desde
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  <input
                    id="global-from"
                    type="date"
                    aria-label="Fecha desde"
                    className="w-full p-2.5 pl-10 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                    value={customRange.from}
                    onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="global-to" className="text-xs font-black text-muted-foreground uppercase tracking-widest block ml-1">
                  Hasta
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  <input
                    id="global-to"
                    type="date"
                    aria-label="Fecha hasta"
                    className="w-full p-2.5 pl-10 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                    value={customRange.to}
                    onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="text-xs font-bold text-muted-foreground">
            {rango.from || rango.to
              ? `Período consultado: ${rango.from ? fmtFechaCorta(rango.from) : 'inicio'} — ${rango.to ? fmtFechaCorta(rango.to) : 'hoy'}`
              : 'Período consultado: todo el historial'}
          </div>
        </div>

        {/* §24 — Contador del conjunto filtrado exacto */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border/50">
          <span className="text-xs font-black bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full border border-border">
            {contadores.isLoading
              ? 'Calculando contadores…'
              : `${totalFiltrado} movimiento${totalFiltrado !== 1 ? 's' : ''} con los filtros activos`}
          </span>
          {(tipoFiltroId !== 'todos' || productoFiltro || periodKey !== 'month') && (
            <SecondaryButton label="Limpiar filtros" onClick={limpiarFiltros} />
          )}
        </div>
        {contadores.data?.hasError && (
          <div className="p-2.5 rounded-lg border border-warning/30 bg-warning/5 text-xs font-bold text-warning">
            No se pudieron calcular algunos contadores; los valores mostrados pueden estar incompletos.
          </div>
        )}
      </div>

      <QueryInspector />

      {/* Resultado */}
      {cargandoLista ? (
        <div className="p-12 rounded-xl border border-border bg-card/50 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" aria-hidden="true" />
          <p className="mt-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
            Cargando movimientos…
          </p>
        </div>
      ) : movimientos.error ? (
        <div className="p-12 rounded-xl border border-destructive/30 bg-destructive/5 text-center">
          <p className="font-black text-destructive">Error al cargar los movimientos.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Intente actualizar; si persiste, verifique la conexión.
          </p>
        </div>
      ) : movsGlobales.length === 0 ? (
        /* Estado vacío con filtros activos */
        <div className="text-center py-16 rounded-xl border-2 border-dashed border-border bg-card/50">
          <PackageSearch className="w-14 h-14 mx-auto mb-4 opacity-10" aria-hidden="true" />
          <p className="font-black uppercase tracking-widest text-xs text-muted-foreground max-w-md mx-auto">
            No hay movimientos que coincidan con los filtros seleccionados.
          </p>
          <div className="mt-4 flex justify-center">
            <SecondaryButton label="Limpiar filtros" onClick={limpiarFiltros} />
          </div>
        </div>
      ) : (
        <>
          {/* Escritorio: tabla global de auditoría (§10) */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="p-3 text-left text-xs font-black uppercase text-muted-foreground">Fecha</th>
                  <th className="p-3 text-left text-xs font-black uppercase text-muted-foreground">Producto</th>
                  <th className="p-3 text-left text-xs font-black uppercase text-muted-foreground">Código</th>
                  <th className="p-3 text-left text-xs font-black uppercase text-muted-foreground">Movimiento</th>
                  <th className="p-3 text-left text-xs font-black uppercase text-muted-foreground">Documento</th>
                  <th className="p-3 text-right text-xs font-black uppercase text-muted-foreground">Entrada</th>
                  <th className="p-3 text-right text-xs font-black uppercase text-muted-foreground">Salida</th>
                  <th className="p-3 text-right text-xs font-black uppercase text-muted-foreground">Saldo del producto</th>
                  <th className="p-3 text-right text-xs font-black uppercase text-muted-foreground">
                    <span className="sr-only">Ver detalle</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {movsGlobales.map(mov => {
                  const qc = mov.quantity_change ?? 0;
                  const Icon = obtenerIconoMovimiento(mov.movement_type);
                  const unidadProd = mov.product?.unit_of_measure?.trim() || '';
                  const sufijo = unidadProd ? ` ${unidadProd}` : '';
                  return (
                    <tr key={mov.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(mov.created_at)}
                      </td>
                      <td className="p-3 font-bold text-xs max-w-[220px] truncate" title={mov.product?.name || undefined}>
                        {mov.product?.name || 'Producto desconocido'}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {mov.product?.sku || '—'}
                      </td>
                      <td className="p-3">
                        <span className={cn(
                          'inline-flex items-center gap-1 text-xs font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap',
                          obtenerClaseBadgeMovimiento(mov.movement_type)
                        )}>
                          <Icon className="w-3 h-3" aria-hidden="true" />
                          {obtenerEtiquetaMovimiento(mov.movement_type)}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground font-mono max-w-[160px] truncate" title={mov.reference_doc || undefined}>
                        {mov.reference_doc || '—'}
                      </td>
                      <td className="p-3 text-right font-bold text-success tabular-nums whitespace-nowrap">
                        {qc > 0 ? `+${formatearCantidad(qc)}${sufijo}` : '—'}
                      </td>
                      <td className="p-3 text-right font-bold text-destructive tabular-nums whitespace-nowrap">
                        {qc < 0 ? `−${formatearCantidad(Math.abs(qc))}${sufijo}` : '—'}
                      </td>
                      {/* §10/§11 — Saldo DESPUÉS de ese movimiento, del producto
                          de esa fila, en SU unidad. Nunca un total global. */}
                      <td className="p-3 text-right font-black tabular-nums whitespace-nowrap">
                        {mov.balance_after === null || mov.balance_after === undefined
                          ? '—'
                          : `${formatearCantidad(mov.balance_after)}${sufijo}`}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDetalle(mov)}
                          aria-label={`Ver detalle del movimiento de ${mov.product?.name || 'producto desconocido'}`}
                          className="h-8 w-8 p-0 rounded-lg"
                        >
                          <Eye className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas de movimiento (§26) */}
          <div className="md:hidden space-y-3">
            {movsGlobales.map(mov => {
              const qc = mov.quantity_change ?? 0;
              const Icon = obtenerIconoMovimiento(mov.movement_type);
              const unidadProd = mov.product?.unit_of_measure?.trim() || '';
              const sufijo = unidadProd ? ` ${unidadProd}` : '';
              return (
                <div key={mov.id} className="p-4 rounded-xl border border-border bg-card space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn(
                      'inline-flex items-center gap-1 text-xs font-black uppercase px-2 py-0.5 rounded-full border',
                      obtenerClaseBadgeMovimiento(mov.movement_type)
                    )}>
                      <Icon className="w-3 h-3" aria-hidden="true" />
                      {obtenerEtiquetaMovimiento(mov.movement_type)}
                    </span>
                    <span className="text-xs text-muted-foreground font-bold">{formatDate(mov.created_at)}</span>
                  </div>
                  <div className="font-black uppercase tracking-tight text-sm truncate">
                    {mov.product?.name || 'Producto desconocido'}
                    <span className="ml-2 font-mono text-[10px] font-bold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                      {mov.product?.sku || '—'}
                    </span>
                  </div>
                  {mov.reference_doc && (
                    <div className="text-xs text-muted-foreground font-mono">
                      Documento: <span className="font-bold">{mov.reference_doc}</span>
                    </div>
                  )}
                  <div className="flex items-end justify-between pt-1">
                    <div className="text-sm">
                      {qc > 0 && (
                        <span className="font-black text-success tabular-nums">Entrada&nbsp;&nbsp;+{formatearCantidad(qc)}{sufijo}</span>
                      )}
                      {qc < 0 && (
                        <span className="font-black text-destructive tabular-nums">Salida&nbsp;&nbsp;−{formatearCantidad(Math.abs(qc))}{sufijo}</span>
                      )}
                      {qc === 0 && <span className="text-muted-foreground font-bold">Sin variación</span>}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Saldo del producto</div>
                      <div className="text-lg font-black tabular-nums leading-none">
                        {mov.balance_after === null || mov.balance_after === undefined
                          ? '—'
                          : `${formatearCantidad(mov.balance_after)}${sufijo}`}
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border/50">
                    <SecondaryButton
                      label="Ver detalle"
                      icon={Eye}
                      onClick={() => setDetalle(mov)}
                      aria-label={`Ver detalle del movimiento de ${mov.product?.name || 'producto desconocido'}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* §23 — Paginación progresiva con total exacto */}
          {(hayMas || movsGlobales.length < totalFiltrado) && (
            <div className="flex flex-col items-center gap-1 py-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => movimientos.fetchNextPage()}
                disabled={!hayMas || movimientos.isFetchingNextPage}
                className="h-auto rounded-full px-5 py-2 text-xs font-black uppercase tracking-wide"
              >
                {movimientos.isFetchingNextPage ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" aria-hidden="true" />
                    Cargando…
                  </>
                ) : (
                  'Cargar más movimientos'
                )}
              </Button>
              <span className="text-[10px] font-bold text-muted-foreground">
                Mostrando {movsGlobales.length} de {totalFiltrado}
              </span>
            </div>
          )}
        </>
      )}

      {/* §19 — Detalle del movimiento (modal) */}
      <BaseModal
        open={!!detalle}
        onOpenChange={open => { if (!open) setDetalle(null); }}
        title="Detalle del movimiento"
        description="Información registrada en el inventario para este movimiento."
        maxWidth="sm:max-w-lg"
      >
        {detalle && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                'inline-flex items-center gap-1 text-xs font-black uppercase px-2 py-0.5 rounded-full border',
                obtenerClaseBadgeMovimiento(detalle.movement_type)
              )}>
                {obtenerEtiquetaMovimiento(detalle.movement_type)}
              </span>
              <span className="text-xs text-muted-foreground font-bold">{formatDate(detalle.created_at)}</span>
            </div>

            <dl className="space-y-2">
              <div className="flex justify-between gap-4">
                <dt className="text-xs font-black uppercase tracking-widest text-muted-foreground">Producto</dt>
                <dd className="font-bold text-right">{detalle.product?.name || 'Producto desconocido'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-xs font-black uppercase tracking-widest text-muted-foreground">Código</dt>
                <dd className="font-mono font-bold">{detalle.product?.sku || '—'}</dd>
              </div>
              {(() => {
                const qc = detalle.quantity_change ?? 0;
                const unidadProd = detalle.product?.unit_of_measure?.trim() || '';
                const sufijo = unidadProd ? ` ${unidadProd}` : '';
                return (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="text-xs font-black uppercase tracking-widest text-muted-foreground">Cantidad</dt>
                      <dd className={cn('font-black tabular-nums', qc > 0 ? 'text-success' : qc < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {qc > 0 ? `+${formatearCantidad(qc)}${sufijo} (entrada)` : qc < 0 ? `−${formatearCantidad(Math.abs(qc))}${sufijo} (salida)` : `0${sufijo} (sin variación)`}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-xs font-black uppercase tracking-widest text-muted-foreground">Saldo del producto</dt>
                      <dd className="font-black tabular-nums">
                        {detalle.balance_after === null || detalle.balance_after === undefined
                          ? '—'
                          : `${formatearCantidad(detalle.balance_after)}${sufijo}`}
                      </dd>
                    </div>
                  </>
                );
              })()}
              <div className="flex justify-between gap-4">
                <dt className="text-xs font-black uppercase tracking-widest text-muted-foreground">Documento</dt>
                <dd className="font-mono font-bold text-right">{detalle.reference_doc || '—'}</dd>
              </div>
              {detalle.unit_cost !== null && detalle.unit_cost !== undefined && (
                <div className="flex justify-between gap-4">
                  <dt className="text-xs font-black uppercase tracking-widest text-muted-foreground">Costo unitario</dt>
                  <dd className="font-bold tabular-nums">{formatearCantidad(Number(detalle.unit_cost))}</dd>
                </div>
              )}
              {detalle.unit_price !== null && detalle.unit_price !== undefined && (
                <div className="flex justify-between gap-4">
                  <dt className="text-xs font-black uppercase tracking-widest text-muted-foreground">Precio unitario</dt>
                  <dd className="font-bold tabular-nums">{formatearCantidad(Number(detalle.unit_price))}</dd>
                </div>
              )}
              {detalle.created_by && (
                <div className="flex justify-between gap-4">
                  <dt className="text-xs font-black uppercase tracking-widest text-muted-foreground">Usuario</dt>
                  <dd className="font-mono text-xs break-all text-right max-w-[220px]">{detalle.created_by}</dd>
                </div>
              )}
            </dl>

            <p className="text-[10px] text-muted-foreground font-bold">
              El saldo mostrado corresponde exclusivamente a este producto después del movimiento (§11); no es un total del almacén.
            </p>

            {detalle.product?.id && (
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={() => abrirKardexDesdeDetalle(detalle)}
                  className="w-full h-auto py-2.5 rounded-xl font-black uppercase tracking-wide"
                >
                  <BookOpen className="w-4 h-4 mr-2" aria-hidden="true" />
                  Ver Kardex del producto
                </Button>
              </div>
            )}
          </div>
        )}
      </BaseModal>
    </div>
  );
}
