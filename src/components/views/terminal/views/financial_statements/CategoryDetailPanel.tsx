'use client';

/**
 * CP-FIN · Vista B — Panel de drilldown de una categoría.
 *
 * Se monta SOLO cuando la fila de la categoría está expandida: carga los
 * primeros 20 movimientos (GET /api/fin/statements/category-detail) y pagina
 * con «Ver más» (offset + 20). Cada fila muestra la referencia documental de
 * origen (document_number / document_type / evento) — consulta, sin navegación
 * a otras vistas.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { fetchCategoryDetail } from './fin-api';
import type { MovementRow } from './types';

const PAGE_SIZE = 20;

interface CategoryDetailPanelProps {
  storeId: string;
  categoryCode: string;
  categoryName: string;
  /** Inicio del rango: 1900-01-01 en el balance (histórico completo), from del período en rendimiento. */
  from: string;
  /** Fin del rango: fecha de corte en el balance, to del período en rendimiento. */
  to: string;
}

const EVENT_LABELS: Record<string, string> = {
  reconocimiento: 'Reconocimiento',
  pago: 'Pago',
  apertura: 'Apertura',
  anulacion: 'Anulación',
  ajuste_manual: 'Ajuste manual',
};

function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? (event ? event.charAt(0).toUpperCase() + event.slice(1) : '—');
}

export function CategoryDetailPanel({
  storeId,
  categoryCode,
  categoryName,
  from,
  to,
}: CategoryDetailPanelProps) {
  const token = useAuthStore((s) => s.token);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      if (offset === 0) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const d = await fetchCategoryDetail(storeId, categoryCode, from, to, PAGE_SIZE, offset, token);
        setTotal(d.total ?? 0);
        setMovements((prev) => (offset === 0 ? d.movimientos ?? [] : [...prev, ...(d.movimientos ?? [])]));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar el detalle');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [storeId, categoryCode, from, to, token],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs font-bold uppercase tracking-widest">Cargando movimientos…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center space-y-2">
        <p className="text-xs text-destructive font-bold">{error}</p>
        <button
          type="button"
          onClick={() => load(0)}
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:underline"
        >
          <RefreshCw className="w-3 h-3" /> Reintentar
        </button>
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        Sin movimientos de «{categoryName}» en el rango consultado.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="bg-muted/50">
            <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <th className="px-2.5 py-2 text-left">Fecha</th>
              <th className="px-2.5 py-2 text-left">Documento</th>
              <th className="px-2.5 py-2 text-left">Tipo</th>
              <th className="px-2.5 py-2 text-left">Evento</th>
              <th className="px-2.5 py-2 text-center">Débito/Crédito</th>
              <th className="px-2.5 py-2 text-right">Importe</th>
              <th className="px-2.5 py-2 text-left">Descripción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {movements.map((m) => (
              <tr key={m.id} className="hover:bg-muted/30">
                <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{m.economic_date}</td>
                <td className="px-2.5 py-2 font-mono font-bold whitespace-nowrap">
                  {m.document_number || '—'}
                </td>
                <td className="px-2.5 py-2 whitespace-nowrap">{m.document_type}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{eventLabel(m.event)}</td>
                <td className="px-2.5 py-2 text-center">
                  <span
                    className={cn(
                      'inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider',
                      m.sense === 'debito'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-destructive/10 text-destructive',
                    )}
                  >
                    {m.sense === 'debito' ? 'Débito' : 'Crédito'}
                  </span>
                </td>
                <td
                  className={cn(
                    'px-2.5 py-2 text-right tabular-nums font-bold whitespace-nowrap',
                    m.amount_cup < 0 && 'text-destructive',
                  )}
                >
                  {formatCurrency(m.amount_cup)}
                </td>
                <td className="px-2.5 py-2 text-muted-foreground max-w-[220px] truncate" title={m.description ?? ''}>
                  {m.description || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {movements.length} de {total} movimiento{total !== 1 ? 's' : ''}
        </span>
        {movements.length < total && (
          <button
            type="button"
            onClick={() => load(movements.length)}
            disabled={loadingMore}
            className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:underline disabled:opacity-50 min-h-[36px]"
          >
            {loadingMore ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Ver más
          </button>
        )}
      </div>
    </div>
  );
}
