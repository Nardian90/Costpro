'use client';

/**
 * ValeSalidaDetalleModal — Detalle documental «VALE DE SALIDA».
 *
 * El usuario pulsa «Ver» sobre un vale y aquí ve EL DOCUMENTO REAL
 * (requisito 7/8 del brief de profesionalización), no un expandible técnico:
 *
 *   Encabezado:  VALE DE SALIDA · slip_number · estado · fecha
 *   Datos:       responsable, concepto (notes), OT relacionada, almacén
 *   Cuerpo:      tabla de productos — Producto | Código | Cantidad (con unidad) |
 *                Costo unitario | Costo total
 *   Pie:         trazabilidad documental (creador, devolución/anulación + motivo)
 *   Movimientos: los movimientos de inventario generados por este vale
 *                (stock_movements.reference_id = issue_slips.id — relación REAL
 *                auditada en migraciones; el documento no se reconstruye, se lee).
 *
 * NO duplica lógica: los datos del vale llegan ya cargados por la query RLS
 * de ValesSalidaView; los movimientos se consultan con el mismo cliente RLS.
 * Reutiliza DocumentStatusBadge (estados reales completed/voided/reversed) y
 * el diccionario movementPresentation para etiquetar tipos de movimiento.
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Factory,
  Undo2,
  ArrowLeftRight,
  Package,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { BaseModal } from '@/components/ui/BaseModal';
import { DocumentStatusBadge } from '@/components/ui/DocumentStatusBadge';
import {
  obtenerEtiquetaMovimiento,
  obtenerClaseBadgeMovimiento,
  obtenerIconoMovimiento,
} from '@/lib/inventory/movementPresentation';
import { formatearCantidad } from '@/lib/inventory/kardexPeriod';

// Re-export del tipo para que la vista padre y este modal comparten UNA forma.
export type ValeSalidaItem = {
  id: string;
  slip_id: string;
  product_id: string;
  variant_id: string | null;
  production_order_item_id: string | null;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  products?: { name: string; sku: string | null; unit_of_measure?: string | null } | null;
};

export type ValeSalidaDoc = {
  id: string;
  store_id: string;
  slip_number: string;
  status: 'completed' | 'voided' | 'reversed';
  production_order_id: string | null;
  notes: string;
  total_cost: number;
  created_by: string;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  items?: ValeSalidaItem[];
  creator?: { full_name: string } | null;
  voider?: { full_name: string } | null;
  production_orders?: { order_number: string; order_type: string } | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Movimientos del vale (stock_movements.reference_id = issue_slips.id)
// ─────────────────────────────────────────────────────────────────────────────

interface MovimientoVale {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: number;
  reference_doc: string | null;
  product?: { name?: string | null; sku?: string | null; unit_of_measure?: string | null } | null;
}

function useMovimientosVale(slipId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['vale-salida-movimientos', slipId],
    queryFn: async () => {
      if (!slipId) return [] as MovimientoVale[];
      const { data, error } = await supabase
        .from('stock_movements')
        .select(
          'id, created_at, movement_type, quantity_change, reference_doc, product:products(name, sku, unit_of_measure)'
        )
        .eq('reference_id', slipId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as MovimientoVale[];
    },
    enabled: enabled && !!slipId,
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────

interface ValeSalidaDetalleModalProps {
  open: boolean;
  onClose: () => void;
  vale: ValeSalidaDoc | null;
  /** Nombre del almacén (tienda activa) para el encabezado documental. */
  storeName?: string | null;
  /** El vale completado puede devolverse (espejo de la matriz de acciones). */
  canReverse: boolean;
  onReverse: (vale: ValeSalidaDoc) => void;
}

