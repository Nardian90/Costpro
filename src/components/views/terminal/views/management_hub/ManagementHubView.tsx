'use client';

/**
 * ManagementHubView — Hub de Gestión (MULTI-TIENDA).
 *
 * GESTION-UNIFICADA-V2 (2026-07-13): unifica vistas administrativas en tabs:
 *   1. Gestión Tiendas  → StoresManagementView con KPIs + dashboard avanzado
 *   2. Vitrina          → StorefrontConfigView (configuración vitrina pública)
 *
 * REMEDIACIÓN (fix/dashboard-active-store): el tablero consolidado →
 * MultiStoreDashboardView (TODAS las tiendas) vive en este hub. Sin duplicar
 * navegación: es contenido interno del ÚNICO destino "Gestión de Tiendas".
 *
 * IA-FIX (fix/store-management-view-switcher-a11y): "Tiendas" y "KPIs" NO
 * eran dos contenidos distintos — eran DOS REPRESENTACIONES del mismo
 * conjunto de tiendas (misma fuente de datos useStores/useMultiStoreDashboard,
 * mismos 4 KPIs por tarjeta, mismas acciones por tienda). Principio IA:
 * tabs separan contenidos conceptualmente diferentes; cambiar de
 * representación del mismo contenido es un content/view switcher.
 * Arquitectura resultante:
 *
 *   Gestión de Tiendas
 *   ├── Tab: Tiendas (dominio del hub)
 *   │     └── Vista: [ Completa | Resumen ]  ← ContentSwitcher (radiogroup)
 *   │           ├── Completa → StoresManagementView (gestión + bulk + filtros)
 *   │           └── Resumen  → MultiStoreDashboardView (tablero consolidado)
 *   └── Tab: Vitrina (contenido genuinamente distinto → permanece como tab)
 *
 * El modo del switcher persiste en localStorage ('mgmt-stores-view-mode').
 * Migración: el valor legacy 'kpis' de 'mgmt-hub-tab' mapea a tab 'stores' +
 * modo 'summary' (sin romper el contexto del usuario; sin deep-links URL
 * afectados — este hub nunca tuvo ?tab=).
 *
 * REMEDIACIÓN DENSIDAD (fix/ui-management-density-inventory-a11y): el
 * switcher ya NO ocupa una fila propia (espacio muerto en desktop). Se
 * inyecta como slot `toolbar` en la fila de acciones de StoresManagementView
 * (Completa) o en el cluster derecho del header de MultiStoreDashboardView
 * (Resumen) — patrón toolbar de InventoryView. El título interno "Gestión
 * Tiendas" de StoresManagementView se retiró (redundante con el encabezado
 * del hub). Estado, persistencia y migración legacy NO cambian.
 *
 * FASE B (UX-005 · GATE 1.4P): el Tablón de Noticias SALIÓ de este hub — es
 * inteligencia de mercado GLOBAL/TRANSVERSAL (lector RSS sin store_id, no
 * cambia con la tienda activa) y vive ahora como hoja de la sección ANÁLISIS
 * (navigation-definition.ts). Su ubicación aquí era efecto mecánico de una
 * reducción de menú (commit b8c15082), no pertenencia semántica. El default
 * del hub es su dominio propio: Gestión de Tiendas. La vista 'news' sigue
 * existiendo como destino directo (deep-link ?view=news) y se renderiza
 * standalone desde TerminalShell.
 *
 * FIX-GESTION-UNIFICADA-V2: el tab "Gestión Tiendas" renderiza
 * StoresManagementView con una prop `onOpenDashboard`. Cuando el user hace
 * clic en el botón "Ver Dashboard" de una tarjeta, se abre StoreDashboardView
 * (dashboard avanzado por tienda, 3160 LOC con ECharts + insights IA).
 *
 * Patrón: TABS (igual que InventoryView).
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Store, Building, Loader2, LayoutGrid, BarChart3, LayoutList } from 'lucide-react'; // F4: ChevronRight retirado con el breadcrumb local
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import ContentSwitcher, { type ContentSwitcherItem } from '@/components/ui/ContentSwitcher';

// Lazy-load de las sub-vistas
const StorefrontConfigView = dynamic(() => import('@/components/views/terminal/views/stores/StorefrontConfigView'), { ssr: false });
const StoresManagementView = dynamic(() => import('@/components/views/terminal/views/stores/StoresManagementView'), { ssr: false });
// Catálogo/Vitrina (fix/ux-inventario-vitrina): gestión de publicación de
// productos (visible/precio/stock/promoción) sobre la única fuente de verdad.
const StoreCatalogView = dynamic(() => import('@/components/views/terminal/views/stores/StoreCatalogView'), { ssr: false });
// REMEDIACIÓN (fix/dashboard-active-store): tablero consolidado multi-tienda.
// Antes era la respuesta de la entrada "Dashboard" para admin/manager; ahora
// vive exclusivamente aquí, como tab "KPIs" del hub Gestión de Tiendas.
const MultiStoreDashboardView = dynamic(() => import('@/components/views/terminal/views/dashboard/MultiStoreDashboardView'), { ssr: false });

// StoreDashboardView — dashboard avanzado por tienda (3160 LOC con ECharts).
// Lazy-loaded. Solo se carga cuando el user hace clic en "Ver Dashboard".
const StoreDashboardView = dynamic(
  () => import('@/components/views/terminal/views/dashboard/StoreDashboardView'),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    ),
  }
);

type TabId = 'storefront' | 'stores' | 'catalog';
// IA-FIX: 'kpis' deja de ser tab — pasa a ser viewMode 'summary' del tab
// 'stores' (dos representaciones del mismo contenido, no dos secciones).
type StoreViewMode = 'full' | 'summary';

const STORE_VIEW_MODE_STORAGE_KEY = 'mgmt-stores-view-mode';
const LEGACY_HUB_TAB_KEY = 'mgmt-hub-tab';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  description: string;
  roles: string[];
}

// FASE B (UX-005): el tab del Tablón se retiró (hoja ANÁLISIS). "Gestión
// Tiendas" es el default — es el dominio propio del hub. Los valores viejos
// persistidos en localStorage ('mgmt-hub-tab': 'news', 'kpis') degradan al
// default o se migran (ver migración del modo Resumen en el mount effect).
const TABS: TabDef[] = [
  {
    id: 'stores',
    // F4 (IA-F04): "Tiendas" — bajo el encabezado "Gestión de Tiendas" el tab
    // ya no repite el título (jerarquía encabezado → tabs). id persiste ('stores').
    label: 'Tiendas',
    icon: Building,
    description: 'Tiendas con KPIs en tiempo real y dashboard avanzado por tienda',
    roles: ['admin', 'manager', 'encargado'],
  },
  {
    id: 'storefront',
    label: 'Vitrina',
    icon: Store,
    description: 'Configuración de la vitrina pública',
    roles: ['admin', 'manager', 'encargado'],
  },
  {
    // fix/ux-inventario-vitrina: tercero del hub. Relación explícita
    // INVENTARIO (¿qué tengo?) → CATÁLOGO (¿qué muestro?) → VITRINA (¿cómo se ve?).
    id: 'catalog',
    label: 'Catálogo',
    icon: LayoutList,
    description: 'Qué ve el cliente: publicación, precio, stock y promociones por producto',
    roles: ['admin', 'manager', 'encargado'],
  },
];

// IA-FIX: nomenclatura del switcher — describe qué cambia visualmente para
// el usuario (gestión completa vs tablero resumido), no el tipo de dato.
// "KPIs" se descarta como etiqueta de modo: nombra la información, no el modo.
const STORE_VIEW_MODES: ContentSwitcherItem<StoreViewMode>[] = [
  {
    value: 'full',
    label: 'Completa',
    icon: LayoutGrid,
    ariaLabel: 'Vista completa de tiendas: gestión, filtros y operaciones',
  },
  {
    value: 'summary',
    label: 'Resumen',
    icon: BarChart3,
    ariaLabel: 'Vista resumen: tablero consolidado de todas las tiendas',
  },
];

const STORE_MODE_DESCRIPTIONS: Record<StoreViewMode, string> = {
  full: 'Tiendas con KPIs en tiempo real y dashboard avanzado por tienda',
  // REMEDIACIÓN (fix/dashboard-active-store): descripción del tablero
  // consolidado — ahora asociada al modo Resumen, no a un tab.
  summary: 'Tablero consolidado: ventas, transacciones y alertas de todas las tiendas',
};

export default function ManagementHubView() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('stores');
  // IA-FIX: modo de vista del tab Tiendas (Completa | Resumen). Default
  // 'full' — la gestión es el dominio propio del hub.
  const [storesViewMode, setStoresViewMode] = useState<StoreViewMode>('full');
  const [dashboardStore, setDashboardStore] = useState<{ id: string; name: string } | null>(null);

  // Persistir el tab activo en localStorage + migración del legacy 'kpis'.
  // FASE 6 (deep-links/estado): este hub nunca tuvo ?tab= en URL (solo ipv y
  // cost-sheets la sincronizan). El único estado persistente era
  // 'mgmt-hub-tab' → se mapea sin pérdida: 'kpis' → tab 'stores' + modo
  // 'summary'; 'news' (legacy aún anterior) degrana al default.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 1) Migración del modo: el usuario que estaba en el tab "KPIs" aterriza
    //    en Tiendas · vista Resumen (mismo contenido, sin sorpresa).
    const savedMode = localStorage.getItem(STORE_VIEW_MODE_STORAGE_KEY) as StoreViewMode | null;
    const legacyTab = localStorage.getItem(LEGACY_HUB_TAB_KEY) as TabId | 'kpis' | null;
    if (legacyTab === 'kpis') {
      setStoresViewMode('summary');
      if (!savedMode) {
        localStorage.setItem(STORE_VIEW_MODE_STORAGE_KEY, 'summary');
      }
      localStorage.setItem(LEGACY_HUB_TAB_KEY, 'stores');
    } else if (savedMode === 'full' || savedMode === 'summary') {
      setStoresViewMode(savedMode);
    }
    // 2) Tab persistido (ya sin 'kpis' en el universo posible).
    const saved = localStorage.getItem(LEGACY_HUB_TAB_KEY) as TabId | null;
    if (saved && TABS.some(t => t.id === saved)) {
      const tab = TABS.find(t => t.id === saved)!;
      if (user && tab.roles.includes(user.role)) {
        setActiveTab(saved);
      }
    }
  }, [user]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LEGACY_HUB_TAB_KEY, tab);
    }
  };

  // FASE 7 (persistencia del modo): misma estrategia que el tab —
  // localStorage local al hub. No introduce persistencia global nueva.
  // El modo sobrevive a refresh, navegación y cambio de tema/performance
  // (localStorage no se limpia en cambios de tema).
  //
  // REMEDIACIÓN DENSIDAD (fix/ui-management-density-inventory-a11y): al
  // cambiar de modo el radiogroup se REMONTA dentro de la sub-vista lazy
  // activa (Completa → StoresManagementView / Resumen → MultiStoreDashboard).
  // Sin restauración, el foco de teclado caería al <body> tras el swap del
  // árbol. Bandera + efecto: si el origen del cambio era el propio switcher,
  // el foco vuelve al radio marcado en cuanto la nueva sub-vista lo renderice.
  const pendingSwitcherFocus = useRef(false);

  const handleStoresViewModeChange = useCallback((mode: StoreViewMode) => {
    if (typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('[role=radiogroup][aria-label="Vista de Tiendas"]')) {
        pendingSwitcherFocus.current = true;
      }
    }
    setStoresViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORE_VIEW_MODE_STORAGE_KEY, mode);
    }
  }, []);

  useEffect(() => {
    if (!pendingSwitcherFocus.current) return;
    pendingSwitcherFocus.current = false;
    let raf = 0;
    let tries = 0;
    const tick = () => {
      const radio = document.querySelector<HTMLButtonElement>(
        '[role=radiogroup][aria-label="Vista de Tiendas"] [role=radio][aria-checked="true"]'
      );
      if (radio) {
        radio.focus();
        return;
      }
      // La sub-vista es lazy: esperar a que monte (tope ~1s de frames).
      if (++tries < 60) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [storesViewMode]);

  const visibleTabs = useMemo(() => TABS.filter(tab => !user || tab.roles.includes(user.role)), [user]);

  useEffect(() => {
    if (!visibleTabs.some(t => t.id === activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const activeTabDef = TABS.find(t => t.id === activeTab);
  // IA-FIX: la descripción del encabezado sigue al contenido real —
  // dentro del tab Tiendas describe el modo activo (Completa | Resumen).
  const headerDescription =
    activeTab === 'stores'
      ? STORE_MODE_DESCRIPTIONS[storesViewMode]
      : activeTabDef?.description;

  const handleOpenDashboard = useCallback((store: { id: string; name: string }) => {
    setDashboardStore({ id: store.id, name: store.name });
  }, []);

  const handleCloseDashboard = useCallback(() => {
    setDashboardStore(null);
  }, []);

  // WAI-APG tabs: roving tabindex + flechas. Un único punto de tabulación
  // (el tab activo); ←/→ mueven foco Y selección (tabs de activación
  // automática, el patrón dominante para tablist horizontales).
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = visibleTabs.findIndex(t => t.id === activeTab);
      if (currentIndex < 0) return;
      let nextIndex: number | null = null;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          nextIndex = (currentIndex + 1) % visibleTabs.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = visibleTabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const nextTab = visibleTabs[nextIndex];
      if (!nextTab) return;
      handleTabChange(nextTab.id);
      tabRefs.current[nextIndex]?.focus();
    },
    [visibleTabs, activeTab, handleTabChange]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* F4 (IA-F04): breadcrumb local ELIMINADO — el NavigationBreadcrumb global
          (TerminalShell) ya renderiza el contexto real derivado de la fuente única:
          Inicio > OPERACIÓN > Gestión de Tiendas. El bloque local duplicaba el crumb
          con un segmento inventado ("MULTI-TIENDA") que no existe en el árbol de
          navegación — breadcrumb falso, 2º menú (auditoría F4 §4). */}

      {/* Header con tabs */}
      <div className="border-b border-border px-0 sm:px-2 lg:px-4 pt-2 sm:pt-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            {/* F4 (IA-F04): título alineado al label de menú "Gestión de Tiendas"
                (navigation-definition.ts). Antes: "Gestión" (4ª identidad de la vista). */}
            <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase">Gestión de Tiendas</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {headerDescription || 'Centro unificado de gestión administrativa'}
            </p>
          </div>
          {/* FIX-GESTION-UNIFICADA-V2: botón "Ver Dashboard KPI" removido.
              Ahora cada tarjeta de tienda tiene su propio botón "Ver Dashboard". */}
        </div>

        {/* Tabs — secciones conceptualmente distintas (Tiendas | Vitrina).
            WAI-APG: roving tabindex + flechas (ver handleTabKeyDown). */}
        <div className="flex gap-1 -mb-px overflow-x-auto" role="tablist" aria-label="Secciones de Gestión">
          {visibleTabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={el => { tabRefs.current[index] = el; }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => handleTabChange(tab.id)}
                onKeyDown={handleTabKeyDown}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-0",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido del tab activo */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'storefront' && <StorefrontConfigView />}
        {activeTab === 'catalog' && <StoreCatalogView />}
        {activeTab === 'stores' && (
          /* IA-FIX: content switcher — Tiendas y Resumen son dos
              representaciones del MISMO contenido (mismas tiendas, mismos
              datos). Radiogroup accesible con navegación por flechas
              (ContentSwitcher). El cambio de modo NO cambia de módulo ni
              de contexto (permisos, tienda activa y búsqueda intactos).
              REMEDIACIÓN DENSIDAD: el switcher se inyecta como slot `toolbar`
              en la fila de acciones de la sub-vista activa — sin fila propia. */
          <>
            {storesViewMode === 'full' ? (
              <StoresManagementView
                onOpenDashboard={handleOpenDashboard}
                toolbar={
                  <ContentSwitcher
                    groupLabel="Vista de Tiendas"
                    items={STORE_VIEW_MODES}
                    value={storesViewMode}
                    onChange={handleStoresViewModeChange}
                  />
                }
              />
            ) : (
              <MultiStoreDashboardView
                toolbar={
                  <ContentSwitcher
                    groupLabel="Vista de Tiendas"
                    items={STORE_VIEW_MODES}
                    value={storesViewMode}
                    onChange={handleStoresViewModeChange}
                  />
                }
              />
            )}
          </>
        )}
      </div>

      {/* Dashboard avanzado overlay — se abre al clickear "Ver Dashboard" */}
      {dashboardStore && (
        <StoreDashboardView
          storeId={dashboardStore.id}
          storeName={dashboardStore.name}
          onClose={handleCloseDashboard}
        />
      )}
    </div>
  );
}
