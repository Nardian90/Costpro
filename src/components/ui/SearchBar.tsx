'use client';

import React, { useState } from 'react';
import { Search, Settings2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  children?: React.ReactNode; // Content for advanced filters
  showSettings?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  onClear,
  placeholder = 'Buscar...',
  className,
  children,
  showSettings = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClear = () => {
    onChange('');
    if (onClear) onClear();
  };

  return (
    <div className={cn('w-full space-y-3', className)}>
      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
          <Search className="w-5 h-5" />
        </div>

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="neu-input w-full pl-12 pr-24 py-3.5 text-base sm:text-lg transition-all"
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button
              onClick={handleClear}
              className="p-2 text-muted-foreground hover:text-danger transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/5"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {showSettings && children && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "p-2.5 transition-all rounded-xl",
                isExpanded
                  ? "neu-inset-sm text-primary"
                  : "text-muted-foreground hover:text-primary hover:neu-raised-sm"
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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="neu-card !p-4 border-primary/10 bg-background/50 backdrop-blur-sm">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Settings2 className="w-3 h-3" />
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
