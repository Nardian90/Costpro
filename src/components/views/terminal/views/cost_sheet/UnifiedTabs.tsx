'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * P3-5: UnifiedTabs — único componente de tabs para todo el módulo COSTOS.
 *
 * Reemplaza a:
 *   - Radix Tabs (TabsList/TabsTrigger) en CostSheetAuditView y ErrorDetailModal.
 *   - Pills manuales en CostSheetTemplateExplorer (categories System/Private/Public).
 *   - CostSheetMainTabs y GenEasyView tabs (ya usan role=tablist, pero sin variante pills).
 *
 * API:
 *   <UnifiedTabs
 *     tabs={[{ id: 'flags', label: 'Banderas', icon: Flag }, ...]}
 *     activeTab={activeTab}
 *     onTabChange={setActiveTab}
 *     variant="underline"  // o "pills"
 *   />
 *
 * Variantes:
 *   - "underline": tabs con borde inferior (default, estilo CostSheetMainTabs).
 *   - "pills": tabs redondeados en contenedor muted (estilo TemplateExplorer categories).
 *
 * Mobile-first elderly:
 *   - min-h-[44px] en cada tab.
 *   - text-xs mínimo.
 *   - role="tab" + aria-selected.
 *   - Scroll horizontal en mobile si no caben.
 *   - Keyboard: Tab navega, Enter/Space activa (heredado de button nativo).
 */

export type UnifiedTabsVariant = 'underline' | 'pills';

export interface UnifiedTab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Badge numérico opcional (ej: count de anexos) */
  badge?: number;
  /** Deshabilitar el tab */
  disabled?: boolean;
}

interface UnifiedTabsProps {
  tabs: UnifiedTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  variant?: UnifiedTabsVariant;
  /** Aria-label para el tablist */
  ariaLabel?: string;
  /** Clase adicional para el contenedor */
  className?: string;
}

export function UnifiedTabs({
  tabs,
  activeTab,
  onTabChange,
  variant = 'underline',
  ariaLabel = 'Tabs',
  className,
}: UnifiedTabsProps) {
  return (
    <div className={cn('w-full', className)}>
      {/* Desktop: tabs full-width */}
      <div
        className={cn(
          'hidden sm:flex overflow-hidden',
          variant === 'underline'
            ? 'border-b border-border bg-card rounded-t-xl'
            : 'gap-2 p-1.5 bg-muted/40 backdrop-blur-xl rounded-2xl border border-border/50 w-fit'
        )}
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onTabChange(tab.id)}
              className={cn(
                'flex items-center justify-center gap-2 transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed',
                variant === 'underline'
                  ? cn(
                      'flex-1 py-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 -mb-px',
                      isActive
                        ? 'border-primary text-primary bg-primary/5'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    )
                  : cn(
                      'py-2.5 px-5 rounded-xl text-xs font-black uppercase tracking-widest',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                    )
              )}
            >
              {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={cn(
                  'ml-1 px-1.5 py-0.5 rounded text-xs font-mono',
                  variant === 'underline'
                    ? (isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')
                    : (isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground')
                )}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mobile: scroll horizontal */}
      <div
        className={cn(
          'sm:hidden flex overflow-x-auto border-b border-border bg-card sticky top-0 z-10',
          variant === 'pills' && 'gap-2 p-1.5 bg-muted/40 rounded-2xl border border-border/50 w-fit'
        )}
        role="tablist"
        aria-label={ariaLabel}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onTabChange(tab.id)}
              className={cn(
                'flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed',
                variant === 'underline'
                  ? cn(
                      'py-2.5 px-3 text-xs font-black uppercase tracking-widest border-b-2',
                      isActive
                        ? 'border-primary text-primary bg-primary/5'
                        : 'border-transparent text-muted-foreground'
                    )
                  : cn(
                      'py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                    )
              )}
            >
              {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={cn(
                  'ml-1 px-1.5 py-0.5 rounded text-xs font-mono',
                  variant === 'underline'
                    ? (isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')
                    : (isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground')
                )}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default UnifiedTabs;
