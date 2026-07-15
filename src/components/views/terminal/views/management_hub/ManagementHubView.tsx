'use client';

/**
 * ManagementHubView — Hub de Gestión (MULTI-TIENDA).
 *
 * GESTION-UNIFICADA-V2 (2026-07-13): unifica 3 vistas administrativas en tabs:
 *   1. Tablón Noticias  → NewsView (lectura + tasa de cambio)
 *   2. Vitrina          → StorefrontConfigView (configuración vitrina pública)
 *   3. Gestión Tiendas  → StoresManagementView con KPIs + dashboard avanzado
 *
 * FIX-GESTION-UNIFICADA-V2: el tab "Gestión Tiendas" ahora renderiza
 * StoresManagementView con una prop `onOpenDashboard`. Cuando el user hace
 * clic en el botón "Ver Dashboard" de una tarjeta, se abre StoreDashboardView
 * (dashboard avanzado por tienda, 3160 LOC con ECharts + insights IA).
 *
 * El botón "Ver Dashboard KPI" del header fue removido — ya hay un botón
 * "Ver Dashboard" por cada tarjeta de tienda, que es más específico.
 *
 * Patrón: TABS (igual que InventoryView).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Newspaper, Store, Building, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';

// Lazy-load de las sub-vistas
const NewsView = dynamic(() => import('@/components/views/terminal/views/rss/NewsView'), { ssr: false });
const StorefrontConfigView = dynamic(() => import('@/components/views/terminal/views/stores/StorefrontConfigView'), { ssr: false });
const StoresManagementView = dynamic(() => import('@/components/views/terminal/views/stores/StoresManagementView'), { ssr: false });

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

type TabId = 'news' | 'storefront' | 'stores';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  description: string;
  roles: string[];
}

const TABS: TabDef[] = [
  {
    id: 'news',
    label: 'Tablón Noticias',
    icon: Newspaper,
    description: 'Noticias y tasas de cambio en tiempo real',
    roles: ['admin', 'manager', 'encargado', 'clerk', 'usuario', 'warehouse'],
  },
  {
    id: 'storefront',
    label: 'Vitrina',
    icon: Store,
    description: 'Configuración de la vitrina pública',
    roles: ['admin', 'manager', 'encargado'],
  },
  {
    id: 'stores',
    label: 'Gestión Tiendas',
    icon: Building,
    description: 'Tiendas con KPIs en tiempo real y dashboard avanzado por tienda',
    roles: ['admin', 'manager', 'encargado'],
  },
];

export default function ManagementHubView() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('news');
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
    <div className="space-y-6">
      {/* Header con tabs */}
      <div className="border-b border-border px-4 sm:px-6 lg:px-8 pt-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-black tracking-tight uppercase">Gestión</h2>
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
        {activeTab === 'news' && <NewsView />}
        {activeTab === 'storefront' && <StorefrontConfigView />}
        {activeTab === 'stores' && (
          <StoresManagementView onOpenDashboard={handleOpenDashboard} />
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
