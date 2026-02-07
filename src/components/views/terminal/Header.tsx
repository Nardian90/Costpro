'use client';

import React from 'react';
import { Menu, X, HelpCircle, Bell, Building as BuildingIcon, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, ViewType } from '@/store';
import { UserContract } from '@/contracts/user';
import { NavigationItem } from '@/hooks/ui/useTerminalNavigation';
import { SyncStatusBadge } from '@/components/ui/SyncStatusBadge';
import { SyncConflictModal } from '@/components/modals/SyncConflictModal';
import { toast } from 'sonner';

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
    <header className="bg-background/80 backdrop-blur-xl p-4 sm:p-6 sticky top-0 z-30 border-b border-white/5 w-full">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 overflow-hidden">
          <button
            onClick={toggleSidebar}
            className="neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
            aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-3 overflow-x-auto min-w-0 flex-1 no-scrollbar">
            <h1 className="text-[clamp(1.125rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary whitespace-nowrap min-w-0">
              {navigationItems.find(i => i.id === currentView)?.label || 'Panel'}
            </h1>
            <div className="h-4 w-[1px] bg-white/10 hidden sm:block shrink-0" />

            <div className="hidden sm:flex items-center gap-3">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] truncate">
                {user?.fullName}
              </p>

              {user?.memberships && user.memberships.length > 1 && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg border border-primary/20 bg-primary/5">
                  <BuildingIcon className="w-3 h-3 text-primary" />
                  <select
                    value={user.activeStoreId || ''}
                    onChange={(e) => handleSetActiveStore(e.target.value)}
                    className="bg-transparent text-[9px] font-black uppercase text-primary outline-none cursor-pointer border-none p-0 focus:ring-0"
                  >
                    {user.memberships.map((m: any) => (
                      <option key={m.store_id} value={m.store_id} className="text-foreground bg-background">
                        {m.store?.name || `Sucursal ${m.store_id.slice(0, 4)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden xs:block">
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
          <button
            onClick={() => {
              if (isMocked) {
                toast.info('Conectado solo Front (Modo Offline)', {
                  description: 'Estás utilizando una cuenta de bypass local. Los cambios no se sincronizarán con Supabase.',
                  icon: <AlertTriangle className="w-4 h-4 text-warning" />,
                  duration: 5000,
                });
              }
            }}
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
        </div>
      </div>
    </header>
  );
};
