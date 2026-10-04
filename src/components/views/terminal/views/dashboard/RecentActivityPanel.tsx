'use client';

/**
 * RecentActivityPanel — "Acciones recientes" del AI Command Center.
 *
 * AI COMMAND CENTER (GATE 5/6):
 *   - Función: recordar y reanudar trabajo, NO reemplazar el Dashboard de
 *     Tiendas. Sin KPIs, sin gráficos, sin widgets administrativos (GATE 6).
 *   - Fuente: log user-scoped de acciones originadas por Darian
 *     (lib/darian/recent-actions.ts). NO es historial de navegación.
 *   - Máx 5 entradas visibles (GATE 6: no convertir en otro dashboard).
 *
 * Seguridad (GATE 17):
 *   - La fuente es user-scoped (un usuario jamás ve entradas de otro).
 *   - Filtrado defensivo por tienda activa: entradas de otra tienda no se
 *     muestran (el storeId se capturó al momento de la acción).
 *   - No se inventan datos: solo lo que Darian realmente ejecutó/inició.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, History } from 'lucide-react';
import { useAuthStore, useUIStore, type ViewType } from '@/store';
import {
  getDarianActions,
  formatRelativeTime,
  ACTION_KIND_META,
  DARIAN_ACTIONS_EVENT,
  type RecentDarianAction,
} from '@/lib/darian/recent-actions';
import { normalizeLegacyView } from '@/config/navigation/navigation-definition';
import RecommendedActions from './RecommendedActions';

const MAX_VISIBLE = 5;

export default function RecentActivityPanel({ className }: { className?: string }) {
  const user = useAuthStore((s) => s.user);
  const activeStoreId = useAuthStore((s) => s.user?.activeStoreId);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const [entries, setEntries] = useState<RecentDarianAction[]>([]);

  const load = useCallback(() => {
    const userId = (user as any)?.id || null;
    const all = getDarianActions(userId);
    // GATE 17: solo entradas de la tienda activa (o sin tienda registrada —
    // acciones puramente de UI que no tocaron datos de tienda).
    const scoped = all.filter((e) => !e.storeId || !activeStoreId || e.storeId === activeStoreId);
    setEntries(scoped.slice(0, MAX_VISIBLE));
  }, [user, activeStoreId]);

  useEffect(() => {
    load();
    window.addEventListener(DARIAN_ACTIONS_EVENT, load);
    window.addEventListener('focus', load);
    return () => {
      window.removeEventListener(DARIAN_ACTIONS_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, [load]);

  const reopen = (entry: RecentDarianAction) => {
    // GATE 19 · Reapertura: restaurar el contexto exacto de la entrada.
    if (entry.kind === 'query' && entry.conversationId) {
      // Consulta → vista de Darian con la conversación restaurada.
      window.dispatchEvent(
        new CustomEvent('darian:open-conversation', { detail: { conversationId: entry.conversationId } })
      );
      setCurrentView('chat' as ViewType);
      return;
    }
    if (entry.viewId) {
      // Acción con destino (navigation) → vista funcional existente (GATE 8:
      // "Ver en CostPro" — nunca incrustar el módulo en el chat).
      const dest = normalizeLegacyView(entry.viewId).view as ViewType;
      setCurrentView(dest);
    }
  };

  if (entries.length === 0) {
    // FASE 12 (fix/dashboard-contextual-kpi-actions): sin acciones recientes
    // el bloque se convierte automáticamente en "Acciones recomendadas"
    // (rol + permisos + estado real de la tienda) — nunca queda un espacio
    // vacío. Mantiene el testid canónico recent-activity-empty.
    return <RecommendedActions className={className} />;
  }

  return (
    <section className={className} aria-label="Acciones recientes">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-3.5 h-3.5 text-muted-foreground/50" aria-hidden="true" />
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
          Acciones recientes
        </h3>
      </div>

      <ul className="space-y-2" data-testid="recent-activity-list">
        {entries.map((entry) => {
          const meta = ACTION_KIND_META[entry.kind] || ACTION_KIND_META.unknown;
          const reopenable = Boolean(entry.conversationId || entry.viewId);
          return (
            <li key={entry.id}>
              <div
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl border border-border/70
                  bg-card/40 hover:bg-muted/40 transition-colors
                `}
              >
                <span className="text-base leading-none shrink-0" aria-hidden="true">
                  {meta.icon}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{entry.title}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {meta.label} · {formatRelativeTime(entry.timestamp)}
                  </p>
                </div>

                {reopenable && (
                  <button
                    type="button"
                    onClick={() => reopen(entry)}
                    className="
                      shrink-0 inline-flex items-center gap-1 px-2.5 min-h-[44px] rounded-lg
                      text-[11px] font-semibold text-muted-foreground hover:text-foreground
                      hover:bg-background border border-transparent hover:border-border
                      transition-colors
                    "
                    aria-label={`Reabrir: ${entry.title}`}
                    data-testid="recent-reopen"
                  >
                    Reabrir
                    <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
