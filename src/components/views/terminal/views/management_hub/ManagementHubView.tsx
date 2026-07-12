'use client';

/**
 * ManagementHubView — Hub de Gestión (MULTI-TIENDA).
 *
 * GESTION-UNIFICADA (2026-07-13): unifica 3 vistas administrativas en tabs:
 *   1. Tablón Noticias  → NewsView (lectura + tasa de cambio)
 *   2. Vitrina          → StorefrontConfigView (configuración vitrina pública)
 *   3. Gestión Tiendas  → StoresManagementView + acceso directo a Dashboard KPI
 *
 * Objetivo: disminuir opciones del menú lateral izquierdo. Antes eran 3 items
 * separados en 2 grupos (Tablón Noticias en ADMINISTRACIÓN, Vitrina y Gestión
 * Tiendas en MULTI-TIENDA, más Dashboard KPI en Analítica). Ahora es 1 solo
 * item "Gestión" en MULTI-TIENDA, con 3 tabs internos.
 *
 * El Tab "Gestión Tiendas" incluye un botón "Ver Dashboard KPI" que lleva a la
 * vista dashboard directamente (en lugar de tenerla como item separado en el
 * sidebar). Esto resuelve el problema de tener dos lugares que hacen casi lo
 * mismo: el dashboard ahora se accede desde el contexto de Gestión Tiendas,
 * que es donde el admin naturalmente lo busca.
 *
 * Patrón: TABS (igual que InventoryView). No es HUB porque las 3 secciones son
 * homogéneas (gestión administrativa del tenant) y convive mejor con tabs.
 */

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Newspaper, Store, Building, TrendingUp, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store';
import { useAuthStore } from '@/store';

// Lazy-load de las 3 sub-vistas para que el bundle inicial sea pequeño
const NewsView = dynamic(() => import('@/components/views/terminal/views/rss/NewsView'), { ssr: false });
const StorefrontConfigView = dynamic(() => import('@/components/views/terminal/views/stores/StorefrontConfigView'), { ssr: false });
const StoresManagementView = dynamic(() => import('@/components/views/terminal/views/stores/StoresManagementView'), { ssr: false });

type TabId = 'news' | 'storefront' | 'stores';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  description: string;
  roles: string[]; // roles que pueden ver este tab
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
    description: 'Administrar tiendas del tenant',
    roles: ['admin'],
  },
];

export default function ManagementHubView() {
  const { user } = useAuthStore();
  const { setCurrentView } = useUIStore();
  const [activeTab, setActiveTab] = useState<TabId>('news');

  // Persistir el tab activo en localStorage para que al volver de una sub-vista
  // (ej: dashboard) el usuario vuelva al mismo tab.
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mgmt-hub-tab') as TabId | null : null;
    if (saved && TABS.some(t => t.id === saved)) {
      // Verificar que el user tenga rol para el tab guardado
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

  // Filtrar tabs por rol del usuario
  const visibleTabs = TABS.filter(tab => !user || tab.roles.includes(user.role));

  // Si el tab activo no es visible para el user (por cambio de rol), resetear
  useEffect(() => {
    if (!visibleTabs.some(t => t.id === activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const activeTabDef = TABS.find(t => t.id === activeTab);

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
          {/* FIX-GESTION-UNIFICADA: acceso directo a Dashboard KPI desde el tab Tiendas */}
          {activeTab === 'stores' && (
            <button
              type="button"
              onClick={() => setCurrentView('dashboard')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
              aria-label="Ver Dashboard KPI"
            >
              <TrendingUp className="w-4 h-4" />
              Ver Dashboard KPI
              <ExternalLink className="w-3 h-3 opacity-70" />
            </button>
          )}
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
        {activeTab === 'stores' && <StoresManagementView />}
      </div>
    </div>
  );
}
