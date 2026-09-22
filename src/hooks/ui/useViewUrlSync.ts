'use client';

import { useEffect, useRef } from 'react';
import { useUIStore, type ViewType } from '@/store';
import { normalizeLegacyView, HOME_VIEW } from '@/config/navigation/navigation-definition';

/**
 * GATE 1 §6/§7 — Sincronización URL del shell (estrategia aprobada).
 *
 * Formato canónico:
 *   /                        → Inicio (dashboard)
 *   /?view=X                 → vista directa
 *   /?view=ipv&tab=transactions      → vista-módulo con tab interno
 *   /?view=cost-sheets&tab=gen-easy  → ídem
 *   /?view=help&doc=…        → HelpView conserva su parámetro ?doc=
 *
 * Comportamiento:
 *   - pushState en cada cambio de vista/tab (Back/Forward del navegador).
 *   - popstate → parsear URL → aplicar al store (Back/Forward reales).
 *   - Refresh: si hay ?view=, la URL GANA sobre el estado persistido.
 *   - Deep link: /?view=X funciona en '/' (la sesión la maneja el shell).
 *   - Alias legacy: /?view=occ|punto_venta|gen-quick|… → destino canónico.
 *
 * REGLAS (aprobadas):
 *   - La URL representa estado de NAVEGACIÓN; NO sustituye autorización.
 *     El guard isViewAllowedForRole + backend/RLS siguen mandando:
 *     URL → navigation guard → role authorization → RLS/backend.
 *   - Estado transaccional (carrito POS, formularios) NO va a la URL:
 *     se usa el mecanismo existente. El refresh en `pos` pierde el carrito
 *     igual que hoy (documentado — no se inventa persistencia).
 *
 * Implementación: window.history nativa (sin next/navigation) para no
 * re-montar la página. Next.js ≥14.1 sincroniza useSearchParams con
 * pushState/popstate nativos (HelpView ?doc= sigue funcionando).
 */

function canonicalSearch(view: string, tab?: string): string {
  // Home limpia: '/' representa el dashboard (un solo concepto Inicio)
  if (view === HOME_VIEW && !tab) return '';

  const params = new URLSearchParams();
  params.set('view', view);
  if (tab) params.set('tab', tab);

  // HelpView usa ?doc= (deep-link de ayuda contextual) — preservarlo
  if (view === 'help' && typeof window !== 'undefined') {
    const doc = new URLSearchParams(window.location.search).get('doc');
    if (doc) params.set('doc', doc);
  }
  return params.toString();
}

function parseViewFromUrl(): { view: string; tab?: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get('view');
  if (!rawView) return null;
  // Alias legacy (occ, wrappers viejos, gen-quick…) → destino canónico
  return normalizeLegacyView(rawView, params.get('tab') ?? undefined);
}

function currentSearch(): string {
  if (typeof window === 'undefined') return '';
  return window.location.search.replace(/^\?/, '');
}

export function useViewUrlSync() {
  const currentView = useUIStore(s => s.currentView);
  const ipvActiveTab = useUIStore(s => s.ipvActiveTab);
  const activeCostSection = useUIStore(s => s.activeCostSection);
  const setCurrentView = useUIStore(s => s.setCurrentView);
  const setIpvActiveTab = useUIStore(s => s.setIpvActiveTab);
  const setActiveCostSection = useUIStore(s => s.setActiveCostSection);
  // GATE 1: el primer run del efecto estado→URL usa valores del primer render
  // (posiblemente desactualizados si la hidratación de URL los acaba de
  // cambiar). Se omite para no crear entradas de historial duplicadas.
  const skipFirstUrlEffect = useRef(true);

  // 1) MONTAJE / URL entrante: si hay ?view=, la URL gana sobre el estado
  //    persistido (refresh y deep-link).
  useEffect(() => {
    const fromUrl = parseViewFromUrl();
    if (!fromUrl) return;
    setCurrentView(fromUrl.view as ViewType);
    if (fromUrl.view === 'ipv' && fromUrl.tab) {
      setIpvActiveTab(fromUrl.tab);
    } else if (fromUrl.view === 'cost-sheets' && fromUrl.tab) {
      setActiveCostSection(fromUrl.tab);
    }
  }, []);

  // 2) ESTADO → URL: pushState en cada cambio de vista o tab de hub.
  //    Se omite si la URL ya representa exactamente ese estado (evita
  //    entradas duplicadas de historial al hidratar y al aplicar popstate).
  useEffect(() => {
    if (skipFirstUrlEffect.current) {
      skipFirstUrlEffect.current = false;
      return;
    }
    // Tab relevante solo para vistas-módulo
    const tab = currentView === 'ipv'
      ? ipvActiveTab
      : currentView === 'cost-sheets'
        ? activeCostSection
        : undefined;

    const target = canonicalSearch(currentView, tab);
    if (target === currentSearch()) return;
    try {
      window.history.pushState(null, '', target ? `/?${target}` : '/');
    } catch {
      // Safari occasionally throws on rapid pushState — ignore
    }
  }, [currentView, ipvActiveTab, activeCostSection]);

  // 3) POPSTATE (Back/Forward): la URL manda de vuelta al store.
  useEffect(() => {
    const onPopState = () => {
      const fromUrl = parseViewFromUrl();
      const view = (fromUrl?.view ?? HOME_VIEW) as ViewType;
      setCurrentView(view);
      if (view === 'ipv') {
        setIpvActiveTab(fromUrl?.tab ?? 'dashboard');
      } else if (view === 'cost-sheets') {
        // GATE 1.4R.1: fallback coherente con el nuevo default del store —
        // sin tab en la URL el módulo abre su núcleo de trabajo (Experto).
        setActiveCostSection(fromUrl?.tab ?? 'main');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
