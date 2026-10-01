'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * ContentSwitcher — control de cambio de representación del MISMO contenido.
 *
 * IA (Gestión de Tiendas 2026-10): tabs ≠ modos de visualización. Cuando el
 * usuario ve el mismo conjunto de entidades y solo cambia la representación
 * (gestión completa vs resumen), el patrón correcto es un content/view
 * switcher, no tabs de navegación. Este componente NO reemplaza a Tabs
 * (secciones conceptualmente distintas): los complementa.
 *
 * Semántica WAI-APG "radio group" (la misma que usa ViewSwitcher):
 *   - role="radiogroup" + role="radio" + aria-checked (estado seleccionado
 *     programáticamente comunicable, no depende del color).
 *   - Un único punto de tabulación (roving tabindex) + navegación por
 *     flechas ←/→/↑/↓, Home/End. La selección sigue al foco (activación
 *     automática, estándar para radios).
 *
 * Contraste (FIX-STORE-MGMT-A11Y): el estado seleccionado usa el par de
 * tokens correcto `bg-primary + text-primary-foreground` (nunca
 * `text-foreground`, que en Dark+Performance equivale al fondo → blanco
 * sobre blanco).
 *
 * Reutilizable: recibe items genéricos {value,label,icon}; no conoce dominio.
 */

export interface ContentSwitcherItem<T extends string> {
  value: T;
  label: string;
  icon?: React.ElementType;
  /** Nombre accesible específico del item (si difiere del label visible). */
  ariaLabel?: string;
}

interface ContentSwitcherProps<T extends string> {
  items: readonly ContentSwitcherItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nombre accesible del grupo (obligatorio — describe qué se conmuta). */
  groupLabel: string;
  className?: string;
}

export default function ContentSwitcher<T extends string>({
  items,
  value,
  onChange,
  groupLabel,
  className,
}: ContentSwitcherProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const focusAndSelect = (index: number) => {
    if (items.length === 0) return;
    const next = items[((index % items.length) + items.length) % items.length];
    onChange(next.value);
    refs.current[index]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = Math.max(
      0,
      items.findIndex(i => i.value === value)
    );
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusAndSelect(currentIndex + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusAndSelect(currentIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAndSelect(0);
        break;
      case 'End':
        event.preventDefault();
        focusAndSelect(items.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border shrink-0',
        className
      )}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const isSelected = value === item.value;
        return (
          <button
            key={item.value}
            ref={el => { refs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={item.ariaLabel}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-xs font-black uppercase tracking-widest active:scale-95 min-h-[44px]',
              'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              isSelected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
