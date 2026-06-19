'use client';

import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command, X, ArrowRight, Sparkles, Store as StoreIcon } from 'lucide-react';
import Fuse from 'fuse.js';
import { useUIStore, type ViewType } from '@/store';
import { useAuthStore } from '@/store';
import { SYSTEM_ACTIONS, Action, getActionsForUser } from '@/config/actions';
import { getNavigationRoute } from '@/config/navigation/navigation-map';
import { useStores } from '@/hooks/api/useStores';
import { useStoreSwitcher } from '@/hooks/ui/useStoreSwitcher';
import { cn } from '@/lib/utils';

// F1-T03: tipo unificado para items del palette — puede ser una acción o una tienda.
// Ambos son buscables y seleccionables, pero se renderizan y dispatchan distinto.
type PaletteItem =
  | { kind: 'action'; action: Action }
  | { kind: 'store'; store: { id: string; name: string; slug?: string } };

export const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentActions, setRecentActions] = useState<string[]>([]);
  const isMac = useSyncExternalStore(
    () => () => {},
    () => {
      const ua = navigator.userAgent.toLowerCase();
      return ua.includes('macintosh') || ua.includes('mac os x');
    },
    () => true
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      setSelectedIndex(0);
    });
  }, [query]);
  const { setCurrentView, setActiveCostSection, setIpvActiveTab } = useUIStore();
  const { user } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // F1-T03: cargar tiendas del usuario para hacerlas buscables desde Cmd+K.
  // Solo se cargan si el usuario está autenticado; si no hay sesión, storesItem es [].
  const isAdmin = user?.role === 'admin';
  const isEncargado = user?.role === 'encargado' || user?.role === 'manager' ||
    user?.memberships?.some(m => m.role === 'encargado');
  const { data: stores = [] } = useStores(user?.id || '', isAdmin, isEncargado || false);
  const { switchStore } = useStoreSwitcher();

  const userActions = useMemo(() =>
    getActionsForUser(user?.role || 'user'),
  [user?.role]);

  // F1-T03: construir lista unificada de items (acciones + tiendas).
  // Las tiendas se etiquetan con su nombre + slug para que Fuse las encuentre
  // sin importar si el usuario busca por nombre o por slug.
  const allItems = useMemo<PaletteItem[]>(() => {
    const actionItems: PaletteItem[] = userActions.map(a => ({ kind: 'action', action: a }));
    // Audit-Fix #2d: s.slug es string | null | undefined pero PaletteItem espera slug?: string.
    // Convertimos null/undefined a undefined para compatibilidad de tipos.
    const storeItems: PaletteItem[] = stores.map(s => ({
      kind: 'store',
      store: { id: s.id, name: s.name, slug: s.slug ?? undefined }
    }));
    return [...actionItems, ...storeItems];
  }, [userActions, stores]);

  // F1-T03: Fuse indexa sobre la lista unificada. Para tiendas, se busca en
  // store.name y store.slug; para acciones, en label/keywords/description.
  const fuse = useMemo(() => new Fuse(allItems, {
    keys: [
      'action.label',
      'action.keywords',
      'action.description',
      'store.name',
      'store.slug',
    ],
    threshold: 0.3,
    distance: 100,
  }), [allItems]);

  const results = useMemo(() => {
    if (!query) {
      // Prioritize recent actions; las tiendas aparecen después de las sugerencias
      const recentActionObjects = recentActions
        .map(id => userActions.find(a => a.id === id))
        .filter(Boolean) as Action[];

      const recentItems: PaletteItem[] = recentActionObjects.map(a => ({ kind: 'action', action: a }));
      const otherActionItems: PaletteItem[] = userActions
        .filter(a => !recentActions.includes(a.id))
        .map(a => ({ kind: 'action', action: a }));
      const storeItems: PaletteItem[] = stores
        .slice(0, 3) // mostrar solo las 3 primeras tiendas como sugerencia rápida
        .map(s => ({ kind: 'store', store: { id: s.id, name: s.name, slug: s.slug ?? undefined } }));

      return [...recentItems, ...otherActionItems.slice(0, 5), ...storeItems].slice(0, 8);
    }
    return fuse.search(query).map(r => r.item).slice(0, 8);
  }, [query, fuse, userActions, stores, recentActions]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setQuery('');
        setSelectedIndex(0);
        // FIX-BUG-RCT-002: Wrap localStorage in SSR guard
        const recent = typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem('recent_actions') || '[]')
          : [];
        setRecentActions(recent);
        setTimeout(() => inputRef.current?.focus(), 100);
      });
    }
  }, [isOpen]);

  // F1-T03: handleSelect ahora acepta un PaletteItem unificado.
  // Si es una acción, navega como antes. Si es una tienda, ejecuta switchStore
  // para cambiar el contexto global de tienda activa.
  const handleSelect = (item: PaletteItem) => {
    if (item.kind === 'store') {
      switchStore(item.store.id);
      setIsOpen(false);
      return;
    }

    const action = item.action;
    const route = getNavigationRoute(action.route as string);

    if (route && route.type === 'module') {
      setCurrentView(route.view as any);
      if (route.view === 'ipv') {
        setIpvActiveTab(route.tab);
      } else if (route.view === 'cost-sheets') {
        setActiveCostSection(route.tab);
      }
    } else {
      setCurrentView(action.route as ViewType);
    }

    setIsOpen(false);

    // FIX-BUG-RCT-002: Wrap localStorage in SSR guard
    const recent = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('recent_actions') || '[]')
      : [];
    const updated = [action.id, ...recent.filter((id: string) => id !== action.id)].slice(0, 5);
    localStorage.setItem('recent_actions', JSON.stringify(updated));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  // Ensure selected item is visible
  useEffect(() => {
    const activeItem = listRef.current?.children[selectedIndex] as HTMLElement;
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (typeof window === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-md"
            aria-hidden="true" /* FIX-ACC-008 */
            onClick={() => setIsOpen(false)}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="relative w-full max-w-2xl bg-card border border-border shadow-2xl rounded-[32px] overflow-hidden"
          >
            <div className="flex items-center px-6 py-5 border-b border-border/50 bg-muted/30">
              <Search className="w-5 h-5 text-muted-foreground mr-4" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar o ejecutar acción..."
                aria-label="Buscar acciones o navegar"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-controls="command-palette-results"
                aria-activedescendant={results[selectedIndex] ? (results[selectedIndex].kind === 'store' ? `action-store-${results[selectedIndex].store.id}` : `action-${results[selectedIndex].action.id}`) : undefined}
                className="flex-1 bg-transparent border-none outline-none text-lg font-medium text-foreground placeholder:text-muted-foreground/50"
              />
              <div className="flex items-center gap-2 ml-4">
                <kbd className="px-2 py-1 bg-muted rounded-lg text-[10px] font-black border border-border flex items-center gap-1 text-muted-foreground uppercase tracking-widest">
                  {isMac ? <Command className="w-3 h-3" /> : 'CTRL'} K
                </kbd>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground"
                  aria-label="Cerrar centro de comando"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-3 scrollbar-hide">
              {results.length > 0 ? (
                <div id="command-palette-results" role="listbox" className="space-y-1">
                  <div className="px-4 py-2 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-50 flex items-center justify-between">
                    <span>{query ? 'Resultados' : (recentActions.length > 0 ? 'Acciones Recientes' : 'Sugerencias rápidas')}</span>
                    {!query && <Sparkles className="w-3 h-3" />}
                  </div>
                  {results.map((item, index) => {
                    // F1-T03: render diferenciado según kind del item.
                    // Las tiendas usan icono StoreIcon y subtítulo "Cambiar a esta tienda".
                    const isSelected = selectedIndex === index;
                    if (item.kind === 'store') {
                      return (
                        <button
                          key={`store-${item.store.id}`}
                          id={`action-store-${item.store.id}`}
                          role="option"
                          aria-selected={isSelected}
                          tabIndex={-1}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={cn(
                            "w-full flex items-center gap-4 px-4 py-4 rounded-[20px] transition-all group relative",
                            isSelected ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[0.99]" : "hover:bg-muted"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                            isSelected ? "bg-primary-foreground/20" : "bg-muted group-hover:bg-background"
                          )}>
                            <StoreIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="font-bold text-sm tracking-tight">{item.store.name}</div>
                            <div className={cn(
                              "text-xs truncate max-w-[300px]",
                              isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                            )}>
                              {item.store.slug ? `/${item.store.slug}` : 'Cambiar a esta tienda'}
                            </div>
                          </div>
                          <div className={cn(
                            "transition-opacity flex items-center gap-2",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}>
                            <span className="text-[10px] font-black uppercase tracking-widest">Activar</span>
                            <ArrowRight className="w-4 h-4" />
                          </div>
                        </button>
                      );
                    }
                    const action = item.action;
                    return (
                      <button
                        key={`action-${action.id}`}
                        id={`action-${action.id}`}
                        role="option"
                        aria-selected={isSelected}
                        tabIndex={-1}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={cn(
                          "w-full flex items-center gap-4 px-4 py-4 rounded-[20px] transition-all group relative",
                          isSelected ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[0.99]" : "hover:bg-muted"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                          isSelected ? "bg-primary-foreground/20" : "bg-muted group-hover:bg-background"
                        )}>
                          <action.icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-bold text-sm tracking-tight">{action.label}</div>
                          <div className={cn(
                            "text-xs truncate max-w-[300px]",
                            isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {action.description || action.keywords.join(', ')}
                          </div>
                        </div>
                        <div className={cn(
                          "transition-opacity flex items-center gap-2",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}>
                          <span className="text-[10px] font-black uppercase tracking-widest">Ejecutar</span>
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center px-4">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-muted-foreground opacity-20" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">No hay coincidencias</h3>
                  <p className="text-xs text-muted-foreground/60 mt-1">Intenta con otros términos como 'costo', 'stock' o 'banco'.</p>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/60">
                   <kbd className="px-1.5 py-0.5 bg-background border border-border rounded-md">↑↓</kbd>
                   <span>Navegar</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/60">
                   <kbd className="px-1.5 py-0.5 bg-background border border-border rounded-md">Enter</kbd>
                   <span>Seleccionar</span>
                </div>
              </div>
              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-30">
                Centro de Comando Operativo
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
