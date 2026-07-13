'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  X,
  Search,
  ChevronDown,
  LogOut,
  Zap,
  Calculator,
  Pin,
  PinOff,
  Bot,
  User,
  Settings,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuthStore, useUIStore, ViewType } from '@/store';
import { NavModule, SIDEBAR_STRUCTURE } from '@/config/navigation/sidebar.structure';
import { isSidebarItemActive } from '@/config/navigation/navigation-map';
import { useFilteredNavigation } from '@/hooks/ui/useFilteredNavigation';
import { useAdaptiveNav } from '@/hooks/ui/useAdaptiveNav';
import { usePinnedNav } from '@/hooks/ui/usePinnedNav';
import { cn } from '@/lib/utils';
import OnlineStatusDot from '@/components/shared/OnlineStatusDot';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
  onClose: () => void;
  onPrefetchView: (view: ViewType) => void;
}

// Root module IDs (depth=0) — these trigger focus mode
const ROOT_MODULE_IDS = new Set(SIDEBAR_STRUCTURE.map(m => m.id));
// "core" is Escritorio — special behavior
const CORE_MODULE_ID = 'core';

const Sidebar = React.memo(({ onViewChange, onLogout, onClose, onPrefetchView }: SidebarProps) => {
  const prefersReducedMotion = useReducedMotion();
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
    setActiveCostSection,
    setCurrentView,
  } = useUIStore();
  const isMobile = useIsMobile();
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const [focusModuleId, setFocusModuleId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // E-1 (IA Audit): IA adaptativa — reordena items del sidebar por frecuencia de uso.
  // Solo reordena hijos dentro de submenus expandidos; el orden de grupos raíz se preserva.
  const { getReorderedChildren } = useAdaptiveNav(user?.id, currentView);

  // E-2 (IA Audit): personalización — usuarios pueden fijar accesos rápidos.
  // Los items fijados aparecen en una sección "FIJADOS" al inicio del nav.
  const { pinned, togglePin, isPinned } = usePinnedNav(user?.id);

  // E-2: construir lista de items fijados con sus metadatos del sidebar.
  // Busca cada view fijado en SIDEBAR_STRUCTURE para obtener label + icon.
  const pinnedItems = useMemo<NavModule[]>(() => {
    if (pinned.length === 0) return [];
    const found: NavModule[] = [];
    for (const viewId of pinned) {
      for (const group of SIDEBAR_STRUCTURE) {
        for (const child of group.children || []) {
          if (child.id === viewId) {
            found.push(child);
            break;
          }
          for (const grandchild of child.children || []) {
            if (grandchild.id === viewId) {
              found.push(grandchild);
              break;
            }
          }
        }
      }
    }
    return found;
  }, [pinned]);

  const allNavigation = useFilteredNavigation();
  const filteredNavigation = useMemo(() => {
    if (!sidebarSearch) return allNavigation;
    const searchLower = sidebarSearch.toLowerCase();
    return allNavigation.filter(mod =>
      mod.label.toLowerCase().includes(searchLower) ||
      mod.children?.some(child => child.label.toLowerCase().includes(searchLower))
    );
  }, [allNavigation, sidebarSearch]);

  // ── Focus mode: enter ──
  const enterFocusMode = useCallback((moduleId: string) => {
    setSidebarState('expanded');
    setFocusModuleId(moduleId);
    // FIX: Do NOT auto-expand children — let the user expand manually
    setExpandedModules([]);
    // Close sidebar on mobile after entering focus
    if (isMobile) onClose();
  }, [setSidebarState, isMobile, onClose]);

  // ── Focus mode: exit ──
  const exitFocusMode = useCallback(() => {
    setFocusModuleId(null);
    setExpandedModules([]);
  }, []);

  // ── Toggle a submenu (inside focus mode or normal) — does NOT affect focus ──
  const toggleSubmenu = useCallback((id: string) => {
    setExpandedModules(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  // ── Click on a root module header ──
  // F3 + GAP-3: Al clickear un módulo raíz, navegar a la vista por defecto.
  // Mapeo completo de todos los grupos del sidebar.
  const MODULE_DEFAULT_VIEW: Record<string, ViewType> = {
    // FIX-DEFAULT-VIEW (2026-07-13): 'core_chat' eliminado — el grupo ASISTENTE
    // fue removido y Chat ahora es un item directo dentro de ESCRITORIO (core).
    'core_tools': 'calculator',
    'core': 'occ',
    'costos': 'cost-sheets',
    // FIX-GESTION-UNIFICADA (2026-07-13): MULTI-TIENDA ahora aterriza en el hub
    // de Gestión (que tiene tabs Noticias/Vitrina/Tiendas) en lugar de 'stores'
    // directo. 'stores' sigue siendo una vista válida accesible desde el tab.
    'tienda': 'management-hub',
    'ipv_module': 'ipv',
    'otros': 'pick3-intelligence',
    'administracion': 'users',
    'recursos': 'settings',
  };
  const handleRootModuleClick = useCallback((mod: NavModule) => {
    if (mod.id === CORE_MODULE_ID) {
      // Escritorio → exit focus + navigate to home
      exitFocusMode();
      setCurrentView('occ');
      onViewChange('occ');
      if (isMobile) onClose();
      return;
    }
    // FIX-DEFAULT-VIEW (2026-07-13): el caso especial 'core_chat' fue eliminado.
    // El grupo ASISTENTE ya no existe — Chat es ahora un item directo dentro de
    // ESCRITORIO y se navega como cualquier otro item (handleItemClick).
    // FIX-CALC-VIEW (2026-07-10): HERRAMIENTAS (core_tools) es acceso directo
    // a la vista de calculadora integrada.
    if (mod.id === 'core_tools') {
      setCurrentView('calculator');
      onViewChange('calculator');
      if (isMobile) onClose();
      return;
    }
    // If already in focus for this module → exit focus
    if (focusModuleId === mod.id) {
      exitFocusMode();
      return;
    }
    // Enter focus mode for this module
    enterFocusMode(mod.id);
    // F3: Navegar a la vista por defecto del módulo si existe.
    // Esto asegura que el usuario vea contenido del módulo, no "Centro de Comando".
    const defaultView = MODULE_DEFAULT_VIEW[mod.id];
    if (defaultView) {
      onViewChange(defaultView);
    }
  }, [exitFocusMode, enterFocusMode, focusModuleId, setCurrentView, onViewChange, isMobile, onClose]);

  // ── Click on a nav item (leaf) ──
  const handleNavClick = useCallback((view: ViewType) => {
    onViewChange(view);
    if (isMobile) onClose();
  }, [onViewChange, isMobile, onClose]);

  // ── In rail mode, expand sidebar on module click ──
  const handleRailModuleClick = useCallback((mod: NavModule) => {
    setSidebarState('expanded');
    if (mod.id === CORE_MODULE_ID) {
      exitFocusMode();
      setCurrentView('occ');
      onViewChange('occ');
    } else {
      enterFocusMode(mod.id);
      // F3: Navegar a vista por defecto del módulo también en rail mode.
      const defaultView = MODULE_DEFAULT_VIEW[mod.id];
      if (defaultView) {
        onViewChange(defaultView);
      }
    }
  }, [setSidebarState, exitFocusMode, enterFocusMode, setCurrentView, onViewChange]);

  // ── Render a leaf nav item ──
  const renderNavItem = useCallback((item: any, depth = 0) => {
    const isActive = isSidebarItemActive(item.id, currentView, ipvActiveTab, activeCostSection);
    const isRail = sidebarState === 'rail';

    if (isRail && depth === 0) {
      return (
        <TooltipProvider key={item.id} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleNavClick(item.id as ViewType)}
                onMouseEnter={() => onPrefetchView(item.id as ViewType)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "w-12 h-12 flex items-center justify-center rounded-xl transition-all active:scale-95 mx-auto mb-2",
                  isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-sidebar-foreground/80 hover:bg-primary/10 hover:text-primary"
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
      <div key={item.id} className="relative group/nav-item">
        <button
          onClick={() => handleNavClick(item.id as ViewType)}
          onMouseEnter={() => onPrefetchView(item.id as ViewType)}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            isActive ? "bg-primary/15 text-primary font-black shadow-md shadow-primary/20 ring-1 ring-primary/25" : "text-sidebar-foreground/80 hover:bg-primary/5 hover:text-sidebar-foreground"
          )}
        >
          {item.icon && <item.icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", isActive ? "text-primary" : "opacity-80")} />}
          <span className="text-xs uppercase tracking-wider truncate flex-1 text-left">{item.label}</span>
          {isActive && (
            <motion.div layoutId="active-nav-indicator" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>
        {/* E-2 (IA Audit): botón pin/desfijar visible al hover.
            Permite al usuario fijar accesos rápidos en la sección "FIJADOS"
            al inicio del sidebar. Máximo 5 items fijados. */}
        {!isRail && sidebarState === 'expanded' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePin(item.id as ViewType);
            }}
            aria-label={isPinned(item.id as ViewType) ? `Desfijar ${item.label}` : `Fijar ${item.label}`}
            title={isPinned(item.id as ViewType) ? 'Desfijar acceso rápido' : 'Fijar como acceso rápido'}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center transition-all opacity-0 group-hover/nav-item:opacity-100 hover:bg-primary/10 outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isPinned(item.id as ViewType) && "opacity-100 text-primary",
            )}
          >
            {isPinned(item.id as ViewType) ? (
              <PinOff className="w-3 h-3" aria-hidden="true" />
            ) : (
              <Pin className="w-3 h-3" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    );
  }, [currentView, ipvActiveTab, activeCostSection, sidebarState, handleNavClick, onPrefetchView, isPinned, togglePin]);

  // ── Render a module (group or submenu) ──
  function renderModule(mod: NavModule, depth = 0): React.ReactNode {
    const isExpanded = expandedModules.includes(mod.id);
    const isRail = sidebarState === 'rail';
    const isRoot = depth === 0 && ROOT_MODULE_IDS.has(mod.id);

    // Leaf item
    if (mod.type === 'item') {
      return renderNavItem(mod, depth);
    }

    // Rail mode: icon button for root modules
    if (isRail && isRoot) {
      return (
        <TooltipProvider key={mod.id} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleRailModuleClick(mod)}
                aria-label={mod.label}
                aria-expanded={isExpanded}
                className={cn(
                  "w-12 h-12 flex items-center justify-center rounded-xl transition-all active:scale-95 mx-auto mb-2",
                  "text-sidebar-foreground/80 hover:bg-primary/10 hover:text-primary"
                )}
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

    // Root module in expanded mode → triggers focus mode on click
    if (isRoot) {
      const isCore = mod.id === CORE_MODULE_ID;
      const isFocused = focusModuleId === mod.id;
      // FIX-DEFAULT-VIEW (2026-07-13): isChatModule/isChatActive eliminados —
      // el grupo ASISTENTE (core_chat) ya no existe. Chat es ahora un item
      // normal dentro de ESCRITORIO.

      return (
        <div key={mod.id} className="relative">
          <button
            onClick={() => handleRootModuleClick(mod)}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.98]",
              depth === 0 && "sm:mt-3",
              "text-sidebar-foreground/80 hover:bg-primary/5 hover:text-sidebar-foreground"
            )}
          >
            <div className="flex items-center gap-3">
              {mod.icon && <mod.icon className="w-4 h-4 opacity-80" />}
              <span className={cn(
                "font-black tracking-[0.2em] uppercase",
                depth === 0 ? "text-xs" : "text-[11px] opacity-80"
              )}>{mod.label}</span>
            </div>
          </button>
        </div>
      );
    }

    // Submenu (inside a focused module) → toggle expand/collapse only
    return (
      <div key={mod.id} className="relative">
        <button
          aria-expanded={isExpanded}
          onClick={() => toggleSubmenu(mod.id)}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            "sm:mt-0.5",
            isExpanded ? "text-sidebar-foreground" : "text-sidebar-foreground/80 hover:text-sidebar-foreground"
          )}
        >
          <div className="flex items-center gap-3">
            {mod.icon && <mod.icon className="w-4 h-4 opacity-80" />}
            <span className="text-[11px] font-black tracking-[0.2em] uppercase opacity-80">{mod.label}</span>
          </div>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", isExpanded && "rotate-180")} />
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={prefersReducedMotion ? {} : { height: 'auto', opacity: 1 }}
              exit={prefersReducedMotion ? {} : { height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden pl-4"
              role="menu"
            >
              <div className="pt-1 pb-2 space-y-0.5">
                {/* E-1 (IA Audit): hijos reordenados por frecuencia de uso del rol.
                    El reordenamiento es estable: items con misma frecuencia conservan
                    su orden declarativo. Solo aplica si el usuario ya tiene historial
                    de navegación; para usuarios nuevos, el orden es el declarativo. */}
                {getReorderedChildren(mod.id, mod.children || []).map(child => renderModule(child, depth + 1))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Get the focused module object ──
  const focusedModule = useMemo(() =>
    SIDEBAR_STRUCTURE.find(m => m.id === focusModuleId),
  [focusModuleId]);

  // ── Check if current view belongs to a root module (for auto-focus) ──
  useEffect(() => {
    if (focusModuleId) return; // Don't override manual focus
    for (const mod of SIDEBAR_STRUCTURE) {
      if (mod.id === CORE_MODULE_ID) continue;
      if (hasViewInModule(mod, currentView)) {
        queueMicrotask(() => enterFocusMode(mod.id));
        return;
      }
    }
  }, []); // Only on mount

  const sidebarWidthClass = useMemo(() => {
    switch (sidebarState) {
      case 'expanded': return "w-64 lg:w-72 translate-x-0";
      case 'rail': return "w-20 translate-x-0";
      case 'closed': return "w-0 -translate-x-full border-r-0";
    }
  }, [sidebarState]);

  // Focus first interactive element when sidebar opens on mobile
  useEffect(() => {
    if (sidebarState === 'expanded' && isMobile) {
      const timer = setTimeout(() => {
        const sidebar = document.querySelector('[data-sidebar]');
        if (sidebar) {
          const firstButton = sidebar.querySelector('button, a, [tabindex]');
          (firstButton as HTMLElement)?.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [sidebarState, isMobile]);

  return (
    <aside
      role="navigation"
      aria-label="Barra lateral de navegación"
      data-sidebar
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
              // QW-5 (IA Audit): clic en el logo lleva al hub de Venta (sales-hub)
              // en lugar de ser decorativo. Es el acceso 1-clic más universal al
              // workflow principal del usuario (vender). Mismo patrón que Shopify
              // admin (clic en logo → home del admin). El usuario ya tiene el
              // sidebar abierto; el logo es el target más predecible.
              <button
                type="button"
                onClick={() => setCurrentView('sales-hub')}
                className="text-foreground font-black text-lg uppercase tracking-tighter leading-none hover:opacity-80 active:scale-95 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded px-1 -mx-1"
                aria-label="CostPro — Volver al inicio"
                title="Volver a Venta"
              >
                COST<span className="text-green-600 dark:text-green-400">PRO</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentView('sales-hub')}
                className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-xs hover:opacity-80 active:scale-95 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="CostPro — Volver al inicio"
                title="Volver a Venta"
              >
                CP
              </button>
            )}

            {isMobile && (
               <button
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label="Cerrar menú lateral"
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
                  className="w-full h-9 bg-background/50 border border-primary/10 rounded-xl pl-9 pr-16 text-xs font-black focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-[0.2em] placeholder:text-muted-foreground/50"
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
          aria-label="Navegación del menú principal"
          className="flex-1 overflow-y-auto pt-0 px-3 pb-4 sm:pb-4 no-scrollbar overscroll-contain scroll-smooth"
        >
          <AnimatePresence mode="wait">
            {focusModuleId && focusedModule && sidebarState === 'expanded' ? (
              <motion.div
                key="focus-mode"
                initial={{ opacity: 0, x: 20 }}
                animate={prefersReducedMotion ? {} : { opacity: 1, x: 0 }}
                exit={prefersReducedMotion ? {} : { opacity: 0, x: -20 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col w-full"
              >
                {/* Focus breadcrumb: INICIO > MODULE NAME */}
                <div className="px-4 py-2 mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] ml-4 border-l-2 border-primary/20">
                  <button
                    onClick={() => {
                      exitFocusMode();
                      setCurrentView('occ');
                      onViewChange('occ');
                    }}
                    className="flex items-center gap-1.5 text-muted-foreground/70 hover:text-primary transition-colors group outline-none"
                    aria-label="Volver al inicio"
                  >
                    <span className="opacity-70 text-xs">/</span>
                    <span>INICIO</span>
                  </button>
                  <span className="opacity-40 text-xs">/</span>
                  <span className="text-primary/80 truncate">{focusedModule.label}</span>
                </div>

                {/* FEATURE-CHATBOT-VIEW: Pinned chat access at the top of focus mode.
                    This ensures the AI assistant is ALWAYS accessible, even when
                    the user is focused on a specific module (Multi-Tienda, Costos, etc.). */}
                <div className="px-2 mb-3">
                  <button
                    onClick={() => {
                      exitFocusMode();
                      setCurrentView('chat');
                      onViewChange('chat');
                      if (isMobile) onClose();
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-[0.98]",
                      currentView === 'chat'
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "bg-primary/5 text-primary hover:bg-primary/10 border border-primary/20"
                    )}
                    aria-label="Volver al chat con Darian"
                    title="Chat con Darian (siempre disponible)"
                    type="button"
                  >
                    <Bot className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left">Chat con Darian</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">AI</span>
                  </button>
                </div>

                {/* Focused module children */}
                <div className="space-y-1">
                  {focusedModule.children?.map(child => renderModule(child, 0))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="normal-mode"
                initial={{ opacity: 0 }}
                animate={prefersReducedMotion ? {} : { opacity: 1 }}
                exit={prefersReducedMotion ? {} : { opacity: 0 }}
                className={cn("space-y-1 sm:space-y-4", sidebarState === 'rail' && "space-y-2")}
              >
                {/* E-2 (IA Audit): sección "FIJADOS" — accesos rápidos personalizados.
                    Solo se muestra si el usuario ha fijado al menos 1 item y el sidebar
                    está expandido (no en rail mode). Máximo 5 items. */}
                {pinnedItems.length > 0 && sidebarState === 'expanded' && !sidebarSearch && (
                  <div className="space-y-1 mb-2">
                    <div className="px-4 py-1 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">
                        Fijados
                      </span>
                      <Pin className="w-3 h-3 text-muted-foreground/70" aria-hidden="true" />
                    </div>
                    {pinnedItems.map(item => renderNavItem(item, 0))}
                  </div>
                )}
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
                  <span className="inline-block mt-1 bg-primary/15 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
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
            {/* FIX-AUDIT-MOBILE: "Mi Perfil" y "Configuración" movidos aquí desde el dropdown
                del avatar en el Header. Libera el header móvil de un icono y centraliza
                las opciones de cuenta en el sidebar (patrón estándar: GitHub, Slack, Discord). */}
            <button
              onClick={() => onViewChange('settings')}
              aria-label="Mi perfil"
              className={cn(
                "flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 hover:bg-primary/10 text-sidebar-foreground font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                sidebarState === 'expanded' ? "flex-1" : "w-12 h-12 justify-center"
              )}
            >
              <User className="w-4.5 h-4.5" />
              {sidebarState === 'expanded' && <span className="text-xs uppercase tracking-wider">Mi Perfil</span>}
            </button>

            <button
              onClick={() => onViewChange('settings')}
              aria-label="Configuración"
              className={cn(
                "rounded-xl transition-all group active:scale-95 font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                sidebarState === 'expanded' ? "p-3.5" : "w-12 h-12 flex items-center justify-center",
                "hover:bg-primary/5 text-sidebar-foreground/80"
              )}
            >
              <Settings className="w-4.5 h-4.5" />
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
                  : "hover:bg-primary/5 text-sidebar-foreground/80"
              )}
            >
              <Calculator className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Salir — en su propia fila para evitar mezclar acción destructiva con utilidades */}
          <button
            onClick={onLogout}
            aria-label="Cerrar sesión"
            className={cn(
              "flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 hover:bg-danger/10 text-danger font-bold outline-none focus-visible:ring-2 focus-visible:ring-danger/50",
              sidebarState === 'expanded' ? "w-full" : "w-12 h-12 justify-center"
            )}
          >
            <LogOut className="w-4.5 h-4.5" />
            {sidebarState === 'expanded' && <span className="text-xs uppercase tracking-wider">Salir</span>}
          </button>
        </div>
      </div>
      </div>
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';

// ── Helper: check if a view ID exists anywhere in a module tree ──
function hasViewInModule(mod: NavModule, viewId: string): boolean {
  if (mod.id === viewId) return true;
  if (mod.children) {
    return mod.children.some(child => hasViewInModule(child, viewId));
  }
  return false;
}

export default Sidebar;
