'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  X,
  Search,
  ChevronDown,
  Home,
  LogOut,
  Zap,
  Calculator,
  Pin,
  PinOff,
  User,
  Settings,
  // CP-UX-NAVIGATION-POS-REPAIR-001 (2026-11-24): control de contraer/expandir
  // integrado en el ENCABEZADO del propio menú (patrón ChatGPT/Z.ai).
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuthStore, useUIStore, SidebarState, ViewType } from '@/store';
import { isAdminLevel } from '@/lib/roles';
import { NavModule, SIDEBAR_STRUCTURE } from '@/config/navigation/sidebar.structure';
import { isSidebarItemActive } from '@/config/navigation/navigation-map';
import { useFilteredNavigation } from '@/hooks/ui/useFilteredNavigation';
import { useAdaptiveNav } from '@/hooks/ui/useAdaptiveNav';
import { usePinnedNav } from '@/hooks/ui/usePinnedNav';
import { cn } from '@/lib/utils';
import { AdnMonograma } from '@/components/brand/AdnBrand';
import OnlineStatusDot from '@/components/shared/OnlineStatusDot';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { useSidebarHoverExpand } from '@/hooks/ui/useSidebarHoverExpand';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
  onClose: () => void;
  onPrefetchView: (view: ViewType) => void;
}

// Root module IDs (depth=0) — these trigger focus mode
const ROOT_MODULE_IDS = new Set(SIDEBAR_STRUCTURE.map(m => m.id));

