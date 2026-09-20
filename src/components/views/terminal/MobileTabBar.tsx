'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Home, Package, ShoppingCart, Building, MoreHorizontal, Search, Check, X, Warehouse,
  DollarSign, FolderOpen, FileText, LayoutGrid, Paperclip, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { type ViewType, useUIStore } from '@/store';
import { useAuthStore } from '@/store';
import { useStoreSwitcher } from '@/hooks/ui/useStoreSwitcher';
import { useStores } from '@/hooks/api/useStores';
import { useDebounce } from '@/hooks/ui/useDebounce';
import { hasRole } from '@/lib/roles';
import {
  MOBILE_MAIN_TABS,
  NAVIGATION_SECTIONS,
  ACTION_EXTENSIONS,
  type NavEntry,
} from '@/config/navigation/navigation-definition';

/**
 * F5-T02: Tab bar inferior fija para mobile (<768px).
 *
 * GATE 1 §8/§9 — FUENTE ÚNICA: los tabs fijos (MOBILE_MAIN_TABS), su estado
 * activo (mapeo por proceso) y el sheet "Más" se DERIVAN de la misma
 * navigation-definition que el Sidebar y el Command Palette. Ya no existe
 * una tercera lista móvil: los 10 IDs muertos del sheet histórico
 * ("Módulo No Disponible") son imposibles por construcción.
 *
 * Test contractual por destino visible: tap → vista correcta → nunca
 * "Módulo No Disponible" → estado activo correcto → back correcto.
 */

const COLLAPSED_KEY = 'costpro:mobile-tabbar:collapsed';

interface MobileTabBarProps {
  navigationItems: unknown[]; // compat — el sheet se deriva de la definición
  currentView: string;
  onViewChange: (view: ViewType) => void;
}

