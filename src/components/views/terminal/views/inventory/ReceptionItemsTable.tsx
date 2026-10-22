'use client';

// ─────────────────────────────────────────────────────────────────────────────
// MISIÓN UI/UX RECEPCIONES (2026-10-22) — Tabla profesional de productos
// agregados a la recepción.
//
// Diagnóstico previo: la lista era un `divide-y` compacto con datos en una
// sola línea secundaria (SKU · UM · Cant · Costo concatenados), editor inline
// de 6 campos en fila y sin jerarquía visual. No transmitía calidad comercial
// y en móvil forzaba truncado.
//
// Rediseño:
//   · Escritorio (md+): tabla real — # | Producto | Cant. | Costo unit. |
//     Importe | Acciones — con alineación numérica consistente (tabular-nums),
//     jerarquía nombre > código/metadatos y filas separadas sutilmente.
//   · Móvil (<md): tarjetas compactas con la misma información, sin scroll
//     horizontal y con acciones táctiles de 44px.
//   · Editor inline conservado con EXACTAMENTE la misma lógica y campos del
//     hook (cantidad, moneda, tasa, costo, venta, mon. venta) — solo cambia
//     la presentación.
//   · Resumen: nº de líneas, unidades totales SOLO si todas comparten la
//     misma UM, total en CUP (o estado «Tasa inválida»).
//
// INTEGRIDAD (misión §9): este componente es SOLO presentación. No altera
// cantidades, costos, monedas, tasas ni cálculos; los valores provienen
// intactos de useReceptionState. El importe de línea usa la misma aritmética
// que `totalCost` del hook (qty × costo, y ×tasa solo para conversión CUP
// informativa cuando la tasa es válida >1.5).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Package, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import type { ReceptionItem } from './useReceptionState';

interface ReceptionItemsTableProps {
  items: ReceptionItem[];
  totalCost: number | null;
  unitsSummary: { unit: string; total: number } | null;
  newCount: number;
  editingIndex: number | null;
  // editor inline (mismo estado del hook — sin lógica nueva)
  editQuantity: number;
  setEditQuantity: (v: number) => void;
  editMoneda: string;
  setEditMoneda: (v: string) => void;
  editTasa: number;
  setEditTasa: (v: number) => void;
  editCost: number;
  setEditCost: (v: number) => void;
  editSalePrice: number | null;
  setEditSalePrice: (v: number | null) => void;
  editPriceCurrency: string;
  setEditPriceCurrency: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  // acciones de línea
  onStartEdit: (index: number) => void;
  onRequestRemove: (localId: string) => void;
}

const CURRENCIES = ['CUP', 'USD', 'EUR', 'MLC'] as const;

/** Importe de línea en la moneda de compra + equivalente CUP informativo. */
function LineImport({ item }: { item: ReceptionItem }) {
  const base = item.quantity * item.unit_cost;
  const moneda = (item.moneda_recepcion || 'CUP').toUpperCase();
  const tasaValida = moneda !== 'CUP' && item.tasa_cambio_recepcion && item.tasa_cambio_recepcion > 1.5;
  return (
    <div className="text-right">
      <p className="font-black text-sm text-primary tabular-nums">
        {formatCurrency(base)}
        {moneda !== 'CUP' && <span className="text-[10px] font-bold text-muted-foreground ml-0.5">{moneda}</span>}
      </p>
      {moneda !== 'CUP' && (
        tasaValida ? (
          <p className="text-[10px] text-muted-foreground tabular-nums">
            ≈ {formatCurrency(base * (item.tasa_cambio_recepcion || 1))} CUP
          </p>
        ) : (
          <p className="text-[10px] text-warning flex items-center justify-end gap-0.5" title="Tasa de cambio no definida o inválida">
            <AlertTriangle className="w-3 h-3" /> Sin tasa
          </p>
        )
      )}
    </div>
  );
}

