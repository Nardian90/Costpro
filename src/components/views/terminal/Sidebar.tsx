'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
  ChevronDown,
  LogOut,
  X,
  Search,
  Zap,
  Calculator,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore, useAuthStore, ViewType } from '@/store';
import { useFilteredNavigation } from '@/hooks/ui/useFilteredNavigation';
import { SIDEBAR_STRUCTURE, NavModule } from '@/config/navigation/sidebar.structure';
import { SidebarFocusMode } from './SidebarFocusMode';

interface SidebarProps {
  onClose?: () => void;
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
  onPrefetchView?: (view: ViewType) => void;
}

const OnlineStatusDot = () => {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className={cn(
      "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar shadow-sm transition-colors duration-500",
      isOnline ? "bg-green-500" : "bg-red-500"
    )} />
  );
};

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  onClose,
  onViewChange,
  onLogout,
  onPrefetchView
}) => {
  const {
    sidebarOpen,
    currentView,
    ipvActiveTab,
    setIpvActiveTab,
    isCalculatorOpen,
    setIsCalculatorOpen,
    activeCostSection,
    setActiveCostSection
  } = useUIStore();
  const { user } = useAuthStore();
  const navigationItems = useFilteredNavigation();

  const [expandedModules, setExpandedModules] = useState<string[]>(['costos', 'tienda']);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [focusedModuleId, setFocusedModuleId] = useState<string | null>(null);

  const navRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Scroll animations for logo
  const { scrollYProgress } = useScroll({
    container: navRef
  });

  const logoHeight = useTransform(scrollYProgress, [0, 0.05], [80, 0]);
  const logoOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);
  const logoScale = useTransform(scrollYProgress, [0, 0.05], [1, 0.8]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && sidebarSearch) {
        setSidebarSearch('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarSearch]);

  const toggleModule = useCallback((moduleId: string, isSubmenu: boolean) => {
    if (isSubmenu) {
      setExpandedModules(prev =>
        prev.includes(moduleId)
          ? prev.filter(id => id !== moduleId)
          : [...prev, moduleId]
      );
    } else {
      setFocusedModuleId(moduleId);
    }
  }, []);

  const filteredNavigation = useMemo(() => {
    if (!sidebarSearch) return navigationItems;

    const searchLower = sidebarSearch.toLowerCase();
    const filterRec = (modules: NavModule[]): NavModule[] => {
      return modules.reduce((acc: NavModule[], mod) => {
        const matches = mod.label.toLowerCase().includes(searchLower);
        const filteredChildren = mod.children ? filterRec(mod.children) : [];

        if (matches || filteredChildren.length > 0) {
          acc.push({
            ...mod,
            children: filteredChildren.length > 0 ? filteredChildren : mod.children
          });
        }
        return acc;
      }, []);
    };

    return filterRec(navigationItems);
  }, [navigationItems, sidebarSearch]);

  const renderNavItem = useCallback((itemId: string) => {
    const item = SIDEBAR_STRUCTURE.flatMap(m => [m, ...(m.children || [])])
      .flatMap(m => [m, ...(m.children || [])])
      .find(m => m.id === itemId);

    if (!item || !item.icon) return null;

    const isIpvSubItem = SIDEBAR_STRUCTURE.find(m => m.id === 'ipv_module')?.children?.some(c =>
      c.id === item.id || c.children?.some(gc => gc.id === item.id)
    );

    const isCostSheetSubItem = [
      'templates', 'header', 'open-sections', 'open-annexes',
      'signature', 'expert-content', 'view-kpis', 'view-expert',
      'view-assisted', 'view-reading', 'gen-quick', 'gen-expert',
      'tool-import', 'tool-save', 'tool-export-excel', 'tool-export-pdf',
      'res-help', 'res-system-help', 'res-academy'
    ].includes(item.id);

    const isActive = (currentView === item.id) ||
                     (item.id === 'cost-sheets' && currentView === 'cost-sheets' && !isCostSheetSubItem) ||
                     (isCostSheetSubItem && currentView === 'cost-sheets' && activeCostSection === item.id) ||
                     (isIpvSubItem && currentView === 'ipv' && (
                        ipvActiveTab === item.id ||
                        (item.id === 'reports_ipv' && ipvActiveTab === 'reports') ||
                        (item.id === 'dashboard_ipv' && ipvActiveTab === 'dashboard') ||
                        (item.id === 'catalog_ipv' && ipvActiveTab === 'catalog') ||
                        (item.id === 'audit_ipv' && ipvActiveTab === 'audit') ||
                        (item.id === 'receipts' && ipvActiveTab === 'receipts') ||
                        (item.id === 'intelligent-receipts' && ipvActiveTab === 'intelligent-receipts') ||
                        (item.id === 'transfers' && ipvActiveTab === 'transfers') ||
                        (item.id === 'qr' && ipvActiveTab === 'qr') ||
                        (item.id === 'ingestion' && ipvActiveTab === 'ingestion') ||
                        (item.id === 'pivot' && ipvActiveTab === 'pivot') ||
                        (item.id === 'rules' && ipvActiveTab === 'rules') ||
                        (item.id === 'sim' && ipvActiveTab === 'sim') ||
                        (item.id === 'breakdown' && ipvActiveTab === 'breakdown') ||
                        (item.id === 'planning' && ipvActiveTab === 'planning') ||
                        (item.id === 'errors' && ipvActiveTab === 'errors') ||
                        (item.id === 'mapping-rules' && ipvActiveTab === 'mapping-rules') ||
                        (item.id === 'mvt' && ipvActiveTab === 'mvt') ||
                        (item.id === 'mipyme' && ipvActiveTab === 'mipyme') ||
                        (item.id === 'customers' && ipvActiveTab === 'customers') ||
                        (item.id === 'movements' && ipvActiveTab === 'movements')
                     ));

    const handleItemClick = () => {
      if (item.id === 'cost-sheets' || isCostSheetSubItem) {
        onViewChange('cost-sheets');
        if (isCostSheetSubItem) {
          setActiveCostSection(item.id);
        }
      } else if (isIpvSubItem) {
        onViewChange('ipv');
        const tabId = item.id === 'reports_ipv' ? 'reports' :
                      item.id === 'dashboard_ipv' ? 'dashboard' :
                      item.id === 'catalog_ipv' ? 'catalog' :
                      item.id === 'audit_ipv' ? 'audit' :
                      item.id === 'receipts' ? 'receipts' :
                      item.id === 'intelligent-receipts' ? 'intelligent-receipts' :
                      item.id === 'transfers' ? 'transfers' :
                      item.id === 'qr' ? 'qr' :
                      item.id === 'ingestion' ? 'ingestion' :
                      item.id === 'pivot' ? 'pivot' :
                      item.id === 'rules' ? 'rules' :
                      item.id === 'sim' ? 'sim' :
                      item.id === 'breakdown' ? 'breakdown' :
                      item.id === 'planning' ? 'planning' :
                      item.id === 'errors' ? 'errors' :
                      item.id === 'mapping-rules' ? 'mapping-rules' :
                      item.id === 'mvt' ? 'mvt' :
                      item.id === 'mipyme' ? 'mipyme' :
                      item.id === 'customers' ? 'customers' :
                      item.id === 'movements' ? 'movements' : item.id;
        setIpvActiveTab(tabId);
      } else {
        onViewChange(item.id as ViewType);
      }
    };

    return (
      <button
        key={item.id}
        role="menuitem"
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
        data-testid={`nav-${item.id}`}
        onClick={handleItemClick}
        onMouseEnter={() => onPrefetchView?.((isIpvSubItem ? 'ipv' : item.id) as ViewType)}
        className={cn(
          "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          isActive
            ? "bg-primary text-primary-foreground shadow-lg shadow-[0_0_12px_rgba(34,197,94,0.15)]"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-primary/5"
        )}
      >
        <item.icon className={cn(
          "w-4 h-4 transition-transform duration-200 group-hover:scale-110",
          isActive ? "text-primary-foreground" : "text-muted-foreground/50 group-hover:text-primary"
        )} />
        <span className={cn(
          "text-[10px] sm:text-[11px] lg:text-xs font-black uppercase tracking-[0.2em] truncate",
          isActive ? "translate-x-1" : "group-hover:translate-x-1"
        )}>
          {item.label}
        </span>
        {isActive && (
          <motion.div
            layoutId="active-indicator"
            className="absolute left-0 w-1 h-5 bg-primary-foreground rounded-r-full"
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
          />
        )}
      </button>
    );
  }, [currentView, ipvActiveTab, onViewChange, onPrefetchView, setIpvActiveTab, activeCostSection, setActiveCostSection]);

  const renderModule = useCallback(function renderModuleInner(mod: NavModule, depth = 0): React.ReactNode {
    const hasAvailableItems = (m: NavModule): boolean => {
      if (m.type === 'item') {
        return navigationItems.some(ni => ni.id === m.id);
      }
      return m.children?.some(child => hasAvailableItems(child)) || false;
    };

    if (!hasAvailableItems(mod)) return null;

    if (mod.type === 'item') {
      return renderNavItem(mod.id);
    }

    const isExpanded = expandedModules.includes(mod.id) || !!sidebarSearch;

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
          <div className="flex items-center gap-2">
            {mod.children && mod.children.length > 0 && (
              <span className="bg-primary/10 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {mod.children.length}
              </span>
            )}
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", isExpanded && "rotate-180")} />
          </div>
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
                {mod.children?.map(child => renderModuleInner(child, depth + 1))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }, [expandedModules, sidebarSearch, navigationItems, toggleModule, renderNavItem]);

  const focusedModule = useMemo(() =>
    SIDEBAR_STRUCTURE.find(m => m.id === focusedModuleId),
  [focusedModuleId]);

  return (
    <aside
      role="navigation"
      aria-label="Barra lateral de navegación"
      className={cn(
        "fixed inset-y-0 left-0 z-40 bg-sidebar transition-all duration-300 ease-in-out border-r border-sidebar-border shadow-2xl overflow-hidden enhanced-sidebar-edge",
        sidebarOpen ? "w-64 lg:w-72 translate-x-0" : "w-0 -translate-x-full border-r-0"
      )}
    >
      <div className="relative bg-sidebar/90 backdrop-blur-2xl h-full flex flex-col overflow-hidden w-64 lg:w-72">
        {/* Gradient accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] z-50 overflow-hidden">
          <div className="h-full w-full bg-gradient-to-r from-primary/0 via-primary to-primary/0 animate-gradient-shift" style={{ backgroundSize: '200% 100%' }} />
        </div>

        <motion.div
          id="sidebar-logo-container"
          style={{
            height: logoHeight,
            opacity: logoOpacity,
            overflowX: 'auto'
          }}
          className="shrink-0 no-scrollbar max-w-full overflow-x-hidden"
        >
          <motion.div
            style={{ scale: logoScale }}
            className="px-4 pt-4 pb-2 flex items-center justify-between"
          >
            <h2 className="text-foreground font-black text-lg uppercase tracking-tighter leading-none">
              COST<span className="text-green-500 dark:text-green-400">PRO</span>
            </h2>
            {onClose && !focusedModuleId && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label="Cerrar menú lateral"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </motion.div>

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
                className="w-full h-9 bg-background/50 border border-primary/10 rounded-xl pl-9 pr-16 sm:pr-16 pr-4 text-xs font-black focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-[0.2em] placeholder:text-muted-foreground/30"
              />
              {/* ⌘K keyboard shortcut badge - desktop only */}
              <kbd className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center bg-muted text-muted-foreground text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none select-none">
                ⌘K
              </kbd>
            </div>
          </div>
        </motion.div>

        <nav
          id="sidebar-nav"
          ref={navRef}
          role="menubar"
          aria-orientation="vertical"
          className="flex-1 overflow-y-auto pt-0 px-3 pb-4 sm:pb-4 no-scrollbar overscroll-contain scroll-smooth"
        >
          <AnimatePresence mode="wait">
            {focusedModuleId && focusedModule ? (
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
                className="space-y-1 sm:space-y-4"
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
          {user && (
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-primary-foreground text-xs font-black uppercase">
                    {(() => {
                      const name = user?.fullName || user?.email || 'CP';
                      return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
                    })()}
                  </div>
                  {/* FIX #023: Online indicator reflects real network state */}
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

          <div className="p-4 space-y-1">
          {user?.plan === 'free' && user?.role !== 'admin' && (
            <button
              onClick={() => {
                const whatsappNumber = "+53 53183215";
                const message = encodeURIComponent("Hola, me interesa obtener el Plan Pro de CostoPro para tener acceso ilimitado.");
                window.open(`https://wa.me/${whatsappNumber.replace(/\\D/g, '')}?text=${message}`, '_blank');
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
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={onLogout}
              aria-label="Cerrar sesión"
              className="flex-1 flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 hover:bg-danger/10 text-danger font-bold outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
            >
              <LogOut className="w-4.5 h-4.5" />
              <span className="text-xs uppercase tracking-wider">Salir</span>
            </button>

            <button
              onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}
              aria-label="Abrir calculadora"
              aria-pressed={isCalculatorOpen}
              className={cn(
                "p-3.5 rounded-xl transition-all group active:scale-95 font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
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
