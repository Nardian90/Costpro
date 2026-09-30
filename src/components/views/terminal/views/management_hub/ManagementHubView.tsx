'use client';

/**
 * ManagementHubView — Hub de Gestión (MULTI-TIENDA).
 *
 * GESTION-UNIFICADA-V2 (2026-07-13): unifica vistas administrativas en tabs:
 *   1. Gestión Tiendas  → StoresManagementView con KPIs + dashboard avanzado
 *   2. Vitrina          → StorefrontConfigView (configuración vitrina pública)
 *
 * REMEDIACIÓN (fix/dashboard-active-store): nuevo tab "KPIs" →
 * MultiStoreDashboardView (tablero consolidado de TODAS las tiendas). Ese
 * tablero dej de presentarse como "Dashboard" (la entrada Dashboard del menú
 * responde ahora a la tienda activa para todos los roles); su función real —
 * monitoreo del conjunto de tiendas — pertenece a este hub. Sin duplicar
 * navegación: es un tab interno del ÚNICO destino "Gestión de Tiendas".
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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Store, Building, Loader2, BarChart3 } from 'lucide-react'; // F4: ChevronRight retirado con el breadcrumb local
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';

// Lazy-load de las sub-vistas
const StorefrontConfigView = dynamic(() => import('@/components/views/terminal/views/stores/StorefrontConfigView'), { ssr: false });
const StoresManagementView = dynamic(() => import('@/components/views/terminal/views/stores/StoresManagementView'), { ssr: false });
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

type TabId = 'storefront' | 'stores' | 'kpis';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  description: string;
  roles: string[];
}

// FASE B (UX-005): el tab del Tablón se retiró (hoja ANÁLISIS). "Gestión
// Tiendas" es el default — es el dominio propio del hub. Los valores viejos
// 'news' persistidos en localStorage ('mgmt-hub-tab') degradan al default
// (el guard `TABS.some(t => t.id === saved)` ya no los acepta).
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
    // REMEDIACIÓN (fix/dashboard-active-store): el tablero consolidado
    // (MultiStoreDashboardView) vive aquí — ya no se presenta como "Dashboard".
    id: 'kpis',
    label: 'KPIs',
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
];

export default function ManagementHubView() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('stores');
  const [dashboardStore, setDashboardStore] = useState<{ id: string; name: string } | null>(null);

  // Persistir el tab activo en localStorage
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('mgmt-hub-tab') as TabId | null) : null;
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
      localStorage.setItem('mgmt-hub-tab', tab);
    }
  };

  const visibleTabs = useMemo(() => TABS.filter(tab => !user || tab.roles.includes(user.role)), [user]);

  useEffect(() => {
    if (!visibleTabs.some(t => t.id === activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const activeTabDef = TABS.find(t => t.id === activeTab);

  const handleOpenDashboard = useCallback((store: { id: string; name: string }) => {
    setDashboardStore({ id: store.id, name: store.name });
  }, []);

  const handleCloseDashboard = useCallback(() => {
    setDashboardStore(null);
  }, []);

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
              {activeTabDef?.description || 'Centro unificado de gestión administrativa'}
            </p>
          </div>
          {/* FIX-GESTION-UNIFICADA-V2: botón "Ver Dashboard KPI" removido.
              Ahora cada tarjeta de tienda tiene su propio botón "Ver Dashboard". */}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 -mb-px overflow-x-auto" role="tablist" aria-label="Secciones de Gestión">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap",
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
        {activeTab === 'stores' && (
          <StoresManagementView onOpenDashboard={handleOpenDashboard} />
        )}
        {activeTab === 'kpis' && <MultiStoreDashboardView />}
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
