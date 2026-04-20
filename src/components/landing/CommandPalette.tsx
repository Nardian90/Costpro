'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ArrowRight,
  LogIn,
  Play,
  MessageSquare,
  Keyboard,
  Home,
  Layers,
  BookOpen,
  DollarSign,
  HelpCircle,
  Star,
  Mail,
  ChevronRight,
} from 'lucide-react';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (sectionId: string) => void;
  onLogin: () => void;
  onDemo: () => void;
  onContact: () => void;
  onToggleTheme: () => void;
  onShortcuts: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  action: () => void;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const dialogVariants: any = {
  hidden: { opacity: 0, scale: 0.95, y: -10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    transition: { duration: 0.15 },
  },
};

export default function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onLogin,
  onDemo,
  onContact,
  onToggleTheme,
  onShortcuts,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when palette opens (React-sanctioned pattern for syncing state from props)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }

  const commands: CommandItem[] = useMemo(
    () => [
      { id: 'nav-hero', label: 'Ir a Inicio', group: 'Navegación', icon: Home, action: () => onNavigate('hero') },
      { id: 'nav-features', label: 'Ir a Funciones', group: 'Navegación', icon: Layers, action: () => onNavigate('features') },
      { id: 'nav-howitworks', label: 'Ir a Cómo Funciona', group: 'Navegación', icon: BookOpen, action: () => onNavigate('howItWorks') },
      { id: 'nav-pricing', label: 'Ir a Precios', group: 'Navegación', icon: DollarSign, action: () => onNavigate('pricing-section') },
      { id: 'nav-faq', label: 'Ir a FAQ', group: 'Navegación', icon: HelpCircle, action: () => onNavigate('faq') },
      { id: 'nav-testimonials', label: 'Ir a Testimonios', group: 'Navegación', icon: Star, action: () => onNavigate('testimonials-section') },
      { id: 'nav-newsletter', label: 'Ir a Newsletter', group: 'Navegación', icon: Mail, action: () => onNavigate('newsletter-section') },
      { id: 'act-login', label: 'Iniciar Sesión', group: 'Acciones', icon: LogIn, shortcut: 'Enter', action: onLogin },
      { id: 'act-demo', label: 'Ver Demo', group: 'Acciones', icon: Play, action: onDemo },
      { id: 'act-contact', label: 'Contactar Ventas', group: 'Acciones', icon: MessageSquare, action: onContact },
      { id: 'thm-toggle', label: 'Cambiar Tema', group: 'Tema', icon: ChevronRight, shortcut: 'T', action: onToggleTheme },
      { id: 'thm-shortcuts', label: 'Atajos de Teclado', group: 'Tema', icon: Keyboard, shortcut: '?', action: onShortcuts },
    ],
    [onNavigate, onLogin, onDemo, onContact, onToggleTheme, onShortcuts],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  // Clamp selected index to valid range (derived state, no effect needed)
  const safeSelectedIndex = Math.min(selectedIndex, Math.max(filtered.length - 1, 0));

  // Auto-focus search input when opened (DOM side-effect only)
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Ctrl+K / Cmd+K global listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const executeCommand = useCallback(
    (item: CommandItem) => {
      onClose();
      item.action();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[safeSelectedIndex]) executeCommand(filtered[safeSelectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, safeSelectedIndex, executeCommand, onClose],
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [safeSelectedIndex]);

  // Group the filtered commands
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.group]) groups[cmd.group] = [];
      groups[cmd.group].push(cmd);
    }
    return groups;
  }, [filtered]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="command-palette-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Paleta de comandos"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Dialog */}
          <motion.div
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40 overflow-hidden"
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
              <Search className="w-4 h-4 text-white/30 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Buscar comando..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                aria-label="Buscar comando"
                aria-activedescendant={filtered[safeSelectedIndex]?.id}
                role="combobox"
                aria-expanded={isOpen}
                aria-controls="command-list"
              />
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] text-white/30 border border-white/[0.08]">
                ESC
              </kbd>
            </div>

            {/* Command List */}
            <div
              id="command-list"
              ref={listRef}
              role="listbox"
              className="max-h-[60vh] overflow-y-auto py-2 command-palette-scroll"
            >
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-white/30">
                  <Search className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">Sin resultados</p>
                  <p className="text-xs mt-1 text-white/20">Intenta con otro término de búsqueda</p>
                </div>
              ) : (
                Object.entries(grouped).map(([group, items]) => (
                    <div key={group}>
                      <p className="text-[10px] uppercase tracking-wider text-white/30 font-semibold px-4 pt-3 pb-1">
                        {group}
                      </p>
                      {items.map((item) => {
                        const globalIdx = commands.indexOf(item);
                        const isSelected = safeSelectedIndex === globalIdx;
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            id={item.id}
                            role="option"
                            aria-selected={isSelected}
                            data-selected={isSelected}
                            onClick={() => executeCommand(item)}
                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                            className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm transition-colors duration-100 ${
                              isSelected
                                ? 'bg-white/[0.08] text-white'
                                : 'text-white/70 hover:bg-white/[0.06]'
                            }`}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#22c55e]' : 'text-white/40'}`} />
                            <span className="flex-1 text-left truncate">{item.label}</span>
                            {item.shortcut && (
                              <kbd className="text-[10px] bg-white/[0.06] rounded px-1.5 py-0.5 text-white/30 ml-auto border border-white/[0.06]">
                                {item.shortcut}
                              </kbd>
                            )}
                            {isSelected && (
                              <ArrowRight className="w-3.5 h-3.5 text-[#22c55e] shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-t border-white/[0.06]">
              <span className="flex items-center gap-1.5 text-[10px] text-white/25">
                <kbd className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.06] text-white/30 font-mono">↑↓</kbd>
                Navegar
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-white/25">
                <kbd className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.06] text-white/30 font-mono">↵</kbd>
                Seleccionar
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-white/25">
                <kbd className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.06] text-white/30 font-mono">esc</kbd>
                Cerrar
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
