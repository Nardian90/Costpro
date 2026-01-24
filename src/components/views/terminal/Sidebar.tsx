'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Search, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import CostProLogo from '@/components/CostProLogo';
import { ViewType } from '@/store';
import { NavigationItem } from '@/hooks/useTerminalNavigation';

interface SidebarProps {
  sidebarOpen: boolean;
  sidebarSearch: string;
  setSidebarSearch: (val: string) => void;
  navigationItems: NavigationItem[];
  currentView: string;
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
  logoHeight: any;
  logoOpacity: any;
  logoScale: any;
  navRef: React.RefObject<HTMLElement | null>;
}

export const Sidebar = ({
  sidebarOpen,
  sidebarSearch,
  setSidebarSearch,
  navigationItems,
  currentView,
  onViewChange,
  onLogout,
  logoHeight,
  logoOpacity,
  logoScale,
  navRef
}: SidebarProps) => {
  return (
    <aside className={cn(
      "fixed lg:sticky top-0 h-screen z-50 transition-all duration-300 ease-in-out border-r border-sidebar-border shadow-2xl overflow-hidden",
      sidebarOpen ? "w-64 lg:w-72 translate-x-0" : "w-0 -translate-x-full border-r-0"
    )}>
      <div className="bg-sidebar/90 backdrop-blur-2xl h-full flex flex-col overflow-hidden w-64 lg:w-72">
        <motion.div
          id="sidebar-logo-container"
          style={{
            height: logoHeight,
            opacity: logoOpacity,
            overflow: 'hidden'
          }}
          className="border-b border-sidebar-border/50 shrink-0 bg-sidebar/5"
        >
          <motion.div
            style={{ scale: logoScale }}
            className="p-8 h-[160px] flex flex-col justify-center"
          >
            <CostProLogo size={50} animated={true} />
            <div className="mt-4">
              <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Terminal Operativa</div>
            </div>
          </motion.div>
        </motion.div>

        <div className="px-6 py-4 shrink-0 border-b border-sidebar-border/30 bg-sidebar/5">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="BUSCAR..."
              className="w-full bg-background/50 border border-primary/10 rounded-xl py-2.5 pl-9 pr-4 text-[10px] font-black focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-[0.2em] placeholder:text-muted-foreground/30"
            />
          </div>
        </div>

        <nav
          id="sidebar-nav"
          ref={navRef}
          className="flex-1 overflow-y-auto p-4 no-scrollbar overscroll-contain scroll-smooth"
        >
          <div className="space-y-8">
            {['OPERACIONES', 'INVENTARIO', 'GESTIÓN', 'SOPORTE'].map(category => {
              const categoryItems = navigationItems.filter(i => i.category === category);
              if (categoryItems.length === 0) return null;

              return (
                <div key={category} className="space-y-2">
                  <div className="px-4 text-[9px] font-black text-primary/40 tracking-[0.4em] uppercase mb-4">
                    {category}
                  </div>
                  <div className="space-y-1">
                    {categoryItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => onViewChange(item.id as ViewType)}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95",
                          currentView === item.id
                            ? "bg-primary text-white shadow-xl shadow-primary/20 font-black"
                            : "hover:bg-primary/5 text-sidebar-foreground/70 font-bold"
                        )}
                      >
                        <item.icon className={cn("w-5 h-5", currentView === item.id ? "text-white" : "group-hover:text-primary transition-colors")} />
                        <span className="text-xs uppercase tracking-widest">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <div className="p-6 border-t border-sidebar-border/50 shrink-0">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl transition-all group active:scale-95 hover:bg-danger/10 text-danger font-bold"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-xs uppercase tracking-widest">Salir</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