export function MobileTabBar({ currentView, onViewChange }: MobileTabBarProps) {
  const { user } = useAuthStore();
  const { switchStore } = useStoreSwitcher();
  const { setActiveCostSection, activeCostSection } = useUIStore();
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');

  // FIX (2026-07-22): estado colapsable persistido
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem(COLLAPSED_KEY);
      if (v === 'true') setCollapsed(true);
    }
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    }
  }, [collapsed]);

  const isAdmin = user?.role === 'admin';
  const isEncargado = user?.role === 'encargado' || user?.role === 'manager';
  const { data: stores = [] } = useStores(user?.id || '', isAdmin, isEncargado);

  const storesToShow = stores.map(s => ({ id: s.id, name: s.name }));
  // P4-2: Debounce 200ms en búsqueda de sucursales
  const debouncedStoreSearch = useDebounce(storeSearch, 200);
  const filteredStores = debouncedStoreSearch.trim()
    ? storesToShow.filter(s => s.name.toLowerCase().includes(debouncedStoreSearch.toLowerCase().trim()))
    : storesToShow;

  const handleTabClick = (view: ViewType) => {
    onViewChange(view);
  };

  // ── Sheet "Más" — derivado de la definición (agrupado por sección) ──
  const sheetGroups = useMemo(() => {
    const roleOk = (e: NavEntry) => !e.roles || (user ? e.roles.some(r => hasRole(user, r as any)) : false);

    const mainTabIds = MOBILE_MAIN_TABS.map(t => t.id);
    const groups: { section: string; items: { id: string; label: string; icon?: any }[] }[] = [];

    // Inicio siempre primero
    groups.push({ section: 'INICIO', items: [{ id: 'dashboard', label: 'Inicio', icon: Home }] });

    for (const section of NAVIGATION_SECTIONS) {
      const sectionRolesOk = roleOk(section);
      if (!sectionRolesOk) continue;
      const items: { id: string; label: string; icon?: any }[] = [];

      const walk = (entries: NavEntry[]) => {
        for (const e of entries) {
          if (e.type === 'item') {
            if (mainTabIds.includes(e.id)) continue;      // ya son tabs fijos
            if (e.mobileHide) continue;                    // widget/acción
            if (!roleOk(e)) continue;
            items.push({ id: e.id, label: e.label, icon: e.icon });
          } else if (e.children) {
            walk(e.children);
          }
        }
      };
      walk(section.children || []);
      if (items.length > 0) groups.push({ section: section.label, items });
    }

    // Extensiones de acción (nueva recepción, calculadora, chat, vitrina)
    const extItems = ACTION_EXTENSIONS
      .filter(e => !e.mobileHide && roleOk(e))
      .map(e => ({ id: e.id, label: e.label, icon: e.icon }));
    if (extItems.length > 0) groups.push({ section: 'ACCIONES', items: extItems });

    return groups;
  }, [user]);

  // ── Tabs contextuales del módulo Costo (secciones internas de la vista) ──
  type CostSection = 'templates' | 'general' | 'structure' | 'annexes' | '__more__';
  const costTabs: { label: string; ariaLabel: string; icon: React.ComponentType<{ className?: string }>; section: CostSection }[] = [
    { label: 'Plant.', ariaLabel: 'Plantillas', icon: FolderOpen, section: 'templates' },
    { label: 'Datos', ariaLabel: 'Datos Generales', icon: FileText, section: 'general' },
    { label: 'Estruct.', ariaLabel: 'Estructura de Costos', icon: LayoutGrid, section: 'structure' },
    { label: 'Anexos', ariaLabel: 'Anexos', icon: Paperclip, section: 'annexes' },
    { label: 'Más', ariaLabel: 'Más opciones', icon: MoreHorizontal, section: '__more__' },
  ];
  const isCostModule = currentView === 'cost-sheets';
  const handleCostTabClick = (section: CostSection) => {
    if (section === '__more__') {
      setMoreSheetOpen(true);
    } else {
      setActiveCostSection(section);
    }
  };

  const handleStoreSelect = (storeId: string) => {
    switchStore(storeId);
    setStoreSheetOpen(false);
    setStoreSearch('');
  };

  return (
    <>
      {/* FIX (2026-07-22): Si está colapsada, mostrar solo un indicador vertical flotante. */}
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expandir barra de navegación"
          className="sm:hidden fixed bottom-4 right-4 z-30 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-2xl flex items-center justify-center active:scale-90 transition-transform"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <ChevronDown className="w-5 h-5 rotate-180" />
        </button>
      ) : (
        <nav
          className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-md border-t border-border flex items-center justify-around px-2 py-1"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Navegación principal mobile"
        >
          {isCostModule ? (
            costTabs.map(tab => (
              <TabButton
                key={tab.section}
                label={tab.label}
                ariaLabel={tab.ariaLabel}
                icon={tab.icon}
                isActive={tab.section === '__more__' ? moreSheetOpen : activeCostSection === tab.section}
                onClick={() => handleCostTabClick(tab.section)}
              />
            ))
          ) : (
            <DefaultTabs
              currentView={currentView}
              handleTabClick={handleTabClick}
              moreSheetOpen={moreSheetOpen}
              setMoreSheetOpen={setMoreSheetOpen}
            />
          )}
          {/* Botón colapsar — a la derecha de los tabs */}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Colapsar barra de navegación"
            className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 min-h-[48px] min-w-[36px] rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="w-4 h-4" />
            <span className="text-[9px] font-bold uppercase">Ocultar</span>
          </button>
        </nav>
      )}

      {/* Sheet: Selector de tienda — controlado directamente por state local */}
      <Sheet open={storeSheetOpen} onOpenChange={(o) => { setStoreSheetOpen(o); if (!o) setStoreSearch(''); }}>
        <SheetContent side="bottom" className="h-[60vh] p-0 sm:hidden">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Cambiar Sucursal
            </SheetTitle>
          </SheetHeader>
          <div className="relative px-4 pb-2">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
              placeholder="Buscar sucursal..."
              aria-label="Buscar sucursal por nombre"
              className="w-full pl-10 pr-10 py-2.5 h-11 rounded-lg bg-muted/40 border border-border/50 text-sm font-medium outline-none focus:ring-1 focus:ring-primary focus:border-primary/30 transition-all"
              autoComplete="off"
            />
            {storeSearch && (
              <button
                type="button"
                onClick={() => setStoreSearch('')}
                className="absolute right-7 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1 max-h-[40vh]">
            {filteredStores.length > 0 ? (
              filteredStores.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleStoreSelect(s.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3.5 rounded-xl cursor-pointer transition-colors min-h-[44px]",
                    user?.activeStoreId === s.id
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Building className={cn("w-4 h-4 shrink-0", user?.activeStoreId === s.id ? "text-primary" : "text-muted-foreground/40")} />
                    <span className="text-sm font-black uppercase tracking-tight truncate">{s.name}</span>
                  </div>
                  {user?.activeStoreId === s.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              ))
            ) : (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                No se encontraron sucursales con "<strong>{storeSearch}</strong>"
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet: Más — DERIVADO de navigation-definition (agrupado por sección) */}
      <Sheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-sm font-black uppercase tracking-widest text-primary">
              Más Opciones
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pt-2 pb-3">
            {/* M-4: acceso rápido al selector de tienda desde "Más" (admin/encargado). */}
            {storesToShow.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  setTimeout(() => setStoreSheetOpen(true), 150);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-primary/5 border border-primary/20 text-primary hover:bg-primary/10 transition-colors mb-3 min-h-[48px]"
              >
                <Building className="w-5 h-5 shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <div className="text-xs font-black uppercase tracking-widest">Cambiar Sucursal</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {storesToShow.find(s => s.id === user?.activeStoreId)?.name || 'Seleccionar...'}
                  </div>
                </div>
                <MoreHorizontal className="w-4 h-4 opacity-50" />
              </button>
            )}
          </div>
          <div className="px-4 pb-6 pt-0 space-y-4">
            {sheetGroups.map(group => (
              <div key={group.section}>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 mb-2">
                  {group.section}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {group.items.map(item => {
                    const Icon = item.icon || MoreHorizontal;
                    return (
                      <button
                        key={`${group.section}-${item.id}`}
                        onClick={() => {
                          onViewChange(item.id as ViewType);
                          setMoreSheetOpen(false);
                        }}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors min-h-[72px]",
                          currentView === item.id
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-muted/20 border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-[10px] font-black uppercase tracking-wide text-center leading-tight">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TabButton({
  label,
  ariaLabel,
  icon: Icon,
  isActive,
  onClick,
}: {
  label: string;
  ariaLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 min-h-[48px] min-w-[44px] rounded-lg transition-colors flex-1",
        isActive ? "text-primary" : "text-muted-foreground"
      )}
      aria-label={ariaLabel || label}
      aria-pressed={isActive}
    >
      <Icon className={cn("w-5 h-5", isActive && "text-primary")} />
      <span className={cn(
        "text-xs font-black uppercase tracking-tight truncate max-w-full",
        isActive && "text-primary"
      )}>
        {label}
      </span>
    </button>
  );
}

// C1: Sub-componente para los tabs operativos default (Vender/Recibir/Inventario/Caja/Más).
// GATE 1: el estado activo se deriva de MOBILE_MAIN_TABS (mapeo por proceso —
// corrige P2-5: "Vender" ya no se marca activo en Trazabilidad de stock).
function DefaultTabs({
  currentView,
  handleTabClick,
  moreSheetOpen,
  setMoreSheetOpen,
}: {
  currentView: string;
  handleTabClick: (view: ViewType) => void;
  moreSheetOpen: boolean;
  setMoreSheetOpen: (open: boolean) => void;
}) {
  const mainTabs = MOBILE_MAIN_TABS;
  const activeTab = mainTabs.find(t => t.activeViews.includes(currentView));

  return (
    <>
      {mainTabs.map(tab => {
        const Icon = tab.icon;
        return (
          <TabButton
            key={tab.id}
            label={tab.label}
            ariaLabel={tab.label}
            icon={Icon}
            isActive={activeTab?.id === tab.id}
            onClick={() => handleTabClick(tab.id as ViewType)}
          />
        );
      })}
      <TabButton
        label="Más"
        icon={MoreHorizontal}
        isActive={moreSheetOpen}
        onClick={() => setMoreSheetOpen(true)}
      />
    </>
  );
}