export function ValeSalidaDetalleModal({
  open,
  onClose,
  vale,
  storeName,
  canReverse,
  onReverse,
}: ValeSalidaDetalleModalProps) {
  // Default `[]`: en TanStack Query v5 `data` es `TData | undefined`; los ternarios
  // de render (loadingMovs / errorMovs) no reducen el tipo y `next build` falla con TS18048.
  const { data: movimientos = [], isLoading: loadingMovs, error: errorMovs } = useMovimientosVale(
    vale?.id ?? null,
    open
  );

  const items = useMemo(() => vale?.items ?? [], [vale]);
  const totalLineas = items.length;
  // Cantidad total SOLO como conteo de líneas/unidades del documento — no se
  // suman costos aquí (total_cost ya viene del servidor).
  const resumenLineas = `${totalLineas} ${totalLineas === 1 ? 'línea' : 'líneas'}`;

  return (
    <BaseModal
      open={open}
      onOpenChange={o => { if (!o) onClose(); }}
      aria-label={`Detalle del Vale de Salida ${vale?.slip_number ?? ''}`}
      maxWidth="sm:max-w-3xl"
      title={
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xl font-black uppercase tracking-tight">Vale de Salida</span>
          {vale && (
            <>
              <span className="font-mono text-sm font-black text-primary">{vale.slip_number}</span>
              <DocumentStatusBadge type="issue_slip" status={vale.status} size="xs" />
            </>
          )}
        </div>
      }
      description={
        vale
          ? `Documento de salida de inventario · ${formatDate(vale.created_at)}`
          : 'Documento de salida de inventario'
      }
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <p className="text-[10px] text-muted-foreground font-bold hidden sm:block">
            El stock ya fue descontado al emitir el documento.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            {vale && vale.status === 'completed' && canReverse && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onReverse(vale)}
                className="h-9 rounded-lg border-purple-500/40 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
              >
                <Undo2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Devolver
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} className="h-9 rounded-lg">
              Cerrar
            </Button>
          </div>
        </div>
      }
    >
      {!vale ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          No hay documento seleccionado.
        </p>
      ) : (
        <div className="space-y-5">
          {/* ── Datos del documento ── */}
          <section aria-label="Datos del documento">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Dato etiqueta="Responsable" valor={vale.creator?.full_name || '—'} />
              <Dato etiqueta="Almacén" valor={storeName || '—'} />
              <Dato
                etiqueta="Concepto"
                valor={vale.notes || '—'}
                full
              />
              {vale.production_orders && (
                <Dato
                  etiqueta="Orden relacionada"
                  valor={`OT ${vale.production_orders.order_number} · ${vale.production_orders.order_type}`}
                  icon={<Factory className="w-3.5 h-3.5 inline mr-1 -mt-0.5" aria-hidden="true" />}
                />
              )}
              <Dato etiqueta="Emitido" valor={formatDate(vale.created_at)} />
              {vale.total_cost > 0 && (
                <Dato etiqueta="Costo total" valor={formatCurrency(vale.total_cost)} mono />
              )}
            </div>
          </section>

          {/* ── Productos ── */}
          <section aria-label="Productos del vale">
            <EncabezadoSeccion icon={<Package className="w-3.5 h-3.5" aria-hidden="true" />}>
              Productos ({resumenLineas})
            </EncabezadoSeccion>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3">
                Este vale no tiene líneas de producto registradas.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="p-2.5 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Producto</th>
                      <th className="p-2.5 text-left font-black uppercase text-[10px] tracking-widest text-muted-foreground">Código</th>
                      <th className="p-2.5 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">Cantidad</th>
                      <th className="p-2.5 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground hidden sm:table-cell">Costo unit.</th>
                      <th className="p-2.5 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground hidden sm:table-cell">Costo total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => {
                      // Unidad REAL del producto (embed products.unit_of_measure).
                      // La cantidad se muestra tal como fue registrada en el vale;
                      // la unidad identifica el tipo, nunca se inventa una.
                      const unidad = it.products?.unit_of_measure?.trim() || '';
                      const sufijo = unidad ? ` ${unidad}` : '';
                      return (
                        <tr key={it.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                          <td className="p-2.5 font-bold max-w-[240px] truncate" title={it.products?.name || undefined}>
                            {it.products?.name || 'Producto eliminado'}
                          </td>
                          <td className="p-2.5 font-mono text-muted-foreground">
                            {it.products?.sku || '—'}
                          </td>
                          <td className="p-2.5 text-right font-black tabular-nums whitespace-nowrap">
                            {formatearCantidad(it.quantity)}{sufijo}
                          </td>
                          <td className="p-2.5 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                            {it.unit_cost != null ? formatCurrency(it.unit_cost) : '—'}
                          </td>
                          <td className="p-2.5 text-right tabular-nums font-bold hidden sm:table-cell">
                            {it.total_cost != null ? formatCurrency(it.total_cost) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {vale.total_cost > 0 && (
                    <tfoot>
                      <tr className="border-t border-border bg-muted/30">
                        <td colSpan={4} className="p-2.5 text-right font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                          Costo total del documento
                        </td>
                        <td className="p-2.5 text-right font-black tabular-nums">
                          {formatCurrency(vale.total_cost)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </section>

          {/* ── Movimientos de inventario generados ── */}
          <section aria-label="Movimientos de inventario del vale">
            <EncabezadoSeccion icon={<ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />}>
              Movimientos de inventario
            </EncabezadoSeccion>
            {loadingMovs ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Cargando movimientos…
              </p>
            ) : errorMovs ? (
              <p className="text-xs text-warning flex items-center gap-1.5 py-2">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                No se pudieron cargar los movimientos.
              </p>
            ) : movimientos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                Sin movimientos vinculados a este documento.
              </p>
            ) : (
              <ul className="rounded-lg border border-border divide-y divide-border/50 overflow-hidden">
                {movimientos.map(m => {
                  const Icon = obtenerIconoMovimiento(m.movement_type);
                  const qc = m.quantity_change ?? 0;
                  const unidad = m.product?.unit_of_measure?.trim() || '';
                  const sufijo = unidad ? ` ${unidad}` : '';
                  return (
                    <li key={m.id} className="flex items-center gap-2.5 px-2.5 py-2 text-xs bg-card">
                      <span className={cn(
                        'inline-flex items-center gap-1 font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap',
                        obtenerClaseBadgeMovimiento(m.movement_type)
                      )}>
                        <Icon className="w-3 h-3" aria-hidden="true" />
                        {obtenerEtiquetaMovimiento(m.movement_type)}
                      </span>
                      <span className="font-bold truncate flex-1" title={m.product?.name || undefined}>
                        {m.product?.name || 'Producto'}
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">{formatDate(m.created_at)}</span>
                      <span className={cn(
                        'font-black tabular-nums whitespace-nowrap',
                        qc > 0 ? 'text-success' : qc < 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {qc > 0 ? `+${formatearCantidad(qc)}` : qc < 0 ? `−${formatearCantidad(Math.abs(qc))}` : '0'}
                        {sufijo}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Trazabilidad documental (solo campos reales) ── */}
          <section aria-label="Trazabilidad documental">
            <EncabezadoSeccion icon={<FileText className="w-3.5 h-3.5" aria-hidden="true" />}>
              Trazabilidad
            </EncabezadoSeccion>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              <Dato etiqueta="Creado por" valor={vale.creator?.full_name || '—'} />
              <Dato etiqueta="Fecha de creación" valor={formatDate(vale.created_at)} />
              {vale.status === 'reversed' && (
                <>
                  <Dato etiqueta="Devuelto por" valor={vale.voider?.full_name || '—'} />
                  <Dato etiqueta="Fecha de devolución" valor={vale.voided_at ? formatDate(vale.voided_at) : '—'} />
                  {vale.void_reason && <Dato etiqueta="Motivo" valor={vale.void_reason} full />}
                </>
              )}
              {vale.status === 'voided' && (
                <>
                  <Dato etiqueta="Anulado por" valor={vale.voider?.full_name || '—'} />
                  <Dato etiqueta="Fecha de anulación" valor={vale.voided_at ? formatDate(vale.voided_at) : '—'} />
                  {vale.void_reason && <Dato etiqueta="Motivo" valor={vale.void_reason} full />}
                </>
              )}
              {vale.status === 'completed' && (
                <p className="text-[10px] text-muted-foreground italic sm:col-span-2 flex items-center gap-1">
                  <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                  La devolución de este vale generará la entrada compensatoria de inventario.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </BaseModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Átomos locales de presentación
// ─────────────────────────────────────────────────────────────────────────────

function Dato({
  etiqueta,
  valor,
  full,
  mono,
  icon,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  full?: boolean;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col', full && 'sm:col-span-2')}>
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {icon}
        {etiqueta}
      </span>
      <span className={cn('font-bold break-words', mono && 'font-mono')}>{valor}</span>
    </div>
  );
}

function EncabezadoSeccion({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
      {icon}
      {children}
    </p>
  );
}