const Sidebar = React.memo(({ onViewChange, onLogout, onClose, onPrefetchView }: SidebarProps) => {
  const prefersReducedMotion = useReducedMotion();
  const { user } = useAuthStore();
  const {
    currentView,
    sidebarState,
    setSidebarState,
    // CP-UX-POLISH-002 (2026-11-24): eje FIJO/TEMPORAL del menú. El pin decide
    // si el menú reservA espacio (Estados A/B) o se superpone temporalmente
    // (Estado C) — el comportamiento de layout vive en TerminalShell.
    sidebarPinned,
    setSidebarPinned,
    isCalculatorOpen,
    setIsCalculatorOpen,
    activeCostSection,
    ipvActiveTab,
    setIpvActiveTab,
    setActiveCostSection,
    setCurrentView,
  } = useUIStore();
  const isMobile = useIsMobile();

  // ── Hover expansion (rail → expandido temporal) ──
  // En desktop con puntero fino, un sidebar en 'rail' se expande al pasar el
  // puntero sobre él (hit area = TODO el aside, no un botón pequeño). El ancho
  // crece como overlay (TerminalShell mantiene pl-20) → cero layout shift.
  // El hover NUNCA muta sidebarState (persistencia intacta): el pin explícito
  // sigue existiendo vía hamburguesa / Ctrl+B / clic en icono del rail.
  const { hoverExpanded, hoverProps } = useSidebarHoverExpand({ collapsed: sidebarState === 'rail' });
  // Estado efectivo de renderizado: rail + hover → se pinta como expandido.
  const displayState: SidebarState = hoverExpanded && sidebarState === 'rail' ? 'expanded' : sidebarState;

  // CP-UX-POLISH-002: ¿el menú se comporta como TEMPORAL (Estado C)?
  // Desktop sin pin → overlay; móvil SIEMPRE es panel temporal (el pin no se
  // aplica en pantalla táctil: no debe reducir el área de trabajo).
  const isTemporary = isMobile || !sidebarPinned;

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
    // F1 (Drawer/deep-link): el focus mode NO debe forzar la apertura del drawer
    // en móvil. El efecto de auto-focus al montar (más abajo) llamaba a esta
    // función en cada carga y reabría el drawer + overlay sobre la vista operativa
    // tras un deep-link o recarga — el "focus-mode persistente" de Discovery.
    // En móvil solo se fija el módulo enfocado (coherencia visual); el drawer
    // se abre/cierra manualmente (hamburguesa, backdrop, X). Desktop intacto.
    // CP-UX-POLISH-002: tampoco debe reabrir un menú CERRADO en desktop (bug
    // B1-f: con sidebarState='closed' el auto-focus de montaje lo reabría solo
    // tras cada recarga). El módulo se enfoca igual; el menú sigue cerrado y
    // reaparece con el focus aplicado cuando el usuario lo abra.
    if (!isMobile && useUIStore.getState().sidebarState !== 'closed') {
      setSidebarState('expanded');
    }
    setFocusModuleId(moduleId);
    // FIX: Do NOT auto-expand children — let the user expand manually
    setExpandedModules([]);
    // FIX (2026-07-22): NO cerrar el sidebar al navegar en móvil.
    // El usuario quiere navegación continua — el sidebar se cierra solo
    // al hacer clic en el backdrop (overlay) o en el botón X.
  }, [setSidebarState, isMobile]);

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
  // GATE 1: secciones de la arquitectura aprobada (OPERACIÓN→pos, etc.).
  const MODULE_DEFAULT_VIEW: Record<string, ViewType> = {
    'operacion': 'pos',
    // MISIÓN 2026-11-13: sección «RECURSOS HUMANOS» — su única hoja hoy es
    // «Trabajadores y Comisiones» (mismo patrón que AYUDA → help).
    'recursos-humanos': 'workers',
    'analisis': 'dashboard',
    'sistema': 'settings',
    'ayuda': 'help',
    'desarrollo': 'ipv',
  };
  const handleRootModuleClick = useCallback((mod: NavModule) => {
    // If already in focus for this module → exit focus
    if (focusModuleId === mod.id) {
      exitFocusMode();
      return;
    }
    // Enter focus mode for this module
    enterFocusMode(mod.id);
    // F3: Navegar a la vista por defecto del módulo si existe.
    const defaultView = MODULE_DEFAULT_VIEW[mod.id];
    if (defaultView) {
      onViewChange(defaultView);
    }
  }, [exitFocusMode, enterFocusMode, focusModuleId, setCurrentView, onViewChange]);

  // ── Click on a nav item (leaf) ──
  const handleNavClick = useCallback((view: ViewType) => {
    onViewChange(view);
    // CP-UX-NAVIGATION-POS-REPAIR-001 (2026-11-24): navegación jerárquica en
    // móvil. La decisión previa (2026-07-22, "no cerrar nunca al navegar")
    // dejaba el drawer abierto tras elegir una vista concreta — p.ej.
    // Operación → Ventas cerraba la vista pero el menú seguía tapando el
    // contenido. Regla vigente:
    //   · Clic en SECCIÓN raíz (focus mode) → el drawer PERMANECE abierto para
    //     mostrar sus opciones secundarias.
    //   · Clic en una HOJA funcional (Ventas, Stock, …) → el drawer SE CIERRA
    //     y la vista queda visible.
    //   · Expandir/contraer una categoría (toggleSubmenu) NO navega y NO cierra.
    // CP-UX-POLISH-002 (§1 Estado C): el menú TEMPORAL (desktop sin pin o
    // móvil) también se cierra al seleccionar una vista funcional — es un panel
    // de paso, no una columna permanente. Con pin activo, el desktop no cierra
    // (el menú es fijo y permanece al navegar).
    if (isTemporary) {
      setSidebarState('closed');
    }
  }, [onViewChange, isTemporary, setSidebarState]);

  // ── In rail mode, expand sidebar on module click ──
  const handleRailModuleClick = useCallback((mod: NavModule) => {
    setSidebarState('expanded');
    enterFocusMode(mod.id);
    // F3: Navegar a vista por defecto del módulo también en rail mode.
    const defaultView = MODULE_DEFAULT_VIEW[mod.id];
    if (defaultView) {
      onViewChange(defaultView);
    }
  }, [setSidebarState, enterFocusMode, onViewChange]);

  // ── Render the fixed HOME item (GATE 1 §1: Inicio → dashboard) ──
  // Primer ítem del nav, fuera de secciones, todos los roles. En rail mode
  // es un botón de icono con tooltip; en expandido un ítem destacado.
  const renderHomeItem = useCallback(() => {
    const isActive = currentView === 'dashboard';
    const isRail = displayState === 'rail';

    if (isRail) {
      return (
        <TooltipProvider key="home-fixed" delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleNavClick('dashboard')}
                onMouseEnter={() => onPrefetchView('dashboard')}
                aria-current={isActive ? 'page' : undefined}
                aria-label="Inicio"
                className={cn(
                  "w-12 h-12 flex items-center justify-center rounded-xl transition-all active:scale-95 mx-auto mb-2",
                  isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-sidebar-foreground/80 hover:bg-primary/10 hover:text-primary"
                )}
              >
                <Home className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-bold uppercase tracking-widest text-[10px]">
              Inicio
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <div key="home-fixed" className="mb-1">
        <button
          onClick={() => handleNavClick('dashboard')}
          onMouseEnter={() => onPrefetchView('dashboard')}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            isActive
              ? "bg-primary/15 text-primary font-black shadow-md shadow-primary/20 ring-1 ring-primary/25"
              : "text-sidebar-foreground/90 hover:bg-primary/5 hover:text-sidebar-foreground"
          )}
        >
          <Home className={cn("w-4 h-4 transition-transform group-hover:scale-110", isActive ? "text-primary" : "opacity-90")} />
          <span className="text-xs uppercase tracking-wider flex-1 text-left font-black">Inicio</span>
          {isActive && (
            <motion.div layoutId="active-nav-indicator" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>
      </div>
    );
  }, [currentView, displayState, handleNavClick, onPrefetchView]);

  // ── Render a leaf nav item ──
  const renderNavItem = useCallback((item: any, depth = 0) => {
    const isActive = isSidebarItemActive(item.id, currentView, ipvActiveTab, activeCostSection);
    const isRail = displayState === 'rail';

    if (isRail && depth === 0) {
      return (
        <TooltipProvider key={item.id} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleNavClick(item.id as ViewType)}
                onMouseEnter={() => onPrefetchView(item.id as ViewType)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
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
          {/* GATE 1 P2-1: badges isNew/isBeta por fin renderizados */}
          {item.isNew && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[8px] font-black uppercase tracking-widest">
              Nuevo
            </span>
          )}
          {item.isBeta && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[8px] font-black uppercase tracking-widest">
              Beta
            </span>
          )}
          {isActive && (
            <motion.div layoutId="active-nav-indicator" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>
        {/* E-2 (IA Audit): botón pin/desfijar visible al hover.
            Permite al usuario fijar accesos rápidos en la sección "FIJADOS"
            al inicio del sidebar. Máximo 5 items fijados. */}
        {!isRail && displayState === 'expanded' && (
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
  }, [currentView, ipvActiveTab, activeCostSection, displayState, handleNavClick, onPrefetchView, isPinned, togglePin]);

  // ── Render a module (group or submenu) ──
  function renderModule(mod: NavModule, depth = 0): React.ReactNode {
    const isExpanded = expandedModules.includes(mod.id);
    const isRail = displayState === 'rail';
    const isRoot = depth === 0 && ROOT_MODULE_IDS.has(mod.id);

    // Leaf item
    if (mod.type === 'item') {
      return renderNavItem(mod, depth);
    }

    // Rail mode: icon button for root modules
    // CP-UX-NAVIGATION-POS-REPAIR-001: indicador de sección activa en rail —
    // el icono raíz se resalta cuando la vista actual pertenece a su árbol
    // (misma semántica de isActive que las hojas).
    if (isRail && isRoot) {
      const moduleIsActive = hasViewInModule(mod, currentView);
      return (
        <TooltipProvider key={mod.id} delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleRailModuleClick(mod)}
                aria-label={mod.label}
                aria-expanded={isExpanded}
                aria-current={moduleIsActive ? 'true' : undefined}
                className={cn(
                  "w-12 h-12 flex items-center justify-center rounded-xl transition-all active:scale-95 mx-auto mb-2",
                  moduleIsActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-sidebar-foreground/80 hover:bg-primary/10 hover:text-primary"
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
      // GATE 1: secciones activas no requieren estado extra — el clic entra en
      // focus mode y navega a la vista por defecto (MODULE_DEFAULT_VIEW).

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
  // COSTPRO 4 (fix/usuarios-en-desarrollo-admin): el módulo enfocado se resuelve
  // SIEMPRE sobre el árbol FILTRADO POR ROL (allNavigation) — antes buscaba en
  // SIDEBAR_STRUCTURE cruda, así que un usuario sin rol admin que aterrizaba en
  // una vista de EN DESARROLLO (deep-link / sesión previa) veía la sección
  // completa aunque el filtro la hubiera eliminado. Si el módulo no existe para
  // este rol, focusedModule queda null y el sidebar cae al modo normal.
  const focusedModule = useMemo(() =>
    allNavigation.find(m => m.id === focusModuleId),
  [focusModuleId, allNavigation]);

  // ── Check if current view belongs to a root module (for auto-focus) ──
  useEffect(() => {
    if (focusModuleId) return; // Don't override manual focus
    // COSTPRO 4: el auto-focus SOLO considera módulos visibles para el rol —
    // nunca enfoca secciones que el filtro de permisos eliminó.
    // CP-NAV-FINANCIAL-STATEMENTS-TOP-LEVEL-NAVIGATION-001 (2026-11-22):
    // los módulos de primer nivel type 'item' (p. ej. «Estados Financieros»)
    // NO entran en focus mode: son hojas directas con resaltado propio
    // (renderNavItem) y sin hijos — el focus UI quedaría vacío.
    for (const mod of allNavigation) {
      if (mod.type !== 'item' && hasViewInModule(mod, currentView)) {
        queueMicrotask(() => enterFocusMode(mod.id));
        return;
      }
    }
  }, []); // Only on mount

  // El ancho sigue al estado de renderizado: rail + hover → ancho expandido
  // (overlay flotante sobre el contenido; TerminalShell no cambia su padding).
  const sidebarWidthClass = useMemo(() => {
    switch (displayState) {
      case 'expanded': return "w-64 lg:w-72 translate-x-0";
      case 'rail': return "w-20 translate-x-0";
      case 'closed': return "w-0 -translate-x-full border-r-0";
    }
  }, [displayState]);

  // CP-UX-POLISH-002 (§1 Estado C): interacción exterior por teclado. El menú
  // TEMPORAL se cierra con Esc (móvil y desktop sin pin). El guard evita robar
  // el Esc de un diálogo abierto (Radix/modales) — si hay [role=dialog] en el
  // documento, el Esc pertenece a ese diálogo y el menú permanece.
  useEffect(() => {
    if (sidebarState === 'closed' || !isTemporary) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]')) return;
      setSidebarState('closed');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sidebarState, isTemporary, setSidebarState]);

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
      {...hoverProps}
      className={cn(
        "fixed inset-y-0 left-0 z-40 bg-sidebar transition-all duration-300 ease-in-out border-r border-sidebar-border shadow-2xl overflow-hidden enhanced-sidebar-edge",
        sidebarWidthClass
      )}
    >
      <div className={cn(
        "relative bg-sidebar/90 backdrop-blur-2xl h-full flex flex-col overflow-hidden transition-all duration-300",
        displayState === 'expanded' ? "w-64 lg:w-72" : displayState === 'rail' ? "w-20" : "w-0"
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
              // CP-UX-NAVIGATION-POS-REPAIR-001: en rail conviven el isotipo y el
              // control de expandir (ambos de 32px) — gap compacto centrado.
              displayState === 'rail' && "justify-center gap-1.5 px-2"
            )}
          >
            {displayState !== 'rail' ? (
              // GATE 1 §1: clic en el logo → HOME ÚNICA (dashboard). Un solo
              // concepto: Inicio → dashboard · Logo → dashboard · Ctrl+1 → dashboard.
              // ADN-BRAND-REBUILD-001: marca ADNegocio (ADN verde + egocio).
              <button
                type="button"
                onClick={() => {
                  setCurrentView('dashboard');
                  // CP-UX-POLISH-002: el logo es navegación funcional — el menú
                  // TEMPORAL se cierra tras navegar a Inicio (coherente con las hojas).
                  if (isTemporary) setSidebarState('closed');
                }}
                className="text-foreground font-black text-lg tracking-tight leading-none hover:opacity-80 active:scale-95 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded px-1 -mx-1"
                aria-label="ADNegocio — Ir a Inicio"
                title="Ir a Inicio"
              >
                <span className="text-green-600 dark:text-green-400">ADN</span>egocio
              </button>
            ) : (
              // Rail (colapsado): únicamente el símbolo compacto ADN (isotipo).
              <button
                type="button"
                onClick={() => setCurrentView('dashboard')}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-80 active:scale-95 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="ADNegocio — Ir a Inicio"
                title="Ir a Inicio"
              >
                <AdnMonograma height={15} className="text-green-600 dark:text-green-400" />
              </button>
            )}

            {/* CP-UX-NAVIGATION-POS-REPAIR-001 (2026-11-24): control de
                contraer/expandir integrado en el ENCABEZADO del menú lateral.
                Desktop: alterna expanded ↔ rail — JAMÁS deja el menú en
                'closed' (al contraer queda la barra compacta con iconos).
                Móvil: se conserva la X (cierre del drawer), el control de
                apertura vive en el hamburger del Header; un segundo toggle
                rail en pantalla táctil duplicaría controles sin utilidad.

                CP-UX-POLISH-002 (§1.1): a la izquierda del toggle vive el
                CONTROL DE FIJAR (pin) — desktop expandido. Estados:
                  · Pinned (A/B) → Pin activo (tinte primario + aria-pressed):
                    el menú reserva espacio y empuja el contenido.
                  · Temporal (C) → PinOff + X propia: el menú se superpone sin
                    reservar espacio; la X lo cierra y el backdrop/Esc también.
                En rail el pin se omite por espacio (rail ≡ fijo contraído); la
                barra compacta es siempre un estado fijo del layout. */}
            {isMobile ? (
               <button
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label="Cerrar menú lateral"
               >
                 <X className="w-4 h-4" />
               </button>
            ) : displayState === 'rail' ? (
              <button
                type="button"
                onClick={() => setSidebarState('expanded')}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label="Expandir menú lateral"
                aria-pressed={false}
                title="Expandir menú"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                {/* Control de fijación — el pin cambia el COMPORTAMIENTO del
                    layout (reserva de espacio vs superposición), no solo su
                    apariencia (TerminalShell lee sidebarPinned). */}
                <button
                  type="button"
                  onClick={() => setSidebarPinned(!sidebarPinned)}
                  className={cn(
                    "p-2 rounded-lg transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 border",
                    sidebarPinned
                      ? "bg-primary/10 text-primary border-primary/30 shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-primary/10 border-transparent",
                  )}
                  aria-label={sidebarPinned ? 'Desfijar menú lateral (hacer temporal)' : 'Fijar menú lateral'}
                  aria-pressed={sidebarPinned}
                  title={sidebarPinned
                    ? 'Menú fijado — clic para hacerlo temporal (overlay)'
                    : 'Menú temporal — clic para fijarlo al layout'}
                >
                  {sidebarPinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
                </button>
                {sidebarPinned ? (
                  // Estado A/B fijo: contraer/expandir la columna (jamás closed).
                  <button
                    type="button"
                    onClick={() => setSidebarState('rail')}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    aria-label="Contraer menú lateral"
                    aria-pressed={false}
                    title="Contraer a barra compacta"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                ) : (
                  // Estado C temporal: cierre del panel temporal (además del
                  // backdrop y de seleccionar una vista funcional).
                  <button
                    type="button"
                    onClick={() => setSidebarState('closed')}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    aria-label="Cerrar menú temporal"
                    title="Cerrar menú temporal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {displayState === 'expanded' && (
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
                {/* GATE 1 P2-2: el hint ⌘K ahora ABRE el Command Palette real */}
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
                  aria-label="Abrir centro de comando (Ctrl+K)"
                  className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 items-center bg-muted text-muted-foreground text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-auto select-none hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  ⌘K
                </button>
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
            {focusModuleId && focusedModule && displayState === 'expanded' ? (
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
                      setCurrentView('dashboard');
                      onViewChange('dashboard');
                      // CP-UX-NAVIGATION-POS-REPAIR-001: navegar a Inicio es
                      // navegación funcional concreta → cerrar drawer en móvil.
                      // CP-UX-POLISH-002: el menú TEMPORAL (Estado C) también
                      // se cierra al navegar a Inicio desde el breadcrumb.
                      if (isTemporary) setSidebarState('closed');
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

                {/* CAMBIO 3 (HOME/SALES/PERFORMANCE DEFAULTS): el botón fijado
                    "Chat con Darian" del focus mode se RETIRA — Darian ya vive
                    dentro de Inicio (AI Command Center) y una segunda entrada
                    era duplicación conceptual. El breadcrumb /INICIO de este
                    mismo panel lleva a Inicio, donde está Darian. El ViewType
                    'chat' sigue válido para deep-links (/?view=chat) y para la
                    reapertura de conversaciones desde Acciones recientes. */}

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
                className={cn("space-y-1 sm:space-y-4", displayState === 'rail' && "space-y-2")}
              >
                {/* GATE 1 §1 — INICIO fijo: primer ítem del nav, fuera de secciones.
                    Un solo concepto: Inicio → dashboard (logo y Ctrl+1 al mismo destino). */}
                {renderHomeItem()}

                {/* E-2 (IA Audit): sección "FIJADOS" — accesos rápidos personalizados.
                    Solo se muestra si el usuario ha fijado al menos 1 item y el sidebar
                    está expandido (no en rail mode). Máximo 5 items. */}
                {pinnedItems.length > 0 && displayState === 'expanded' && !sidebarSearch && (
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
          {user && displayState === 'expanded' && (
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  {/* FIX-PERF-BG (2026-07-13): perf-avatar-solid reemplaza el
                      gradient verde por un fondo sólido en modo performance. */}
                  <div className="perf-avatar-solid w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-primary-foreground text-xs font-black uppercase">
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

          <div className={cn("p-4 space-y-1", displayState === 'rail' && "p-2 items-center flex flex-col")}>
          {user?.plan === 'free' && !isAdminLevel(user?.role) && displayState === 'expanded' && (
            <button
              onClick={() => {
                const whatsappNumber = "+53 53183215";
                const message = encodeURIComponent("Hola, me interesa obtener el Plan Pro de ADNegocio para tener acceso ilimitado.");
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
          <div className={cn("flex items-center justify-between gap-2", displayState === 'rail' && "flex-col")}>
            {/* FIX-AUDIT-MOBILE: "Mi Perfil" y "Configuración" movidos aquí desde el dropdown
                del avatar en el Header. Libera el header móvil de un icono y centraliza
                las opciones de cuenta en el sidebar (patrón estándar: GitHub, Slack, Discord). */}
            <button
              onClick={() => {
                onViewChange('settings');
                // CP-UX-NAVIGATION-POS-REPAIR-001: Mi Perfil/Ajustes navegan a una
                // vista funcional → cerrar el drawer en móvil (coherencia con las hojas).
                // CP-UX-POLISH-002: igual para el menú TEMPORAL (Estado C).
                if (isTemporary) setSidebarState('closed');
              }}
              aria-label="Mi perfil"
              className={cn(
                "flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 hover:bg-primary/10 text-sidebar-foreground font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                displayState === 'expanded' ? "flex-1" : "w-12 h-12 justify-center"
              )}
            >
              <User className="w-4.5 h-4.5" />
              {displayState === 'expanded' && <span className="text-xs uppercase tracking-wider">Mi Perfil</span>}
            </button>

            <button
              onClick={() => {
                onViewChange('settings');
                // CP-UX-POLISH-002: vista funcional → el menú temporal se cierra.
                if (isTemporary) setSidebarState('closed');
              }}
              aria-label="Ajustes"
              title="Ajustes"
              className={cn(
                "rounded-xl transition-all group active:scale-95 font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                displayState === 'expanded' ? "p-3.5" : "w-12 h-12 flex items-center justify-center",
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
                displayState === 'expanded' ? "p-3.5" : "w-12 h-12 flex items-center justify-center",
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
              displayState === 'expanded' ? "w-full" : "w-12 h-12 justify-center"
            )}
          >
            <LogOut className="w-4.5 h-4.5" />
            {displayState === 'expanded' && <span className="text-xs uppercase tracking-wider">Salir</span>}
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
