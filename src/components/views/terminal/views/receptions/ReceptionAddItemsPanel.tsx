'use client';

/**
 * CP-RECEPCIONES-CATALOGO-MAESTRO-001 (fase 3) — Panel «Agregar productos»
 * para el modal de edición de recepciones en Borrador (pending).
 *
 * Capacidades (misión §5):
 *   · Buscar y seleccionar productos existentes (catálogo de la tienda +
 *     filas del Catálogo Maestro de la organización — estas últimas se
 *     resuelven server-side por el escritor canónico).
 *   · Crear un producto nuevo: sin teclear SKU, el servidor asigna el
 *     siguiente código OFICIAL del Catálogo Maestro (auto_sku).
 *   · Varias líneas simultáneas, con cantidad/costo/moneda/tasa editables.
 *   · Las líneas se envían al guardado atómico (save_pending_reception_changes).
 *
 * Sin escrituras propias: la persistencia la hace el guardado del modal vía
 * PATCH /api/inventory/receptions/[id] con newItems.
 */
import React, { useState, useRef, useCallback } from 'react';
import { Plus, Search, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { cn } from '@/lib/utils';

export interface StagedReceptionLine {
  key: string;
  product_id: string | null;
  sku: string;
  name: string;
  quantity: number;
  unit_cost: number;
  unit_of_measure: string;
  sale_price?: number | null;
  barcode?: string | null;
  moneda_recepcion: string;
  tasa_cambio_recepcion: number;
  origin: 'existing' | 'master' | 'manual';
}

interface SearchResultRow {
  id: string | null;
  sku: string;
  name: string;
  barcode?: string | null;
  cost_price?: number | null;
  price?: number | null;
  unit_of_measure?: string;
  stock_current?: number;
  source?: 'local' | 'master';
}

interface ReceptionAddItemsPanelProps {
  storeId: string;
  existingProductIds: string[];
  lines: StagedReceptionLine[];
  onLinesChange: (lines: StagedReceptionLine[]) => void;
  disabled?: boolean;
}

const CURRENCIES = ['CUP', 'USD', 'EUR', 'MLC'] as const;

export function ReceptionAddItemsPanel({
  storeId,
  existingProductIds,
  lines,
  onLinesChange,
  disabled = false,
}: ReceptionAddItemsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [showManual, setShowManual] = useState(false);
  // Formulario de producto nuevo (manual).
  const [manual, setManual] = useState({
    name: '', sku: '', quantity: '1', unit_cost: '', unit_of_measure: 'unidad', sale_price: '',
  });
  const searchSeq = useRef(0);

  const debouncedSearch = useDebounce(searchTerm, 350);

  const doSearch = useCallback(async (term: string) => {
    if (!term.trim() || term.trim().length < 2) { setResults([]); return; }
    const seq = ++searchSeq.current;
    setSearching(true);
    try {
      const { data, error } = await supabase.rpc('get_products_for_reception', {
        p_store_id: storeId,
        p_search_term: term.trim(),
        p_page: 1,
        p_page_size: 8,
      });
      if (seq !== searchSeq.current) return; // respuesta obsoleta
      if (error) throw error;
      setResults(Array.isArray(data) ? (data as unknown as SearchResultRow[]) : []);
    } catch (e) {
      console.error('[ReceptionAddItemsPanel] búsqueda falló:', e);
      setResults([]);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, [storeId]);

  React.useEffect(() => { doSearch(debouncedSearch); }, [debouncedSearch, doSearch]);

  const existingIds = new Set(existingProductIds);
  const stagedProductIds = new Set(lines.map(l => l.product_id).filter(Boolean) as string[]);
  const stagedKeys = new Set(lines.map(l => `${(l.sku || '').toLowerCase()}|${(l.name || '').toLowerCase()}`));

  const addLine = (line: Omit<StagedReceptionLine, 'key'>) => {
    onLinesChange([...lines, { ...line, key: `nl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]);
  };

  const handlePickResult = (r: SearchResultRow) => {
    // Producto ya presente en la recepción (línea existente o staged).
    if (r.source !== 'master' && r.id && (existingIds.has(r.id) || stagedProductIds.has(r.id))) {
      toast.info(`"${r.name}" ya está en la recepción — edite su cantidad en la tabla`);
      return;
    }
    const dupKey = `${(r.sku || '').toLowerCase()}|${(r.name || '').toLowerCase()}`;
    if (stagedKeys.has(dupKey)) {
      toast.info(`"${r.name}" ya está en la lista de líneas nuevas`);
      return;
    }
    if (r.source === 'master') {
      // Fila solo-maestro (tienda conectada): se resuelve server-side con el
      // escritor canónico (activación de la identidad compartida).
      addLine({
        product_id: null,
        sku: r.sku || '',
        name: r.name,
        quantity: 1,
        unit_cost: Number(r.cost_price ?? 0) || 0,
        unit_of_measure: r.unit_of_measure || 'unidad',
        sale_price: r.price ?? null,
        barcode: r.barcode ?? null,
        moneda_recepcion: 'CUP',
        tasa_cambio_recepcion: 1,
        origin: 'master',
      });
      toast.info(`"${r.name}" (catálogo maestro) agregado — se activará al guardar`);
    } else {
      addLine({
        product_id: r.id!,
        sku: r.sku || '',
        name: r.name,
        quantity: 1,
        unit_cost: Number(r.cost_price ?? 0) || 0,
        unit_of_measure: r.unit_of_measure || 'unidad',
        sale_price: r.price ?? null,
        barcode: r.barcode ?? null,
        moneda_recepcion: 'CUP',
        tasa_cambio_recepcion: 1,
        origin: 'existing',
      });
      toast.success(`"${r.name}" agregado a la lista`);
    }
  };

  const handleManualAdd = () => {
    const name = manual.name.trim();
    const quantity = parseFloat(manual.quantity) || 0;
    const unit_cost = parseFloat(manual.unit_cost) || 0;
    if (!name) { toast.error('El nombre del producto es obligatorio'); return; }
    if (quantity <= 0) { toast.error('La cantidad debe ser mayor que 0'); return; }
    if (unit_cost <= 0) { toast.error('El costo unitario debe ser mayor que 0'); return; }
    const sku = manual.sku.trim();
    if (sku && (existingIds.size >= 0)) {
      // El backend valida unicidad real; aquí solo anti-duplicado básico en la lista.
    }
    if (stagedKeys.has(`${sku.toLowerCase()}|${name.toLowerCase()}`)) {
      toast.info('Ese producto ya está en la lista de líneas nuevas');
      return;
    }
    addLine({
      product_id: null,
      sku,
      name,
      quantity,
      unit_cost,
      unit_of_measure: manual.unit_of_measure || 'unidad',
      sale_price: manual.sale_price ? parseFloat(manual.sale_price) : null,
      barcode: null,
      moneda_recepcion: 'CUP',
      tasa_cambio_recepcion: 1,
      origin: 'manual',
    });
    setManual({ name: '', sku: '', quantity: '1', unit_cost: '', unit_of_measure: 'unidad', sale_price: '' });
    setShowManual(false);
    toast.success(
      sku
        ? `"${name}" agregado (se creará con el SKU "${sku}")`
        : `"${name}" agregado — el sistema asignará el siguiente código del Catálogo Maestro`,
    );
  };

  const updateLine = (key: string, patch: Partial<StagedReceptionLine>) => {
    onLinesChange(lines.map(l => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    onLinesChange(lines.filter(l => l.key !== key));
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-3" data-testid="reception-add-items-panel">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h5 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Agregar productos
        </h5>
        <span className="text-[10px] font-bold text-muted-foreground">
          {lines.length > 0 ? `${lines.length} línea(s) nueva(s) pendiente(s) de guardar` : 'La recepción está Pendiente: puede seguir agregando productos'}
        </span>
      </div>

      {/* Búsqueda de productos existentes */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Buscar producto existente por nombre, SKU o código de barras…"
          aria-label="Buscar producto para agregar a la recepción"
          disabled={disabled}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50"
          data-testid="reception-add-items-search"
        />
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">buscando…</span>}
      </div>

      {results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-white/5" data-testid="reception-add-items-results">
          {results.map((r, i) => {
            const already = r.source !== 'master' && r.id && (existingIds.has(r.id) || stagedProductIds.has(r.id));
            return (
              <li key={`${r.id || r.sku}-${i}`}>
                <button
                  type="button"
                  onClick={() => handlePickResult(r)}
                  disabled={disabled || !!already}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-primary/10 transition-colors',
                    already && 'opacity-40 cursor-not-allowed',
                  )}
                  aria-label={`Agregar ${r.name} (${r.sku || 'sin código'}) a la recepción`}
                >
                  <span className="flex flex-col min-w-0">
                    <span className="text-xs font-bold truncate">{r.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {r.sku || 'sin código'}{r.source === 'master' ? ' · catálogo maestro' : ''}{r.stock_current != null ? ` · stock ${r.stock_current}` : ''}
                    </span>
                  </span>
                  <Plus className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Producto nuevo (manual) */}
      <div>
        <button
          type="button"
          onClick={() => setShowManual(v => !v)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-primary hover:underline disabled:opacity-50"
          aria-expanded={showManual}
          aria-controls="reception-add-manual-form"
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          {showManual ? 'Cerrar alta de producto nuevo' : 'Producto nuevo (sin buscar)'}
        </button>
        {showManual && (
          <div id="reception-add-manual-form" className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl border border-border bg-background p-3">
            <label className="col-span-2 sm:col-span-1 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre *</span>
              <input
                value={manual.name}
                onChange={e => setManual(m => ({ ...m, name: e.target.value }))}
                disabled={disabled}
                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Nombre del producto nuevo"
                data-testid="reception-add-manual-name"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">SKU (opcional)</span>
              <input
                value={manual.sku}
                onChange={e => setManual(m => ({ ...m, sku: e.target.value }))}
                disabled={disabled}
                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-mono outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="SKU del producto nuevo (opcional; vacío el servidor asigna el código oficial)"
                placeholder="vacío = código oficial"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cantidad *</span>
              <input
                type="number" min="0.01" step="any"
                value={manual.quantity}
                onChange={e => setManual(m => ({ ...m, quantity: e.target.value }))}
                disabled={disabled}
                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-black tabular-nums text-center outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Cantidad del producto nuevo"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Costo U. *</span>
              <input
                type="number" min="0.01" step="any"
                value={manual.unit_cost}
                onChange={e => setManual(m => ({ ...m, unit_cost: e.target.value }))}
                disabled={disabled}
                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-bold tabular-nums text-right outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Costo unitario del producto nuevo"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">U. de medida</span>
              <input
                value={manual.unit_of_measure}
                onChange={e => setManual(m => ({ ...m, unit_of_measure: e.target.value }))}
                disabled={disabled}
                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Unidad de medida del producto nuevo"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Precio venta</span>
              <input
                type="number" min="0" step="any"
                value={manual.sale_price}
                onChange={e => setManual(m => ({ ...m, sale_price: e.target.value }))}
                disabled={disabled}
                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-bold tabular-nums text-right outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Precio de venta del producto nuevo (opcional)"
              />
            </label>
            <div className="col-span-2 sm:col-span-3 flex justify-end">
              <button
                type="button"
                onClick={handleManualAdd}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                aria-label="Agregar el producto nuevo a la lista"
                data-testid="reception-add-manual-submit"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Agregar a la lista
              </button>
            </div>
            <p className="col-span-2 sm:col-span-3 text-[10px] text-muted-foreground leading-tight">
              Sin SKU: el sistema asigna el siguiente código disponible del Catálogo Maestro al guardar.
            </p>
          </div>
        )}
      </div>

      {/* Líneas nuevas pendientes de guardar */}
      {lines.length > 0 && (
        <div className="rounded-xl border border-primary/30 overflow-x-auto" data-testid="reception-add-items-staged">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest text-left">
                <th className="p-2">Producto</th>
                <th className="p-2 text-center">Cant.</th>
                <th className="p-2 text-right">Costo U.</th>
                <th className="p-2 text-center">Moneda</th>
                <th className="p-2 text-center">Tasa</th>
                <th className="p-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.key} className="border-t border-white/5">
                  <td className="p-2">
                    <div className="font-bold max-w-[220px] truncate" title={l.name}>{l.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {l.sku || (l.origin === 'master' ? 'existente en maestro' : 'código por asignar')}
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="number" min="0.01" step="any"
                      value={l.quantity}
                      onChange={e => updateLine(l.key, { quantity: parseFloat(e.target.value) || 0 })}
                      disabled={disabled}
                      className="w-16 px-1.5 py-1 text-center rounded-lg border border-border bg-background font-black tabular-nums outline-none focus:ring-2 focus:ring-primary/20"
                      aria-label={`Cantidad de ${l.name}`}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number" min="0.01" step="any"
                      value={l.unit_cost}
                      onChange={e => updateLine(l.key, { unit_cost: parseFloat(e.target.value) || 0 })}
                      disabled={disabled}
                      className="w-20 px-1.5 py-1 text-right rounded-lg border border-border bg-background font-bold tabular-nums outline-none focus:ring-2 focus:ring-primary/20"
                      aria-label={`Costo unitario de ${l.name}`}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <select
                      value={l.moneda_recepcion}
                      onChange={e => {
                        const moneda = e.target.value;
                        updateLine(l.key, { moneda_recepcion: moneda, tasa_cambio_recepcion: moneda === 'CUP' ? 1 : l.tasa_cambio_recepcion });
                      }}
                      disabled={disabled}
                      className="px-1 py-1 rounded-lg border border-border bg-background font-bold outline-none focus:ring-2 focus:ring-primary/20"
                      aria-label={`Moneda de ${l.name}`}
                    >
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="number" min="1" step="0.01"
                      value={l.tasa_cambio_recepcion}
                      disabled={disabled || l.moneda_recepcion === 'CUP'}
                      onChange={e => updateLine(l.key, { tasa_cambio_recepcion: parseFloat(e.target.value) || 1 })}
                      className="w-20 px-1.5 py-1 text-center rounded-lg border border-border bg-background font-bold tabular-nums outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                      aria-label={`Tasa de cambio de ${l.name}`}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      disabled={disabled}
                      className="text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                      aria-label={`Quitar ${l.name} de la lista de líneas nuevas`}
                      title="Quitar de la lista"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-2 py-1.5 text-[10px] text-muted-foreground border-t border-white/5">
            Las líneas nuevas se guardan junto con el resto de cambios al pulsar «Guardar cambios».
          </p>
        </div>
      )}
    </div>
  );
}
