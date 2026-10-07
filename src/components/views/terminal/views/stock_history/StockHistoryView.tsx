'use client';

/**
 * TRAZABILIDAD — Inicio → Operación → Almacén → Inventario → Trazabilidad
 *
 * Evolución profesional (§3 del requisito): la pestaña trabaja en DOS NIVELES:
 *
 *   NIVEL 1 — BUSCAR PRODUCTO
 *     Pantalla limpia al entrar (§7): NO carga movimientos hasta que el
 *     usuario seleccione un producto. Buscador por código / nombre /
 *     descripción con ranking inteligente (§6).
 *
 *   NIVEL 2 — KARDEX DEL PRODUCTO
 *     Historial completo del producto seleccionado: cabecera identificada
 *     (§8), filtro por período con opciones rápidas (§9), saldo inicial
 *     (§10), movimientos cronológicos con saldo corrido de la fuente de
 *     verdad `balance_after` (§11/§12), resumen del período (§23),
 *     exportación CSV (§32) y experiencia móvil en tarjetas (§26).
 *
 * Fuente única de verdad (§34): tabla `stock_movements`, saldos
 * `balance_after` calculados server-side. Esta vista NUNCA recalcula saldos.
 * Las etiquetas de movimiento SIEMPRE pasan por el diccionario central
 * `movementPresentation` (§14-18): jamás se imprime el enum interno.
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
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SearchBar from '@/components/ui/SearchBar';
import ActionMenu from '@/components/ui/ActionMenu';
import { QueryInspector } from '@/components/ui/QueryInspector';
import { SecondaryButton } from '@/components/ui/atomic';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { getCleanStoreId } from '@/hooks/api/base';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { useAuthStore } from '@/store';
import { useProductKardex } from '@/hooks/api/useProductKardex';
import {
  rankearCoincidencias,
  formatearCantidad,
  type ProductSearchLike,
} from '@/lib/inventory/kardexPeriod';
import {
  obtenerEtiquetaMovimiento,
  obtenerClaseBadgeMovimiento,
  obtenerIconoMovimiento,
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
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function StockHistoryView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const cleanStoreId = getCleanStoreId(storeId);

  // ── NIVEL 1: búsqueda de producto (§3-7) ─────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchLike | null>(null);

  // ── NIVEL 2: período (§9) ────────────────────────────────────────────────
  const [periodKey, setPeriodKey] = useState<PeriodKey>('month');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const rango = useMemo(() => resolverRango(periodKey, customRange), [periodKey, customRange]);

  const kardex = useProductKardex(selectedProduct?.id ?? null, storeId, rango.from, rango.to);

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
    enabled: !selectedProduct && debouncedSearch.trim().length > 0,
  });

  const term = debouncedSearch.trim();
  const matches = productMatches.data ?? [];
  const unidad = selectedProduct?.unit_of_measure?.trim() || '';
  const sufijoUnidad = unidad ? ` ${unidad}` : '';

  const seleccionarProducto = (p: ProductSearchLike) => {
    setSelectedProduct(p);
    setPeriodKey('month');
    setCustomRange({ from: '', to: '' });
  };

  const cambiarProducto = () => {
    // §28: volver al buscador conservando el término para refinar la búsqueda.
    setSelectedProduct(null);
  };

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

  const onRefresh = () => {
    if (selectedProduct) kardex.refetch();
    else productMatches.refetch();
    toast.success('Trazabilidad actualizada.');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // NIVEL 2 — KARDEX DEL PRODUCTO (§8-§13, §21-§26, §28)
  // ─────────────────────────────────────────────────────────────────────────
  if (selectedProduct) {
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
                  Kardex del producto
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
            {/* §28 — Cambiar producto sin abandonar la vista */}
            <SecondaryButton
              label="Cambiar producto"
              icon={ArrowLeftRight}
              onClick={cambiarProducto}
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
                          {mov.reference_type === 'reversal' && (
                            <span className="ml-1 px-1 py-0.5 rounded bg-purple-500/20 text-purple-500 dark:text-purple-400 text-[9px] font-black uppercase">
                              Reversión
                            </span>
                          )}
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
  // NIVEL 1 — BUSCAR PRODUCTO (§4-§7, §30)
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Buscador de producto (§4) */}
      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        onClear={() => setSearchTerm('')}
        placeholder="Buscar por código, nombre o descripción…"
        inputId="trace-product-search"
        showSettings={false}
        aria-label="Buscar producto para consultar su Kardex"
      />

      <QueryInspector />

      {/* Pantalla inicial limpia (§7): sin movimientos cargados */}
      {!term && (
        <div className="text-center py-24 rounded-xl border-2 border-dashed border-border bg-card/50">
          <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-5" aria-hidden="true" />
          <p className="font-black uppercase tracking-widest text-sm text-foreground/70">
            Trazabilidad de inventario
          </p>
          <p className="mt-2 text-xs text-muted-foreground max-w-md mx-auto">
            Seleccione un producto para consultar su historial completo:
            saldo inicial, movimientos del período y saldo final.
          </p>
        </div>
      )}

      {/* Buscando… */}
      {term && productMatches.isLoading && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
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

      {/* §30 — Sin resultados */}
      {term && !productMatches.isLoading && !productMatches.error && matches.length === 0 && (
        <div className="text-center py-16 rounded-xl border-2 border-dashed border-border bg-card/50">
          <SearchX className="w-14 h-14 mx-auto mb-4 opacity-10" aria-hidden="true" />
          <p className="font-black text-sm text-foreground/80">
            No se encontraron productos que coincidan con «{term}».
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Verifique el término o intente con el código, nombre o descripción.
          </p>
          <div className="mt-4 flex justify-center">
            <SecondaryButton label="Limpiar búsqueda" onClick={() => setSearchTerm('')} />
          </div>
        </div>
      )}

      {/* §5/§6 — Coincidencias ordenadas por relevancia */}
      {term && matches.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1">
            {matches.length} coincidencia{matches.length !== 1 ? 's' : ''} encontrada{matches.length !== 1 ? 's' : ''}
          </div>
          {matches.map(p => (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              onClick={() => seleccionarProducto(p)}
              aria-label={`Consultar Kardex de ${p.name}${p.sku ? `, código ${p.sku}` : ''}`}
              className="w-full h-auto p-4 justify-between text-left rounded-xl hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center border bg-muted/30 border-border shrink-0">
                  <History className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
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
          ))}
        </div>
      )}
    </div>
  );
}
