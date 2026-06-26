'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { FolderOpen, FileText, LayoutGrid, Paperclip } from 'lucide-react';

import { useTranslations } from 'next-intl';
/**
 * C2-C6: Sistema de tabs para Tablero Principal del módulo COSTOS.
 *
 * Reemplaza la navegación dispersa anterior (kpis, header, main, all-annexes,
 * signature como secciones separadas) por 4 tabs claros alineados al flujo de
 * trabajo del usuario:
 *
 *   1. Explorador de Plantillas — elegir template base (antes en menú izquierdo)
 *   2. Datos Generales         — header de la ficha (antes sección 'header')
 *   3. Estructura de Costos    — secciones + filas + cálculos (antes 'main')
 *   4. Anexos                  — anexos expandidos + firmas (combina 'all-annexes' + 'signature')
 *
 * Mobile-first elderly:
 *   - Mínimo 44px de alto (min-h-[44px])
 *   - Texto text-xs (12px) mínimo
 *   - role="tab" + aria-selected para lectores de pantalla
 *   - Scroll horizontal en mobile si no caben
 *   - Indicador visual claro del tab activo (border-primary + bg-primary/5)
 */

export type CostMainTab = 'templates' | 'general' | 'structure' | 'annexes';

interface CostSheetMainTabsProps {
  activeTab: CostMainTab;
  onTabChange: (tab: CostMainTab) => void;
  /** Número de anexos para mostrar badge informativo en el tab Anexos */
  annexCount?: number;
}

const TABS: { id: CostMainTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'templates', label: 'Plantillas', icon: FolderOpen },
  { id: 'general', label: 'Datos Generales', icon: FileText },
  { id: 'structure', label: 'Estructura de Costos', icon: LayoutGrid },
  { id: 'annexes', label: 'Anexos', icon: Paperclip },
];

export function CostSheetMainTabs({ activeTab, onTabChange, annexCount = 0 }: CostSheetMainTabsProps) {
  const t = useTranslations('costSheet');
  return (
    <div className="w-full">
      {/* Desktop: tabs centrados con borde inferior */}
      <div
        className="hidden sm:flex border-b border-border bg-card rounded-t-xl overflow-hidden"
        role="tablist"
        aria-label="Secciones del Tablero Principal de Costos"
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px min-h-[44px]",
                isActive
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{tab.label}</span>
              {tab.id === 'annexes' && annexCount > 0 && (
                <span className={cn(
                  "ml-1 px-1.5 py-0.5 rounded text-xs font-mono",
                  isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {annexCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mobile: scroll horizontal con tabs más compactos */}
      <div
        className="sm:hidden flex overflow-x-auto border-b border-border bg-card sticky top-0 z-10"
        role="tablist"
        aria-label="Secciones del Tablero Principal de Costos"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-black uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap min-h-[44px]",
                isActive
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground"
              )}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{tab.label}</span>
              {tab.id === 'annexes' && annexCount > 0 && (
                <span className={cn(
                  "ml-1 px-1.5 py-0.5 rounded text-xs font-mono",
                  isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {annexCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CostSheetMainTabs;
