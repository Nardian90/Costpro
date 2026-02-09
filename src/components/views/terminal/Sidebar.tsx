'use client';

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, LogOut, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import CostProLogo from '@/components/CostProLogo';
import { ViewType } from '@/store';
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
  onPrefetchView,
  onLogout,
  logoHeight,
  logoOpacity,
  logoScale,
  navRef
}: SidebarProps) => {
  const [expandedModules, setExpandedModules] = useState<string[]>([]);

  // Define information architecture
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
        items: ['dashboard']
      },
      {
        id: 'punto_venta',
        label: 'MÓDULO PUNTO DE VENTA',
        sublabel: 'Acciones de Caja',
        items: ['pos', 'sales', 'cash']
      },
      {
        id: 'operativa',
        label: 'MÓDULO GESTIÓN OPERATIVA',
        sublabel: 'Core de Costos',
        items: ['cost-sheets', 'ipv']
      },
      {
        id: 'almacen',
        label: 'MÓDULO ALMACÉN',
        sublabel: 'Logística e Inventario',
        items: ['catalog', 'inventory', 'recepcion', 'reception_list', 'transferencias', 'inventory_count', 'history']
      },
      {
        id: 'administracion',
        label: 'MÓDULO ADMINISTRACIÓN',
        sublabel: 'Configuración y Control',
        items: [
          'users',
          'roles',
          'stores',
          'reports',
          'audit',
          'settings',
          {
            id: 'comunicacion',
            label: 'Comunicación',
            isSubmenu: true,
            items: ['news', 'rss_management']
          }
        ]
      }
    ];
    return structure;
  }, []);

  // Intelligent active state: Expand parent if child is active
  useEffect(() => {
    const findParentModule = (viewId: string) => {
      for (const module of STRUCTURE) {
        if (module.items.some(item =>
          typeof item === 'string' ? item === viewId : item.items.includes(viewId)
        )) {
          return module.id;
        }
      }
      return null;
    };

    const parentId = findParentModule(currentView);
    if (parentId && !expandedModules.includes(parentId)) {
      setExpandedModules(prev => [...prev, parentId]);
    }

    // Also check for submenus
    for (const module of STRUCTURE) {
      for (const item of module.items) {
        if (typeof item !== 'string' && item.items.includes(currentView)) {
          if (!expandedModules.includes(item.id)) {
            setExpandedModules(prev => [...prev, item.id]);
          }
        }
      }
    }
  }, [currentView, STRUCTURE]);

  const toggleModule = (moduleId: string, isSubmenu = false) => {
    setExpandedModules(prev => {
      const isCurrentlyExpanded = prev.includes(moduleId);
      if (isCurrentlyExpanded) {
        return prev.filter(id => id !== moduleId);
      } else {
        if (isSubmenu) {
          return [...prev, moduleId];
        } else {
          // Accordion behavior for top-level modules
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
          "w-full flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 mb-1",
          isActive
            ? "bg-primary text-white shadow-lg shadow-primary/20 font-black"
            : "hover:bg-primary/5 text-sidebar-foreground/70 font-bold"
        )}
      >
        <item.icon className={cn("w-4.5 h-4.5", isActive ? "text-white" : "group-hover:text-primary transition-colors")} />
        <span className="text-[11px] uppercase tracking-wider">{item.label}</span>
      </button>
    );
  };

  const helpItem = navigationItems.find(i => i.id === 'help');

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
              // Check if any item in the module is available to the user
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
                      <div className="px-4 text-[10px] font-black text-primary/50 tracking-[0.3em] uppercase mb-2">
                        {module.label}
                      </div>
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
                          <span className="text-[10px] font-black tracking-[0.2em] uppercase">{module.label}</span>
                          {hasSublabel && (
                            <span className="text-[9px] font-medium opacity-60 uppercase tracking-tighter">{module.sublabel}</span>
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
                                  // Submenu (e.g., Comunicación)
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
                                          "w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all",
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
          {helpItem && renderNavItem(helpItem.id)}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 hover:bg-danger/10 text-danger font-bold"
          >
            <LogOut className="w-4.5 h-4.5" />
            <span className="text-[11px] uppercase tracking-wider">Salir</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
