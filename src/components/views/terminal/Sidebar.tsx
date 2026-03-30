'use client';

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, LogOut, Zap, ChevronDown, Calculator, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import CostProLogo from '@/components/CostProLogo';
import { ViewType, useUIStore, useAuthStore } from '@/store';
import { NavigationItem } from '@/hooks/ui/useTerminalNavigation';

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

export const Sidebar: React.FC<SidebarProps> = ({
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
  const { isCalculatorOpen, setIsCalculatorOpen } = useUIStore();
  const { user } = useAuthStore();
  const [expandedModules, setExpandedModules] = useState<string[]>(['estrategico']);

  const STRUCTURE = useMemo(() => {
    interface NavSubmenu {
      id: string;
      label: string;
      items: string[];
      isSubmenu?: boolean;
    }

    interface NavModule {
      id: string;
      label: string;
      sublabel?: string;
      isDirect?: boolean;
      items: (string | NavSubmenu)[];
    }

    const structure: NavModule[] = [
      {
        id: 'estrategico',
        label: 'MÓDULO ESTRATÉGICO',
        isDirect: true,
        items: ['dashboard', 'pick3-intelligence', 'wallet', 'cost-sheets', 'ipv']
      },
      {
        id: 'punto_venta',
        label: 'Punto de Venta',
        items: ['pos', 'sales', 'cash']
      },
      {
        id: 'almacen',
        label: 'Módulo almacén',
        items: ['catalog', 'inventory', 'recepcion', 'reception_list', 'transferencias', 'inventory_count', 'history', 'inventory_adjustments']
      },
      {
        id: 'administracion',
        label: 'Administración',
        items: [
          'users',
          'roles',
          'stores',
          'reports', 'health',
          'audit',
          'settings',
          {
            id: 'comunicacion',
            label: 'Comunicación',
            isSubmenu: true,
            items: ['news', 'rss_management']
          }
        ]
      },
      {
        id: 'legal_module',
        label: 'NORMATIVAS / LEGAL',
        isDirect: true,
        items: ['legal', 'help', 'wiki', 'academy']
      }
    ];
    return structure;
  }, []);

  useEffect(() => {
    const findParentModule = (viewId: string) => {
      for (const module of STRUCTURE) {
        if (module.items.some(item => {
          if (typeof item === 'string') return item === viewId;
          return item.items.includes(viewId);
        })) {
          return module.id;
        }
      }
      return null;
    };

    const parentId = findParentModule(currentView);
    if (parentId && !expandedModules.includes(parentId)) {
      setExpandedModules(prev => [...prev, parentId]);
    }
  }, [currentView, STRUCTURE]);

  const toggleModule = (moduleId: string, isSubmenu = false) => {
    setExpandedModules(prev => {
      if (prev.includes(moduleId)) {
        return prev.filter(id => id !== moduleId);
      } else {
        if (isSubmenu) {
          return [...prev, moduleId];
        } else {
          const topLevelIds = STRUCTURE.filter(m => !m.isDirect).map(m => m.id);
          const filtered = prev.filter(id => !topLevelIds.includes(id));
          return [...filtered, moduleId];
        }
      }
    });
  };

  const renderNavItem = (itemId: string) => {
    const item = navigationItems.find(i => i.id === itemId);
    if (!item) return null;

    const isActive = currentView === item.id;

    return (
      <button
        key={item.id}
        data-testid={`nav-${item.id}`}
        onClick={() => onViewChange(item.id as ViewType)}
        onMouseEnter={() => onPrefetchView?.(item.id as ViewType)}
        className={cn(
          "w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden",
          isActive
            ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-4px_rgba(var(--primary),0.3)]"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-primary/5"
        )}
      >
        <item.icon className={cn(
          "w-4.5 h-4.5 transition-transform duration-300 group-hover:scale-110",
          isActive ? "text-primary-foreground" : "text-muted-foreground/50 group-hover:text-primary"
        )} />
        <span className={cn(
          "text-[10px] font-black uppercase tracking-[0.2em] truncate transition-all duration-300",
          isActive ? "translate-x-1" : "group-hover:translate-x-1"
        )}>
          {item.label}
        </span>
        {isActive && (
          <motion.div
            layoutId="active-indicator"
            className="absolute left-0 w-1 h-6 bg-primary-foreground rounded-r-full"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
      </button>
    );
  };

  const navRefInternal = React.useRef<HTMLDivElement>(null);

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-40 bg-sidebar transition-all duration-300 ease-in-out border-r border-sidebar-border shadow-2xl overflow-hidden",
      sidebarOpen ? "w-64 lg:w-72 translate-x-0" : "w-0 -translate-x-full border-r-0"
    )}>
      <div className="relative bg-sidebar/90 backdrop-blur-2xl h-full flex flex-col overflow-hidden w-64 lg:w-72">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-50 p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all active:scale-95"
            aria-label="Cerrar menú"
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="BUSCAR..."
              className="w-full h-11 bg-background/50 border border-primary/10 rounded-xl pl-9 pr-4 text-xs font-black focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-[0.2em] placeholder:text-muted-foreground/30"
            />
          </div>
        </div>

        <nav
          id="sidebar-nav"
          ref={navRef}
          className="flex-1 overflow-y-auto p-4 no-scrollbar overscroll-contain scroll-smooth"
        >
          <div className="space-y-4">
            {STRUCTURE.map(module => {
              const hasAvailableItems = module.items.some(item => {
                if (typeof item === 'string') {
                  return navigationItems.some(ni => ni.id === item);
                } else {
                  return item.items.some(subItem => navigationItems.some(ni => ni.id === subItem));
                }
              });

              if (!hasAvailableItems) return null;

              const isExpanded = expandedModules.includes(module.id) || !!sidebarSearch;
              const hasSublabel = !!module.sublabel;

              return (
                <div key={module.id} className="space-y-1">
                  {module.isDirect ? (
                    <div className="space-y-2">
                      {module.label && (
                        <div className="px-4 flex flex-col items-start mb-2">
                          <span className="text-[10px] font-black text-primary/50 tracking-[0.3em] uppercase">{module.label}</span>
                          {module.sublabel && (
                            <span className="text-[9px] font-medium opacity-40 uppercase tracking-tighter mt-0.5">{module.sublabel}</span>
                          )}
                        </div>
                      )}
                      {module.items.map(itemId => typeof itemId === 'string' && renderNavItem(itemId))}
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => toggleModule(module.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all",
                          isExpanded ? "bg-primary/5 text-primary" : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                        )}
                      >
                        <div className="flex flex-col items-start">
                          <span className="text-xs font-black tracking-[0.2em] uppercase">{module.label}</span>
                          {hasSublabel && (
                            <span className="text-xs font-medium opacity-60 uppercase tracking-tighter">{module.sublabel}</span>
                          )}
                        </div>
                        <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isExpanded && "rotate-180")} />
                      </button>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="overflow-hidden pl-2"
                          >
                            <div className="pt-1 pb-2 space-y-1">
                              {module.items.map((item, idx) => {
                                if (typeof item === 'string') {
                                  return renderNavItem(item);
                                } else {
                                  const isSubExpanded = expandedModules.includes(item.id) || !!sidebarSearch;
                                  const hasAvailableSubItems = item.items.some(subItem =>
                                    navigationItems.some(ni => ni.id === subItem)
                                  );
                                  if (!hasAvailableSubItems) return null;

                                  return (
                                    <div key={item.id} className="mt-1">
                                      <button
                                        onClick={() => toggleModule(item.id, true)}
                                        className={cn(
                                          "w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-xs font-black tracking-widest uppercase transition-all",
                                          isSubExpanded ? "text-primary" : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
                                        )}
                                      >
                                        <span>{item.label}</span>
                                        <ChevronDown className={cn("w-3 h-3 transition-transform", isSubExpanded && "rotate-180")} />
                                      </button>
                                      <AnimatePresence initial={false}>
                                        {isSubExpanded && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden pl-4"
                                          >
                                            <div className="pt-1 space-y-1">
                                              {item.items.map(subId => renderNavItem(subId))}
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                }
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </div>
              );
            })}
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
            className={cn(
              "w-full flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 font-bold",
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
            className="w-full flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 hover:bg-danger/10 text-danger font-bold"
          >
            <LogOut className="w-4.5 h-4.5" />
            <span className="text-xs uppercase tracking-wider">Salir</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