/** Identidad del producto: nombre con jerarquía + código/badges secundarios. */
function ProductIdentity({ item }: { item: ReceptionItem }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-bold text-sm leading-snug truncate max-w-full" title={item.name}>{item.name}</p>
        {item.is_new && (
          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/10 text-info border border-info/20">Nuevo</span>
        )}
        {item.update_price && (
          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">
            Venta: {formatCurrency(item.sale_price || 0)}
          </span>
        )}
        {item.variant_name && (
          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/10 text-info border border-info/20">Var: {item.variant_name}</span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
        {item.sku || '—'}
        <span className="font-sans ml-2">UM: {item.unit_of_measure}</span>
        {item.moneda_recepcion !== 'CUP' && (
          <span className="font-sans ml-2">{item.moneda_recepcion} × {item.tasa_cambio_recepcion}</span>
        )}
        {item.sale_price != null && (
          <span className="font-sans ml-2">Venta: {formatCurrency(item.sale_price)} {item.price_currency || 'CUP'}</span>
        )}
      </p>
    </div>
  );
}

/** Editor inline de línea — mismos campos y handlers que la versión previa. */
function InlineEditor(props: ReceptionItemsTableProps) {
  const s = props;
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-muted/40 border border-border p-3 mt-2">
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase text-muted-foreground block">Cant.</label>
        <input type="number" inputMode="decimal" min="0.0001" step="0.01" value={s.editQuantity} onChange={e => s.setEditQuantity(Math.max(0.0001, parseFloat(e.target.value) || 1))} className="w-16 px-2 py-1.5 text-xs font-bold rounded-lg border border-border bg-background" autoFocus />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase text-muted-foreground block">Moneda</label>
        <select value={s.editMoneda} onChange={e => { s.setEditMoneda(e.target.value); if (e.target.value === 'CUP') s.setEditTasa(1.0); }} className="w-16 px-1 py-1.5 text-xs font-bold rounded-lg border border-border bg-background">
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {s.editMoneda !== 'CUP' && (
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted-foreground block">Tasa</label>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={s.editTasa || ''} onChange={e => s.setEditTasa(parseFloat(e.target.value) || 1.0)} className="w-20 px-2 py-1.5 text-xs font-bold rounded-lg border border-border bg-background" />
        </div>
      )}
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase text-muted-foreground block">Costo ({s.editMoneda})</label>
        <input type="number" inputMode="decimal" min="0" step="0.01" value={s.editCost || ''} onChange={e => s.setEditCost(parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1.5 text-xs font-bold rounded-lg border border-border bg-background" />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase text-muted-foreground block">Venta</label>
        <input type="number" inputMode="decimal" min="0" step="0.01" value={s.editSalePrice ?? ''} onChange={e => s.setEditSalePrice(e.target.value ? parseFloat(e.target.value) : null)} className="w-20 px-2 py-1.5 text-xs font-bold rounded-lg border border-border bg-background" placeholder="—" />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase text-muted-foreground block">Mon. Venta</label>
        <select value={s.editPriceCurrency} onChange={e => s.setEditPriceCurrency(e.target.value)} className="w-16 px-1 py-1.5 text-xs font-bold rounded-lg border border-border bg-background">
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <button onClick={s.onSaveEdit} className="px-3 py-1.5 text-[10px] font-black uppercase rounded-lg bg-primary/10 text-primary hover:bg-primary/20 min-h-[32px]" type="button">Guardar</button>
        <button type="button" onClick={s.onCancelEdit} className="px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 min-h-[32px]">Cancelar</button>
      </div>
    </div>
  );
}

export function ReceptionItemsTable(props: ReceptionItemsTableProps) {
  const { items, totalCost, unitsSummary, newCount } = props;

  return (
    <div className="space-y-3">
      {/* ── Escritorio: tabla profesional (md+) ── */}
      <div className="hidden md:block rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th scope="col" className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 py-2.5 w-10">#</th>
              <th scope="col" className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 py-2.5">Producto</th>
              <th scope="col" className="text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 py-2.5 w-24">Cant.</th>
              <th scope="col" className="text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 py-2.5 w-32">Costo unit.</th>
              <th scope="col" className="text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 py-2.5 w-36">Importe</th>
              <th scope="col" className="text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 py-2.5 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item, index) => (
              <React.Fragment key={item.local_id}>
                <tr className={cn('transition-colors', props.editingIndex === index ? 'bg-primary/5' : 'hover:bg-muted/30')}>
                  <td className="px-3 py-2.5 align-top">
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">{index + 1}</span>
                  </td>
                  <td className="px-3 py-2.5 align-top max-w-[320px]">
                    <ProductIdentity item={item} />
                  </td>
                  <td className="px-3 py-2.5 align-top text-right">
                    <span className="font-bold tabular-nums">{item.quantity}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">{item.unit_of_measure}</span>
                  </td>
                  <td className="px-3 py-2.5 align-top text-right tabular-nums">
                    {formatCurrency(item.unit_cost)}
                    {item.moneda_recepcion !== 'CUP' && (
                      <span className="text-[10px] text-muted-foreground ml-0.5">{item.moneda_recepcion}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <LineImport item={item} />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex items-center justify-end gap-1">
                      {props.editingIndex !== index && (
                        <button type="button" onClick={() => props.onStartEdit(index)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-primary/10 rounded-lg text-muted-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30" aria-label={`Editar ${item.name}`} title="Editar línea">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => props.onRequestRemove(item.local_id)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-destructive/10 rounded-lg text-destructive/70 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30" aria-label={`Eliminar ${item.name}`} title="Eliminar línea">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {props.editingIndex === index && (
                  <tr>
                    <td colSpan={6} className="px-3 pb-3">
                      <InlineEditor {...props} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Móvil: tarjetas compactas (<md) ── */}
      <div className="md:hidden space-y-2.5">
        {items.map((item, index) => (
          <div key={item.local_id} className={cn(
            'rounded-xl border bg-card p-3.5 space-y-2.5',
            props.editingIndex === index ? 'border-primary/40 bg-primary/5' : 'border-border'
          )}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="shrink-0 text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded mt-0.5">{index + 1}</span>
                <div className="min-w-0">
                  <ProductIdentity item={item} />
                </div>
              </div>
              <LineImport item={item} />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Cant.</span>
                <span className="font-black tabular-nums">{item.quantity}</span>
                <span className="text-[10px] text-muted-foreground">{item.unit_of_measure}</span>
              </div>
              <div className="flex items-center gap-1">
                {props.editingIndex !== index && (
                  <button type="button" onClick={() => props.onStartEdit(index)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-primary/10 rounded-lg text-muted-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30" aria-label={`Editar ${item.name}`}>
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                <button type="button" onClick={() => props.onRequestRemove(item.local_id)} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-destructive/10 rounded-lg text-destructive/70 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30" aria-label={`Eliminar ${item.name}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {props.editingIndex === index && <InlineEditor {...props} />}
          </div>
        ))}
      </div>

      {/* ── Resumen comercial de la recepción ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-border px-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs text-muted-foreground">
            <strong className="text-foreground font-black">{items.length}</strong> línea{items.length !== 1 ? 's' : ''}
          </span>
          {newCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/20">
              {newCount} nuevo{newCount !== 1 ? 's' : ''}
            </span>
          )}
          {unitsSummary && (
            <span className="text-xs text-muted-foreground">
              <strong className="text-foreground font-black tabular-nums">{unitsSummary.total}</strong> {unitsSummary.unit} en total
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Total (CUP):</span>
          {totalCost === null ? (
            <span className="font-black text-lg text-destructive tabular-nums flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Tasa inválida
            </span>
          ) : (
            <span className="font-black text-lg text-primary tabular-nums">{formatCurrency(totalCost)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReceptionItemsTable;
