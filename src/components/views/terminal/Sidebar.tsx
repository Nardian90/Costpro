'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  X,
  Search,
  ChevronDown,
  LogOut,
  Zap,
  Calculator,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore, useUIStore, ViewType } from '@/store';
import { NavModule, SIDEBAR_STRUCTURE } from '@/config/navigation/sidebar.structure';
import { useFilteredNavigation } from '@/hooks/ui/useFilteredNavigation';
import { cn } from '@/lib/utils';
import SidebarFocusMode from './SidebarFocusMode';
import OnlineStatusDot from '@/components/shared/OnlineStatusDot';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
  onClose: () => void;
  onPrefetchView: (view: ViewType) => void;
}

const Sidebar = React.memo(({ onViewChange, onLogout, onClose, onPrefetchView }: SidebarProps) => {
  const { user } = useAuthStore();
  const {
    currentView,
    sidebarState,
    setSidebarState,
    isCalculatorOpen,
    setIsCalculatorOpen,
    activeCostSection,
    ipvActiveTab,
    setIpvActiveTab,
    setActiveCostSection
  } = useUIStore();
  const isMobile = useIsMobile();
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const [focusedModuleId, setFocusedModuleId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const allNavigation = useFilteredNavigation();
  const filteredNavigation = useMemo(() => {
    if (!sidebarSearch) return allNavigation;
    const searchLower = sidebarSearch.toLowerCase();
    return allNavigation.filter(mod =>
      mod.label.toLowerCase().includes(searchLower) ||
      mod.children?.some(child => child.label.toLowerCase().includes(searchLower))
    );
  }, [allNavigation, sidebarSearch]);

  const toggleModule = useCallback((moduleId: string, isSubmenu: boolean) => {
    if (sidebarState === 'rail') {
       setSidebarState('expanded');
       setExpandedModules([moduleId]);
       return;
    }
    setExpandedModules(prev =>
      prev.includes(moduleId) ? prev.filter(id => id !== moduleId) : [...prev, moduleId]
    );
  }, [sidebarState, setSidebarState]);

  const handleNavClick = useCallback((view: ViewType) => {
    onViewChange(view);
  }, [onViewChange]);

  const renderNavItem = useCallback((item: any, depth = 0) => {
    const isActive = currentView === item.id || (currentView === 'cost-sheets' && activeCostSection === item.id);
    const isRail = sidebarState === 'rail';

    if (isRail && depth === 0) {
      return (
        <TooltipProvider key={item.id} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleNavClick(item.id as ViewType)}
                onMouseEnter={() => onPrefetchView(item.id as ViewType)}
                className={cn(
                  "w-12 h-12 flex items-center justify-center rounded-xl transition-all active:scale-95 mx-auto mb-2",
                  isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-sidebar-foreground/60 hover:bg-primary/10 hover:text-primary"
                )}
              >
                {item.icon && <item.icon className="w-5 h-5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-bold uppercase tracking-widest text-[10px]">
              {item.label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <button
        key={item.id}
        onClick={() => handleNavClick(item.id as ViewType)}
        onMouseEnter={() => onPrefetchView(item.id as ViewType)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          isActive ? "bg-primary/10 text-primary font-bold shadow-sm" : "text-sidebar-foreground/60 hover:bg-primary/5 hover:text-sidebar-foreground"
        )}
      >
        {item.icon && <item.icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", isActive ? "text-primary" : "opacity-50")} />}
        <span className="text-xs uppercase tracking-wider truncate">{item.label}</span>
        {isActive && (
          <motion.div layoutId="active-nav-indicator" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </button>
    );
  }, [currentView, ipvActiveTab, onViewChange, onPrefetchView, setIpvActiveTab, activeCostSection, setActiveCostSection, sidebarState, handleNavClick]);

  function renderModule(mod: NavModule, depth = 0): React.ReactNode {
    const isExpanded = expandedModules.includes(mod.id);
    const isRail = sidebarState === 'rail';

    if (mod.type === 'item') {
      return renderNavItem(mod, depth);
    }

    if (isRail && depth === 0) {
      return (
        <TooltipProvider key={mod.id} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => toggleModule(mod.id, true)}
                className="w-12 h-12 flex items-center justify-center rounded-xl transition-all active:scale-95 mx-auto mb-2 text-sidebar-foreground/60 hover:bg-primary/10 hover:text-primary"
              >
                {mod.icon && <mod.icon className="w-5 h-5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-bold uppercase tracking-widest text-[10px]">
              {mod.label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <div key={mod.id} className="relative">
        <button
          aria-expanded={isExpanded}
          onClick={() => toggleModule(mod.id, mod.type === 'submenu')}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            depth === 0 ? "sm:mt-3" : "sm:mt-0.5",
            isExpanded ? "bg-primary/5 text-primary" : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
          )}
        >
          <div className="flex items-center gap-3">
             {mod.icon && <mod.icon className="w-4 h-4 opacity-50" />}
             <span className={cn(
                "font-black tracking-[0.2em] uppercase",
                depth === 0 ? "text-xs" : "text-[11px] opacity-80"
             )}>{mod.label}</span>
          </div>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", isExpanded && "rotate-180")} />
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={cn("overflow-hidden", depth === 0 ? "pl-2" : "pl-4")}
              role="menu"
            >
              <div className="pt-1 pb-2 space-y-0.5">
                {mod.children?.map(child => renderModule(child, depth + 1))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const focusedModule = useMemo(() =>
    SIDEBAR_STRUCTURE.find(m => m.id === focusedModuleId),
  [focusedModuleId]);

  const sidebarWidthClass = useMemo(() => {
    switch (sidebarState) {
      case 'expanded': return "w-64 lg:w-72 translate-x-0";
      case 'rail': return "w-20 translate-x-0";
      case 'closed': return "w-0 -translate-x-full border-r-0";
    }
  }, [sidebarState]);

  return (
    <aside
      role="navigation"
      aria-label="Barra lateral de navegación"
      className={cn(
        "fixed inset-y-0 left-0 z-40 bg-sidebar transition-all duration-300 ease-in-out border-r border-sidebar-border shadow-2xl overflow-hidden enhanced-sidebar-edge",
        sidebarWidthClass
      )}
    >
      <div className={cn(
        "relative bg-sidebar/90 backdrop-blur-2xl h-full flex flex-col overflow-hidden transition-all duration-300",
        sidebarState === 'expanded' ? "w-64 lg:w-72" : sidebarState === 'rail' ? "w-20" : "w-0"
      )}>
        {/* Gradient accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] z-50 overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-primary/0 via-primary to-primary/0 animate-gradient-shift" style={{ backgroundSize: '200% 100%' }} />
        </div>

        <div
          id="sidebar-logo-container"
          className="shrink-0 no-scrollbar max-w-full overflow-x-hidden"
        >
          <div
            className={cn(
              "px-4 pt-4 pb-2 flex items-center justify-between",
              sidebarState === 'rail' && "justify-center"
            )}
          >
            {sidebarState !== 'rail' ? (
              <h2 className="text-foreground font-black text-lg uppercase tracking-tighter leading-none">
                COST<span className="text-green-500 dark:text-green-400">PRO</span>
              </h2>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-xs">CP</div>
            )}

            {onClose && !focusedModuleId && !isMobile && sidebarState === 'expanded' && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label="Cerrar menú lateral"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {isMobile && (
               <button
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all active:scale-95"
               >
                 <X className="w-4 h-4" />
               </button>
            )}
          </div>

          {sidebarState === 'expanded' && (
            <div className="px-1 pb-1">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  aria-label="Buscar en el menú"
                  placeholder="BUSCAR..."
                  className="w-full h-9 bg-background/50 border border-primary/10 rounded-xl pl-9 pr-16 text-xs font-black focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-[0.2em] placeholder:text-muted-foreground/30"
                />
                <kbd className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center bg-muted text-muted-foreground text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none select-none">
                  ⌘K
                </kbd>
              </div>
            </div>
          )}
        </div>

        <nav
          id="sidebar-nav"
          role="menubar"
          aria-orientation="vertical"
          className="flex-1 overflow-y-auto pt-0 px-3 pb-4 sm:pb-4 no-scrollbar overscroll-contain scroll-smooth"
        >
          <AnimatePresence mode="wait">
            {focusedModuleId && focusedModule && sidebarState === 'expanded' ? (
              <SidebarFocusMode onBack={() => setFocusedModuleId(null)}
                key="focus-mode"
                module={focusedModule}
                renderModule={renderModule}
              />
            ) : (
              <motion.div
                key="normal-mode"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn("space-y-1 sm:space-y-4", sidebarState === 'rail' && "space-y-2")}
              >
                {filteredNavigation.map(module => renderModule(module))}
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        <div className="shrink-0">
          {/* Gradient footer separator */}
          <div className="h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />

          {/* User profile section */}
          {user && sidebarState === 'expanded' && (
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-primary-foreground text-xs font-black uppercase">
                    {(() => {
                      const name = user?.fullName || user?.email || 'CP';
                      return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
                    })()}
                  </div>
                  <OnlineStatusDot />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold truncate text-sidebar-foreground leading-tight">
                    {user?.fullName || user?.email || 'Usuario'}
                  </p>
                  <span className="inline-block mt-1 bg-primary/10 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    {user?.role || 'costo'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className={cn("p-4 space-y-1", sidebarState === 'rail' && "p-2 items-center flex flex-col")}>
          {user?.plan === 'free' && user?.role !== 'admin' && sidebarState === 'expanded' && (
            <button
              onClick={() => {
                const whatsappNumber = "+53 53183215";
                const message = encodeURIComponent("Hola, me interesa obtener el Plan Pro de CostoPro para tener acceso ilimitado.");
                window.open(`https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${message}`, '_blank');
              }}
              aria-label="Mejorar a Plan Pro"
              className="w-full flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 bg-primary/10 text-primary border border-primary/20 font-black mb-2"
            >
              <Zap className="w-4.5 h-4.5 text-primary" />
              <div className="flex flex-col items-start">
                <span className="text-[10px] uppercase tracking-widest">Plan Gratuito</span>
                <span className="text-[8px] uppercase tracking-[0.2em] opacity-70">Subir a PRO</span>
              </div>
            </button>
          )}
          <div className={cn("flex items-center justify-between gap-2", sidebarState === 'rail' && "flex-col")}>
            <button
              onClick={onLogout}
              aria-label="Cerrar sesión"
              className={cn(
                "flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 hover:bg-danger/10 text-danger font-bold outline-none focus-visible:ring-2 focus-visible:ring-danger/50",
                sidebarState === 'expanded' ? "flex-1" : "w-12 h-12 justify-center"
              )}
            >
              <LogOut className="w-4.5 h-4.5" />
              {sidebarState === 'expanded' && <span className="text-xs uppercase tracking-wider">Salir</span>}
            </button>

            <button
              onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}
              aria-label="Abrir calculadora"
              aria-pressed={isCalculatorOpen}
              className={cn(
                "rounded-xl transition-all group active:scale-95 font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                sidebarState === 'expanded' ? "p-3.5" : "w-12 h-12 flex items-center justify-center",
                isCalculatorOpen
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "hover:bg-primary/5 text-sidebar-foreground/60"
              )}
            >
              <Calculator className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </div>
      </div>
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;
