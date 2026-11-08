'use client';

/**
 * ManagementHubView — Hub de Gestión (MULTI-TIENDA).
 *
 * GESTION-UNIFICADA-V2 (2026-07-13): unifica vistas administrativas en tabs.
 *
 * CP-UX-ORG-STORES-001 (2026-11-09) — REORGANIZACIÓN RESPONSABILIDADES:
 * la administración de la ESTRUCTURA (listar/crear/pausar/archivar tiendas de
 * cada organización) se traslada a SISTEMA → Organizaciones → detalle de la
 * organización → tab «Tiendas» (mismo componente StoresManagementView, ahora
 * scoped server-side a la organización seleccionada). El hub queda con la
 * configuración y operación de la TIENDA ACTIVA:
 *
 *   Gestión de Tiendas
 *   ├── Tab: Configuración (default) → StoreSettingsView (tienda activa)
 *   ├── Tab: Resumen                 → MultiStoreDashboardView (consolidado)
 *   ├── Tab: Vitrina                 → StorefrontConfigView (intacto)
 *   └── Tab: Catálogo                → StoreCatalogView (intacto)
 *
 * NOTA IA-FIX (reversión justificada): el switcher «Completa | Resumen» existía
 * porque eran DOS REPRESENTACIONES del mismo contenido (listado y tablero de
 * las mismas tiendas). Al salir el listado del hub, Resumen deja de ser una
 * representación alternativa y pasa a ser el único contenido cross-tienda del
 * hub → tab propio (el switcher no tiene ya nada que conmutar).
 *
 * Migración localStorage ('mgmt-hub-tab'):
 *   'kpis'   → 'resumen'   (ya aterrizaba en el tablero)
 *   'stores' → 'resumen' si su modo era 'summary'; si no → 'settings'
 *              (gestión de tiendas → configuración de la tienda: contenido
 *              equivalente dentro del nuevo hub)
 *   'storefront' | 'catalog' → intactos.
 *
 * FASE B (UX-005): el Tablón de Noticias vive en ANÁLISIS (salida previa,
 * intacta). Patrón: TABS WAI-APG con roving tabindex (igual que InventoryView).
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Store, Settings, BarChart3, LayoutList, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { effectiveNavRole } from '@/config/navigation/sidebar.structure';

// Lazy-load de las sub-vistas
const StorefrontConfigView = dynamic(() => import('@/components/views/terminal/views/stores/StorefrontConfigView'), { ssr: false });
// CP-UX-ORG-STORES-001: configuración de la TIENDA ACTIVA (pestaña nueva).
const StoreSettingsView = dynamic(() => import('@/components/views/terminal/views/stores/StoreSettingsView'), { ssr: false });
// Catálogo/Vitrina (fix/ux-inventario-vitrina): gestión de publicación de
// productos (visible/precio/stock/promoción) sobre la única fuente de verdad.
const StoreCatalogView = dynamic(() => import('@/components/views/terminal/views/stores/StoreCatalogView'), { ssr: false });
// REMEDIACIÓN (fix/dashboard-active-store): tablero consolidado multi-tienda.
// CP-UX-ORG-STORES-001: antes era el modo «Resumen» del tab Tiendas; con la
// salida del listado hacia Organizaciones, se conserva aquí como tab propio
// (sin regresión de funcionalidad).
const MultiStoreDashboardView = dynamic(() => import('@/components/views/terminal/views/dashboard/MultiStoreDashboardView'), { ssr: false });

type TabId = 'settings' | 'resumen' | 'storefront' | 'catalog';

const LEGACY_HUB_TAB_KEY = 'mgmt-hub-tab';
const STORE_VIEW_MODE_STORAGE_KEY = 'mgmt-stores-view-mode';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  description: string;
  roles: string[];
}

const TABS: TabDef[] = [
  {
    // CP-UX-ORG-STORES-001: default del hub reorganizado — la responsabilidad
    // propia de OPERACIÓN es configurar la sucursal activa.
    id: 'settings',
    label: 'Configuración',
    icon: Settings,
    description: 'Configuración de la tienda activa: identificación, contacto, banca, identidad visual y facturación',
    roles: ['admin', 'manager', 'encargado'],
  },
  {
    id: 'resumen',
    label: 'Resumen',
    icon: BarChart3,
    description: 'Tablero consolidado: ventas, transacciones y alertas de todas las tiendas',
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
    // fix/ux-inventario-vitrina: relación explícita
    // INVENTARIO (¿qué tengo?) → CATÁLOGO (¿qué muestro?) → VITRINA (¿cómo se ve?).
    id: 'catalog',
    label: 'Catálogo',
    icon: LayoutList,
    description: 'Qué ve el cliente: publicación, precio, stock y promociones por producto',
    roles: ['admin', 'manager', 'encargado'],
  },
];

export default function ManagementHubView() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('settings');

  // Persistir el tab activo en localStorage + migración del legacy ('kpis',
  // 'stores' con o sin modo Resumen). Ver cabecera para las reglas exactas.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedMode = localStorage.getItem(STORE_VIEW_MODE_STORAGE_KEY);
    const legacyTab = localStorage.getItem(LEGACY_HUB_TAB_KEY);

    let migrated: TabId | null = null;
    if (legacyTab === 'kpis') {
      migrated = 'resumen';
    } else if (legacyTab === 'stores') {
      migrated = savedMode === 'summary' ? 'resumen' : 'settings';
    }
    if (migrated) {
      setActiveTab(migrated);
      localStorage.setItem(LEGACY_HUB_TAB_KEY, migrated);
      return;
    }
    if (legacyTab && TABS.some(t => t.id === legacyTab)) {
      const tab = TABS.find(t => t.id === legacyTab)!;
      // CP-ORG-002: rol efectivo canónico (superadmin → requisitos de admin).
      if (user && tab.roles.includes(effectiveNavRole(user.role))) {
        setActiveTab(tab.id);
      }
    }
  }, [user]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LEGACY_HUB_TAB_KEY, tab);
    }
  };

  // CP-ORG-002: rol efectivo canónico (superadmin → requisitos de admin),
  // mismo criterio del sidebar — los tabs del hub no colapsan para la
  // cuenta de plataforma.
  const visibleTabs = useMemo(() => TABS.filter(tab => !user || tab.roles.includes(effectiveNavRole(user.role))), [user]);

  useEffect(() => {
    if (!visibleTabs.some(t => t.id === activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const activeTabDef = TABS.find(t => t.id === activeTab);

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
      {/* Header con tabs */}
      <div className="border-b border-border px-0 sm:px-2 lg:px-4 pt-2 sm:pt-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            {/* F4 (IA-F04): título alineado al label de menú "Gestión de Tiendas"
                (navigation-definition.ts). La responsabilidad del hub tras la
                reorganización: configurar/operar la TIENDA ACTIVA + consolidado. */}
            <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase">Gestión de Tiendas</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {activeTabDef?.description || 'Centro unificado de gestión administrativa'}
            </p>
          </div>
        </div>

        {/* Tabs — secciones conceptualmente distintas (Configuración | Resumen |
            Vitrina | Catálogo). WAI-APG: roving tabindex + flechas. */}
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
        {activeTab === 'settings' && (
          <React.Suspense fallback={
            <div className="py-16 flex items-center justify-center" role="status" aria-label="Cargando configuración">
              <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
            </div>
          }>
            <StoreSettingsView />
          </React.Suspense>
        )}
        {activeTab === 'resumen' && <MultiStoreDashboardView />}
        {activeTab === 'storefront' && <StorefrontConfigView />}
        {activeTab === 'catalog' && <StoreCatalogView />}
      </div>
    </div>
  );
}
