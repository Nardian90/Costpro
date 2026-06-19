'use client';

import React, { useState } from 'react';
import { Home, Package, ShoppingCart, Building, MoreHorizontal, Search, Check, X, Warehouse, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { type ViewType } from '@/store';
import { useAuthStore } from '@/store';
import { useStoreSwitcher } from '@/hooks/ui/useStoreSwitcher';
import { useStores } from '@/hooks/api/useStores';
import type { NavigationItem } from '@/hooks/ui/useTerminalNavigation';

/**
 * F5-T02: Tab bar inferior fija para mobile (<768px).
 *
 * M-4 (IA Audit): rediseñado con 4 accesos rápidos alineados a las 4 tareas
 * operativas más frecuentes del personal de tienda:
 *   1. Vender   → Terminal de Venta (pos)
 *   2. Recibir  → Recepciones (reception_list) — abastecimiento
 *   3. Inventario → Inventario (inventory) — consulta de stock
 *   4. Caja     → Arqueo de Caja (cash) — cierre de turno
 *
 * Antes: Inicio, Stock, POS, Tiendas, Más (5 tabs mezclando navegación raíz
 * con operación). Ahora: 4 tabs operativos + 1 "Más" para todo lo demás.
 * Las vistas de gestión (Inicio, Tiendas, Dashboard) están bajo "Más" porque
 * no son acciones operativas frecuentes del personal en piso de venta.
 *
 * El Sheet de "Tiendas" se mantiene accesible vía el Sheet "Más" para admins.
 */

interface MobileTabBarProps {
  navigationItems: NavigationItem[];
  currentView: string;
  onViewChange: (view: ViewType) => void;
}

export function MobileTabBar({ navigationItems, currentView, onViewChange }: MobileTabBarProps) {
  const { user } = useAuthStore();
  const { switchStore } = useStoreSwitcher();
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');

  const isAdmin = user?.role === 'admin';
  const isEncargado = user?.role === 'encargado' || user?.role === 'manager';
  const { data: stores = [] } = useStores(user?.id || '', isAdmin, isEncargado);

  const storesToShow = stores.map(s => ({ id: s.id, name: s.name }));
  const filteredStores = storeSearch.trim()
    ? storesToShow.filter(s => s.name.toLowerCase().includes(storeSearch.toLowerCase().trim()))
    : storesToShow;

  const handleTabClick = (view: ViewType) => {
    onViewChange(view);
  };

  // M-4 (IA Audit): items para el sheet "Más" — todos excepto los 4 accesos
  // principales del tab bar. Se incluye 'occ' (Inicio) y 'stores' (Tiendas)
  // porque ya no tienen tab propio. 'pos', 'reception_list', 'inventory' y
  // 'cash' se excluyen porque son los 4 tabs principales.
  const moreItems = navigationItems.filter(item =>
    !['pos', 'reception_list', 'inventory', 'cash'].includes(item.id)
  );

  const handleStoreSelect = (storeId: string) => {
    switchStore(storeId);
    setStoreSheetOpen(false);
    setStoreSearch('');
  };

  return (
    <>
      {/* Tab bar fija inferior — solo mobile */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border flex items-center justify-around px-2 py-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Navegación principal mobile"
      >
        {/* M-4 (IA Audit): 4 accesos operativos + Más.
            "Vender" usa icon ShoppingCart (mismo del sidebar) para consistencia.
            "Recibir" usa Warehouse (mismo del sidebar Logística > Recepciones).
            "Inventario" usa Package (mismo del sidebar Almacén > Inventario).
            "Caja" usa DollarSign (arqueo/cierre de caja).
            "Más" abre Sheet con todas las demás vistas (Inicio, Tiendas, Reportes, etc.). */}
        <TabButton label="Vender" icon={ShoppingCart} isActive={currentView === 'pos' || currentView === 'sales-hub' || currentView === 'sales_catalog' || currentView === 'catalog' || currentView === 'history'} onClick={() => handleTabClick('pos')} />
        <TabButton label="Recibir" icon={Warehouse} isActive={currentView === 'reception_list' || currentView === 'recepcion'} onClick={() => handleTabClick('reception_list')} />
        <TabButton label="Inventario" icon={Package} isActive={currentView === 'inventory'} onClick={() => handleTabClick('inventory')} />
        <TabButton label="Caja" icon={DollarSign} isActive={currentView === 'cash'} onClick={() => handleTabClick('cash')} />
        <TabButton label="Más" icon={MoreHorizontal} isActive={moreSheetOpen} onClick={() => setMoreSheetOpen(true)} />
      </nav>

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

      {/* Sheet: Más — todas las rutas no principales */}
      <Sheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
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
                  // Pequeño delay para que el sheet "Más" cierre antes de abrir el de tiendas
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
          <div className="grid grid-cols-3 gap-3 px-4 pb-6 pt-0">
            {moreItems.map(item => {
              const Icon = item.icon || MoreHorizontal;
              return (
                <button
                  key={item.id}
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
                  <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TabButton({
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 min-h-[48px] min-w-[48px] rounded-lg transition-colors",
        isActive ? "text-primary" : "text-muted-foreground"
      )}
      aria-label={label}
      aria-pressed={isActive}
    >
      <Icon className={cn("w-5 h-5", isActive && "text-primary")} />
      <span className={cn(
        "text-[9px] font-black uppercase tracking-widest",
        isActive && "text-primary"
      )}>
        {label}
      </span>
    </button>
  );
}

