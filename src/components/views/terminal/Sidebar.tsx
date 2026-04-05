'use client';

import * as React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, LogOut, Zap, ChevronDown, Calculator, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import CostProLogo from '@/components/CostProLogo';
import { ViewType, useUIStore, useAuthStore } from '@/store';
import { NavigationItem } from '@/hooks/ui/useTerminalNavigation';
import { SIDEBAR_STRUCTURE, NavModule } from '@/config/navigation/sidebar.structure';

interface SidebarProps {
  sidebarOpen: boolean;
  sidebarSearch: string;
  setSidebarSearch: (val: string) => void;
  navigationItems: NavigationItem[];
  currentView: string;
  onViewChange: (view: ViewType) => void;
  onPrefetchView?: (view: ViewType) => void;
  onLogout: () => void;
  onClose?: () => void;
  logoHeight: any;
  logoOpacity: any;
  logoScale: any;
  navRef: any;
}

const STORAGE_KEY = 'costpro.sidebar.state';

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  sidebarOpen,
  sidebarSearch,
  setSidebarSearch,
  navigationItems,
  currentView,
  onViewChange,
  onPrefetchView,
  onLogout,
  onClose,
  logoHeight,
  logoOpacity,
  logoScale,
  navRef
}) => {
  const { isCalculatorOpen, setIsCalculatorOpen, setIpvActiveTab, ipvActiveTab } = useUIStore();
  const { user } = useAuthStore();

  // Persistence logic with error handling
  const [expandedModules, setExpandedModules] = useState<string[]>(() => {
    if (typeof window === 'undefined') return ['estrategico', 'ipv_module'];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed.expanded) ? parsed.expanded : ['estrategico', 'ipv_module'];
      }
    } catch (e) {
      console.warn('Sidebar state load failed, using defaults', e);
    }
    return ['estrategico', 'ipv_module'];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ expanded: expandedModules }));
  }, [expandedModules]);

  // Accessibility: Handle keyboard ESC to close sidebar if open
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [sidebarOpen, onClose]);

  // Deep search for parents to expand when view changes
  useEffect(() => {
    const findParents = (modules: NavModule[], targetId: string, parents: string[] = []): string[] | null => {
      for (const module of modules) {
        if (module.id === targetId) return parents;
        if (module.children) {
          const result = findParents(module.children, targetId, [...parents, module.id]);
          if (result) return result;
        }
      }
      return null;
    };

    const effectiveViewId = currentView === 'ipv' ? ipvActiveTab : currentView;
    const mappedViewId = ipvActiveTab ?
        (ipvActiveTab === 'reports' ? 'reports_ipv' :
         ipvActiveTab === 'dashboard' ? 'dashboard_ipv' :
         ipvActiveTab === 'catalog' ? 'catalog_ipv' :
         ipvActiveTab === 'audit' ? 'audit_ipv' : ipvActiveTab) : currentView;

    const parents = findParents(SIDEBAR_STRUCTURE, mappedViewId);
    if (parents) {
      setExpandedModules(prev => {
        const newExpanded = [...prev];
        let changed = false;
        parents.forEach(p => {
          if (!newExpanded.includes(p)) {
            newExpanded.push(p);
            changed = true;
          }
        });
        return changed ? newExpanded : prev;
      });
    }
  }, [currentView, ipvActiveTab]);

  const toggleModule = useCallback((moduleId: string, isSubmenu = false) => {
    setExpandedModules(prev => {
      if (prev.includes(moduleId)) {
        return prev.filter(id => id !== moduleId);
      } else {
        if (isSubmenu) {
          return [...prev, moduleId];
        } else {
          // UX: Accordion behavior for Level 1 groups
          const topLevelIds = SIDEBAR_STRUCTURE.filter(m => !m.isDirect).map(m => m.id);
          const filtered = prev.filter(id => !topLevelIds.includes(id));
          return [...filtered, moduleId];
        }
      }
    });
  }, []);

  const renderNavItem = useCallback((moduleId: string) => {
    const isIpvSubItem = [
        'analytics', 'reports_ipv', 'receipts', 'transfers', 'qr', 'ingestion', 'pivot',
        'dashboard_ipv', 'transactions', 'catalog_ipv', 'customers',
        'rules', 'sim', 'intelligent-receipts', 'breakdown',
        'audit_ipv', 'movements', 'planning', 'errors', 'mapping-rules', 'mvt', 'mipyme'
    ].includes(moduleId);

    const item = navigationItems.find(i => i.id === moduleId);
    if (!item) return null;

    const effectiveItemId = isIpvSubItem ? moduleId.replace('_ipv', '').replace('reports_ipv', 'reports').replace('dashboard_ipv', 'dashboard').replace('catalog_ipv', 'catalog').replace('audit_ipv', 'audit') : moduleId;

    const isActive = isIpvSubItem
        ? (currentView === 'ipv' && ipvActiveTab === effectiveItemId)
        : currentView === item.id;

    const handleItemClick = () => {
        if (isIpvSubItem) {
            setIpvActiveTab(effectiveItemId);
            onViewChange('ipv');
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
            ? "bg-primary text-primary-foreground shadow-lg"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-primary/5"
        )}
      >
        <item.icon className={cn(
          "w-4 h-4 transition-transform duration-200 group-hover:scale-110",
          isActive ? "text-primary-foreground" : "text-muted-foreground/50 group-hover:text-primary"
        )} />
        <span className={cn(
          "text-[10px] font-black uppercase tracking-[0.2em] truncate",
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
  }, [currentView, ipvActiveTab, navigationItems, onViewChange, onPrefetchView, setIpvActiveTab]);

  const renderModule = useCallback((module: NavModule, depth = 0): React.ReactNode => {
    // Feature Flag validation (future-ready)
    if (module.featureFlag && !(window as any).CONFIG?.features?.[module.featureFlag]) {
       // Support for hidden features
    }

    const hasAvailableItems = (m: NavModule): boolean => {
      if (m.type === 'item') {
        return navigationItems.some(ni => ni.id === m.id);
      }
      return m.children?.some(child => hasAvailableItems(child)) || false;
    };

    if (!hasAvailableItems(module)) return null;

    if (module.type === 'item') {
      return renderNavItem(module.id);
    }

    const isExpanded = expandedModules.includes(module.id) || !!sidebarSearch;

    if (module.type === 'group' && module.isDirect) {
      return (
        <div key={module.id} className="space-y-1" role="group" aria-label={module.ariaLabel}>
          {module.label && (
            <div className="px-4 flex flex-col items-start mb-2 mt-6 first:mt-0">
              <span className="text-[10px] font-black text-primary/40 tracking-[0.4em] uppercase">{module.label}</span>
            </div>
          )}
          <div className="space-y-1">
            {module.children?.map(child => renderModule(child, depth + 1))}
          </div>
        </div>
      );
    }

    return (
      <div key={module.id} className="space-y-1" role="none">
        <button
          role="menuitem"
          aria-expanded={isExpanded}
          aria-haspopup="true"
          aria-label={module.ariaLabel || module.label}
          onClick={() => toggleModule(module.id, module.type === 'submenu')}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            depth === 0 ? "mt-3" : "mt-1",
            isExpanded ? "bg-primary/5 text-primary" : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
          )}
        >
          <div className="flex items-center gap-3">
             {module.icon && <module.icon className="w-4 h-4 opacity-50" />}
             <span className={cn(
                "font-black tracking-[0.2em] uppercase",
                depth === 0 ? "text-xs" : "text-[11px] opacity-80"
             )}>{module.label}</span>
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
                {module.children?.map(child => renderModule(child, depth + 1))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }, [expandedModules, sidebarSearch, navigationItems, toggleModule, renderNavItem]);

  return (
    <aside
      role="navigation"
      aria-label="Barra lateral de navegación"
      className={cn(
        "fixed inset-y-0 left-0 z-40 bg-sidebar transition-all duration-300 ease-in-out border-r border-sidebar-border shadow-2xl overflow-hidden",
        sidebarOpen ? "w-64 lg:w-72 translate-x-0" : "w-0 -translate-x-full border-r-0"
      )}
    >
      <div className="relative bg-sidebar/90 backdrop-blur-2xl h-full flex flex-col overflow-hidden w-64 lg:w-72">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-50 p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Cerrar menú lateral"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <motion.div
          id="sidebar-logo-container"
          style={{
            height: logoHeight,
            opacity: logoOpacity,
            overflowX: 'auto'
          }}
          className="border-b border-sidebar-border/50 shrink-0 bg-sidebar/5 no-scrollbar max-w-full overflow-x-hidden"
        >
          <motion.div
            style={{ scale: logoScale }}
            className="px-4 py-8 sm:p-8 h-[160px] flex flex-col justify-center"
          >
            <CostProLogo size={50} animated={true} />
            <div className="mt-4">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Terminal Operativa</div>
            </div>
          </motion.div>
        </motion.div>

        <div className="px-6 py-4 shrink-0 border-b border-sidebar-border/30 bg-sidebar/5">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" aria-hidden="true" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              aria-label="Buscar en el menú"
              placeholder="BUSCAR..."
              className="w-full h-11 bg-background/50 border border-primary/10 rounded-xl pl-9 pr-4 text-xs font-black focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-[0.2em] placeholder:text-muted-foreground/30"
            />
          </div>
        </div>

        <nav
          id="sidebar-nav"
          ref={navRef}
          role="menubar"
          aria-orientation="vertical"
          className="flex-1 overflow-y-auto p-4 no-scrollbar overscroll-contain scroll-smooth"
        >
          <div className="space-y-4">
            {SIDEBAR_STRUCTURE.map(module => renderModule(module))}
          </div>
        </nav>

        <div className="p-4 border-t border-sidebar-border/50 shrink-0 space-y-1">
          {user?.plan === 'free' && user?.role !== 'admin' && (
            <button
              onClick={() => {
                const whatsappNumber = "+5353183215";
                const message = encodeURIComponent("Hola, me interesa obtener el Plan Pro de CostoPro para tener acceso ilimitado.");
                window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
              }}
              aria-label="Mejorar a Plan Pro"
              className="w-full flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 bg-primary/10 text-primary border border-primary/20 font-black mb-2 animate-pulse"
            >
              <Zap className="w-4.5 h-4.5 text-primary" />
              <div className="flex flex-col items-start">
                <span className="text-[10px] uppercase tracking-widest">Plan Gratuito</span>
                <span className="text-[8px] uppercase tracking-[0.2em] opacity-70">Subir a PRO</span>
              </div>
            </button>
          )}
          <button
            onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}
            aria-label="Abrir calculadora"
            aria-pressed={isCalculatorOpen}
            className={cn(
              "w-full flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              isCalculatorOpen
                ? "bg-primary/10 text-primary border border-primary/20"
                : "hover:bg-primary/5 text-sidebar-foreground/60"
            )}
          >
            <Calculator className="w-4.5 h-4.5" />
            <span className="text-xs uppercase tracking-wider">Calculadora</span>
          </button>

          <button
            onClick={onLogout}
            aria-label="Cerrar sesión"
            className="w-full flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 hover:bg-danger/10 text-danger font-bold outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
          >
            <LogOut className="w-4.5 h-4.5" />
            <span className="text-xs uppercase tracking-wider">Salir</span>
          </button>
        </div>
      </div>
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';
