'use client';

import React from 'react';
import { Menu, X, HelpCircle, Bell, Building as BuildingIcon, AlertTriangle, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuthStore, ViewType } from '@/store';
import { UserContract } from '@/contracts/user';
import { NavigationItem } from '@/hooks/ui/useTerminalNavigation';
import { SyncStatusBadge } from '@/components/ui/SyncStatusBadge';
import { SyncConflictModal } from '@/components/modals/SyncConflictModal';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderProps {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  currentView: string;
  navigationItems: NavigationItem[];
  onViewChange: (view: ViewType) => void;
  user: UserContract | null;
  handleSetActiveStore: (id: string) => void;
  allStores?: any[];
}

export const Header = ({
  sidebarOpen,
  toggleSidebar,
  currentView,
  navigationItems,
  onViewChange,
  user,
  handleSetActiveStore,
  allStores = []
}: HeaderProps) => {
  const isMocked = useAuthStore(state => state.isMocked);

  // Determine which list of stores to show
  const storesToShow = user?.role === 'admin' && allStores.length > 0
    ? allStores.map(s => ({ id: s.id, name: s.name }))
    : user?.memberships?.map(m => ({
        id: m.store_id || '',
        name: m.store?.name || (m.store_id ? `Sucursal ${m.store_id.slice(0, 4)}` : 'Desconocida')
      })) || [];

  const activeStore = storesToShow.find(s => s.id === user?.activeStoreId);
  const activeStoreName = activeStore?.name || 'Seleccionar Tienda';

  return (
    <header className="bg-background/80 backdrop-blur-xl p-2 sm:px-6 sm:py-4 sticky top-0 z-30 w-full">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 overflow-hidden">
          <button
            onClick={toggleSidebar}
            className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl border border-border/50 bg-muted/50 hover:bg-muted active:scale-90 transition-all"
            aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto min-w-0 flex-1 no-scrollbar pr-2">
            <h1 className="text-[clamp(0.75rem,3.5vw,1.25rem)] font-label font-bold capitalize tracking-tight text-primary whitespace-nowrap shrink-0">
              {navigationItems.find(i => i.id === currentView)?.label || 'Panel'}
            </h1>

            <div className="h-4 w-[1px] bg-border/50 shrink-0 mx-1 hidden sm:block" />

            <div className="flex items-center gap-2 min-w-0 shrink-0">
              {storesToShow.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "group relative flex items-center gap-2 px-3 h-11 rounded-xl transition-all outline-none border min-w-0 max-w-[130px] sm:max-w-none",
                        storesToShow.length > 1
                          ? "bg-primary text-foreground border-primary shadow-lg shadow-primary/20 hover:opacity-90"
                          : "bg-muted/50 border-border/50 text-primary cursor-default"
                      )}
                      disabled={storesToShow.length <= 1}
                    >
                      <BuildingIcon className={cn("w-4 h-4 shrink-0", storesToShow.length > 1 ? "text-foreground" : "text-primary")} />

                      <span className="text-[10px] sm:text-xs font-black uppercase truncate tracking-tight">
                        {activeStoreName}
                      </span>

                      {storesToShow.length > 1 && (
                        <ChevronDown className="w-3.5 h-3.5 text-white/70 shrink-0" />
                      )}

                      {/* Micro-interaction highlight for trigger */}
                      {storesToShow.length > 1 && (
                        <div className="absolute inset-0 rounded-xl bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  </DropdownMenuTrigger>

                  {storesToShow.length > 1 && (
                    <DropdownMenuContent align="start" className="w-[calc(100vw-32px)] sm:w-64 p-2 rounded-2xl bg-card border-border shadow-2xl z-40">
                      <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                        Cambiar Sucursal
                      </div>
                      <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                        {storesToShow.map((s) => (
                          <DropdownMenuItem
                            key={s.id}
                            onClick={() => handleSetActiveStore(s.id)}
                            className={cn(
                              "flex items-center justify-between px-3 py-4 rounded-xl cursor-pointer transition-colors focus:bg-primary/10 focus:text-primary min-h-[44px]",
                              user?.activeStoreId === s.id ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground hover:bg-muted"
                            )}
                          >
                            <div className="flex items-center gap-3 truncate">
                              <BuildingIcon className={cn("w-4 h-4 shrink-0", user?.activeStoreId === s.id ? "text-primary" : "text-muted-foreground/40")} />
                              <span className="text-xs font-black uppercase tracking-tight truncate">{s.name}</span>
                            </div>
                            {user?.activeStoreId === s.id && (
                              <Check className="w-4 h-4 text-primary shrink-0" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    </DropdownMenuContent>
                  )}
                </DropdownMenu>
              )}

              <p className="text-xs font-semibold text-muted-foreground truncate hidden lg:block ml-2">
                {user?.fullName}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ThemeToggle />
          <div className="hidden sm:block">
            <SyncStatusBadge />
          </div>
          <SyncConflictModal />
          <button
            onClick={() => onViewChange('help')}
            className={cn(
              "w-11 h-11 flex items-center justify-center relative rounded-xl border border-border/50 bg-muted/50 hover:bg-muted active:scale-90 transition-all",
              currentView === 'help' && "bg-primary text-foreground border-primary shadow-lg shadow-primary/20 hover:opacity-90"
            )}
            aria-label="Ayuda"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "w-11 h-11 flex items-center justify-center relative rounded-xl border border-border/50 bg-muted/50 hover:bg-muted active:scale-90 transition-all",
                  isMocked && "text-danger border-danger/30"
                )}
                aria-label="Alertas"
              >
                <Bell className="w-5 h-5" />
                <span className={cn(
                  "absolute top-2 right-2 w-2.5 h-2.5 rounded-full animate-ping",
                  isMocked ? "bg-danger/60" : "bg-primary/60"
                )} />
                <span className={cn(
                  "absolute top-2 right-2 w-2.5 h-2.5 rounded-full",
                  isMocked ? "bg-danger" : "bg-primary"
                )} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 overflow-hidden border-primary/20 bg-background/95 backdrop-blur-xl">
               <div className="p-4 border-b border-white/5 bg-primary/5">
                 <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                   <Bell className="w-3 h-3" />
                   Centro de Notificaciones
                 </h4>
               </div>
               <div className="p-4 space-y-4">
                 {isMocked ? (
                   <div className="flex gap-3 p-3 rounded-xl bg-danger/5 border border-danger/20">
                     <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
                     <div className="space-y-1">
                       <p className="text-xs font-black uppercase tracking-tight text-danger">Modo Offline Detectado</p>
                       <p className="text-xs text-muted-foreground leading-relaxed text-xs">
                         Estás utilizando una cuenta de bypass local. Los cambios no se sincronizarán con la base de datos central.
                       </p>
                     </div>
                   </div>
                 ) : (
                   <div className="py-8 text-center">
                     <p className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-50 italic">
                       No tienes notificaciones pendientes
                     </p>
                   </div>
                 )}
               </div>
               <div className="p-3 bg-muted/30 border-t border-white/5">
                  <p className="text-xs text-center font-bold text-muted-foreground uppercase tracking-tighter">
                    Actualizado hace un momento
                  </p>
               </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Subtle green gradient accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#22c55e]/40 to-transparent" />
    </header>
  );
};
