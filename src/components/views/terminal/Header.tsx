'use client';

import React from 'react';
import { Menu, X, HelpCircle, Bell, Building as BuildingIcon, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuthStore, ViewType } from '@/store';
import { UserContract } from '@/contracts/user';
import { NavigationItem } from '@/hooks/ui/useTerminalNavigation';
import { SyncStatusBadge } from '@/components/ui/SyncStatusBadge';
import { SyncConflictModal } from '@/components/modals/SyncConflictModal';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface HeaderProps {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  currentView: string;
  navigationItems: NavigationItem[];
  onViewChange: (view: ViewType) => void;
  user: UserContract | null;
  handleSetActiveStore: (id: string) => void;
}

export const Header = ({
  sidebarOpen,
  toggleSidebar,
  currentView,
  navigationItems,
  onViewChange,
  user,
  handleSetActiveStore
}: HeaderProps) => {
  const isMocked = useAuthStore(state => state.isMocked);

  return (
    <header className="bg-background/80 backdrop-blur-xl p-2 sm:p-6 sticky top-0 z-30 border-b border-white/5 w-full">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 overflow-hidden">
          <button
            onClick={toggleSidebar}
            className="neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
            aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto min-w-0 flex-1 no-scrollbar pr-2">
            <h1 className="text-[clamp(0.75rem,3.5vw,1.5rem)] font-black uppercase tracking-tighter text-primary whitespace-nowrap shrink-0">
              {navigationItems.find(i => i.id === currentView)?.label || 'Panel'}
            </h1>

            <div className="h-4 w-[1px] bg-white/10 shrink-0 mx-1 hidden sm:block" />

            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <p className="text-[10px] sm:text-xs font-black text-muted-foreground uppercase tracking-[0.1em] sm:tracking-[0.2em] truncate hidden lg:block">
                {user?.fullName}
              </p>

              {user?.memberships && user.memberships.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-primary/20 bg-primary/5 min-w-0 max-w-[140px] sm:max-w-none">
                  <BuildingIcon className="w-3 h-3 text-primary shrink-0" />
                  {user.memberships.length > 1 ? (
                    <select
                      value={user.activeStoreId || ''}
                      onChange={(e) => handleSetActiveStore(e.target.value)}
                      className="bg-transparent text-[9px] sm:text-xs font-black uppercase text-primary outline-none cursor-pointer border-none p-0 focus:ring-0 truncate w-full min-w-[70px] appearance-none sm:appearance-auto"
                      title="Cambiar sucursal activa"
                    >
                      {user.memberships.map((m: any) => (
                        <option key={m.store_id} value={m.store_id} className="text-foreground bg-background">
                          {m.store?.name || `Sucursal ${m.store_id.slice(0, 4)}`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[9px] sm:text-xs font-black uppercase text-primary truncate max-w-[100px] sm:max-w-none">
                      {user.memberships[0].store?.name || `Sucursal ${user.memberships[0].store_id?.slice(0, 4)}`}
                    </span>
                  )}
                </div>
              )}
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
              "neu-raised-sm w-11 h-11 flex items-center justify-center relative active:scale-90 transition-transform",
              currentView === 'help' && "bg-primary text-white"
            )}
            aria-label="Ayuda"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "neu-raised-sm w-11 h-11 flex items-center justify-center relative active:scale-90 transition-transform",
                  isMocked && "text-danger"
                )}
                aria-label="Alertas"
              >
                <Bell className="w-5 h-5" />
                <span className={cn(
                  "absolute top-2.5 right-2.5 w-2 h-2 rounded-full animate-ping",
                  isMocked ? "bg-danger" : "bg-primary"
                )} />
                <span className={cn(
                  "absolute top-2.5 right-2.5 w-2 h-2 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]",
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
    </header>
  );
};
