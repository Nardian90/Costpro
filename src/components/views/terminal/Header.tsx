'use client';

import React from 'react';
import {
  Menu,
  X,
  ChevronDown,
  BuildingIcon,
  Check,
  User,
  Settings,
  LogOut,
  HelpCircle,
  Layout
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SyncConflictModal } from '@/components/modals/SyncConflictModal';
import { cn } from '@/lib/utils';
import { UserContract } from '@/contracts/user';
import { NavigationItem } from '@/hooks/ui/useTerminalNavigation';
import { ViewType, SidebarState } from '@/store';

interface HeaderProps {
  sidebarState: SidebarState;
  toggleSidebar: () => void;
  currentView: string;
  navigationItems: NavigationItem[];
  onViewChange: (view: ViewType) => void;
  user: UserContract | null;
  handleSetActiveStore: (id: string) => void;
  allStores?: any[];
  onLogout?: () => void;
}

function SidebarIcon({ sidebarState }: { sidebarState: string }) {
  switch (sidebarState) {
    case 'expanded': return <X className="w-5 h-5" />;
    case 'rail': return <Layout className="w-5 h-5" />;
    case 'closed': return <Menu className="w-5 h-5" />;
  }
}

export const Header = ({
  sidebarState,
  toggleSidebar,
  currentView,
  navigationItems,
  onViewChange,
  user,
  handleSetActiveStore,
  allStores = [],
  onLogout,
}: HeaderProps) => {
  // Determine which list of stores to show
  const storesToShow = user?.role === 'admin' && allStores.length > 0
    ? allStores.map(s => ({ id: s.id, name: s.name }))
    : user?.memberships?.filter(m => m.status === 'active').map(m => ({
        id: m.store_id || '',
        name: m.store?.name || (m.store_id ? `Sucursal ${m.store_id.slice(0, 4)}` : 'Desconocida')
      })) || [];

  const activeStore = storesToShow.find(s => s.id === user?.activeStoreId);
  const activeStoreName = activeStore?.name || 'Seleccionar Tienda';

  return (
    <header className="bg-background/80 backdrop-blur-xl p-1.5 sm:px-4 sm:py-2 sticky top-0 z-30 w-full">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 overflow-hidden">
          <button
            onClick={toggleSidebar}
            className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl border border-border/50 bg-muted/50 hover:bg-muted active:scale-90 transition-all"
            aria-label="Cambiar estado del menú"
          >
            <SidebarIcon sidebarState={sidebarState} />
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
                      <BuildingIcon aria-hidden="true" className={cn("w-4 h-4 shrink-0", storesToShow.length > 1 ? "text-foreground" : "text-primary")} />

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
                              <BuildingIcon aria-hidden="true" className={cn("w-4 h-4 shrink-0", user?.activeStoreId === s.id ? "text-primary" : "text-muted-foreground/40")} />
                              <span className="text-xs font-black uppercase tracking-tight truncate">{s.name}</span>
                            </div>
                            {user?.activeStoreId === s.id && (
                              <Check aria-hidden="true" className="w-4 h-4 text-primary shrink-0" />
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

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <ThemeToggle />
          <SyncConflictModal />

          {/* User Avatar Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs sm:text-sm font-bold uppercase tracking-tight hover:ring-2 hover:ring-primary/30 hover:ring-offset-2 hover:ring-offset-background active:scale-90 transition-all shrink-0"
                aria-label="Menú de usuario"
              >
                {user?.fullName ? user.fullName.split(' ').map(n => n[0]).slice(0, 2).join('') : '?'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 sm:w-72 p-2 rounded-2xl bg-card border-border shadow-2xl z-50">
              <DropdownMenuLabel className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold uppercase shrink-0">
                    {user?.fullName ? user.fullName.split(' ').map(n => n[0]).slice(0, 2).join('') : '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{user?.fullName || 'Usuario'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email || 'sin correo'}</p>
                  </div>
                </div>
                {user?.role && (
                  <span className="mt-2 inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
                    {user.role}
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer focus:bg-primary/10 focus:text-primary min-h-[44px]"
                onClick={() => onViewChange('settings')}
              >
                <User aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold">Mi Perfil</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer focus:bg-primary/10 focus:text-primary min-h-[44px]"
                onClick={() => onViewChange('settings')}
              >
                <Settings aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold">Configuración</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer focus:bg-danger/10 focus:text-danger min-h-[44px] text-danger"
                onClick={() => onLogout?.()}
              >
                <LogOut aria-hidden="true" className="w-4 h-4" />
                <span className="text-xs font-semibold">Cerrar Sesion</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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

        </div>
      </div>

      {/* Subtle green gradient accent line with glow shadow above */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="h-4 bg-gradient-to-b from-transparent to-[#22c55e]/[0.03]" />
        <div className="h-px bg-gradient-to-r from-transparent via-[#22c55e]/40 to-transparent" />
      </div>
    </header>
  );
};
export default Header;
