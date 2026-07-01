'use client';

import React, { useState, useEffect } from 'react';
import { Search, Settings2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, isPerformanceTheme } from '@/lib/utils';
import { useTheme } from 'next-themes';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  /** POS-2 MM-2: Se dispara al presionar Enter en el input. Si el handler
   * retorna true, el SearchBar se limpia automáticamente (comportamiento
   * típico de escáner: escaneas → se agrega → se limpia para el siguiente). */
  onSubmit?: (value: string) => boolean | void;
  placeholder?: string;
  className?: string;
  children?: React.ReactNode; // Content for advanced filters
  showSettings?: boolean;
  /** POS-2 MM-1/MM-2: ID explícito para foco programático desde atajos. */
  inputId?: string;
  'aria-label'?: string;
  'aria-busy'?: boolean;
  'aria-controls'?: string;
  'aria-autocomplete'?: 'inline' | 'list' | 'both' | 'none';
  'aria-expanded'?: boolean;
  'role'?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value: externalValue,
  onChange,
  onClear,
  onSubmit,
  placeholder = 'Buscar...',
  className,
  children,
  showSettings = true,
  inputId,
  'aria-label': ariaLabel,
  'aria-busy': ariaBusy,
  'aria-controls': ariaControls,
  'aria-autocomplete': ariaAutocomplete,
  'aria-expanded': ariaExpanded,
  'role': role,
}) => {
  const { theme } = useTheme();
  const [localValue, setLocalValue] = useState(externalValue);
  const [isExpanded, setIsExpanded] = useState(false);

  // POS-3b audit P1.2: debounce movido a usePOSServerSearch (hook consumidor).
  // Antes había doble debounce efectivo ~500ms: este setTimeout (300ms) +
  // el de usePOSServerSearch (200ms). Ahora SearchBar solo actualiza el estado
  // local y propaga inmediatamente al onChange. El consumidor decide si debouncing.
  // Si un consumidor necesita debouncing, debe usar useDebounce de hooks/ui/useDebounce.ts
  // en su lado (ver usePOSServerSearch.ts).

  // Sync local value with external value (e.g. if cleared by parent)
  useEffect(() => {
    setLocalValue(externalValue);
  }, [externalValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    // Propagar inmediatamente (sin debounce local).
    // Si el consumidor necesita debounce, lo implementa en su hook.
    onChange(newValue);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
    if (onClear) onClear();
  };

  // POS-2 MM-2: Enter en el input → onSubmit. Si retorna true, limpiar.
  // Comportamiento de escáner: escaneas → Enter → se agrega → se limpia para el siguiente.
  const handleSubmit = () => {
    const trimmed = localValue.trim();
    if (!trimmed || !onSubmit) return;
    const shouldClear = onSubmit(trimmed);
    if (shouldClear) {
      // Limpiar inmediatamente
      setLocalValue('');
      onChange('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // POS-3b audit P1.2: cleanup de timeout eliminado (ya no hay setTimeout local).

  return (
    <div className={cn('w-full space-y-3', className)}>
      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
          <Search className="w-5 h-5" />
        </div>

        <input
          id={inputId}
          type="text"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-busy={ariaBusy}
          aria-controls={ariaControls}
          aria-autocomplete={ariaAutocomplete}
          aria-expanded={ariaExpanded}
          role={role}
          className={cn(
            "w-full !pl-12 !pr-24 !py-3.5 text-base sm:text-lg transition-all outline-none rounded-xl border border-border bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 shadow-sm"
          )}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {localValue && (
            <button
              type="button"
              onClick={handleClear}
              className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-full hover:bg-muted"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {showSettings && children && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "p-2.5 transition-all rounded-xl border",
                isExpanded
                  ? "bg-primary/5 text-primary border-primary/20"
                  : "text-muted-foreground hover:text-primary border-transparent hover:bg-muted"
              )}
              aria-label="Filtros avanzados"
            >
              <Settings2 className={cn("w-5 h-5 transition-transform duration-300", isExpanded && "rotate-90")} />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && children && (
          <motion.div
            initial={isPerformanceTheme(theme) ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={isPerformanceTheme(theme) ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={isPerformanceTheme(theme) ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
              <div className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Filtros Avanzados
              </div>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchBar;
