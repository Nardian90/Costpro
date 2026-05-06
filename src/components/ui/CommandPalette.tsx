'use client';

import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command, X, ArrowRight, Sparkles } from 'lucide-react';
import Fuse from 'fuse.js';
import { useUIStore, type ViewType } from '@/store';
import { useAuthStore } from '@/store';
import { SYSTEM_ACTIONS, Action, getActionsForUser } from '@/config/actions';
import { getNavigationRoute } from '@/config/navigation/navigation-map';
import { cn } from '@/lib/utils';

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

  const userActions = useMemo(() =>
    getActionsForUser(user?.role || 'user'),
  [user?.role]);

  const fuse = useMemo(() => new Fuse(userActions, {
    keys: ['label', 'keywords', 'description'],
    threshold: 0.3,
    distance: 100,
  }), [userActions]);

  const results = useMemo(() => {
    if (!query) {
      // Prioritize recent actions
      const recentActionObjects = recentActions
        .map(id => userActions.find(a => a.id === id))
        .filter(Boolean) as Action[];

      const others = userActions.filter(a => !recentActions.includes(a.id));
      return [...recentActionObjects, ...others].slice(0, 8);
    }
    return fuse.search(query).map(r => r.item).slice(0, 8);
  }, [query, fuse, userActions, recentActions]);

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

  const handleSelect = (action: Action) => {
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
                aria-activedescendant={results[selectedIndex] ? `action-${results[selectedIndex].id}` : undefined}
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
                  {results.map((action, index) => (
                    <button
                      key={action.id}
                      id={`action-${action.id}`}
                      role="option"
                      aria-selected={selectedIndex === index}
                      tabIndex={-1}
                      onClick={() => handleSelect(action)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        "w-full flex items-center gap-4 px-4 py-4 rounded-[20px] transition-all group relative",
                        selectedIndex === index ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[0.99]" : "hover:bg-muted"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                        selectedIndex === index ? "bg-primary-foreground/20" : "bg-muted group-hover:bg-background"
                      )}>
                        <action.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-bold text-sm tracking-tight">{action.label}</div>
                        <div className={cn(
                          "text-xs truncate max-w-[300px]",
                          selectedIndex === index ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {action.description || action.keywords.join(', ')}
                        </div>
                      </div>
                      <div className={cn(
                        "transition-opacity flex items-center gap-2",
                        selectedIndex === index ? "opacity-100" : "opacity-0"
                      )}>
                        <span className="text-[10px] font-black uppercase tracking-widest">Ejecutar</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </button>
                  ))}
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
