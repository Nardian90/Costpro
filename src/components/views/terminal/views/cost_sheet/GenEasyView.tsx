'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Zap, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import CostSheetQuickMode from './CostSheetQuickMode';
import CostSheetMassiveGenerator from './CostSheetMassiveGenerator';

/**
 * B4: Vista "Generar fácil" — reemplaza al grupo "Generación" del sidebar.
 *
 * Muestra 2 tabs internos:
 *   1. Generación Rápida  → CostSheetQuickMode (cálculo express de precios)
 *   2. Generación Experta → CostSheetMassiveGenerator (masiva desde Excel/inventario)
 *
 * Mobile-first elderly:
 *   - Mínimo 44px de alto (min-h-[44px]) en cada tab.
 *   - Texto text-xs (12px) mínimo.
 *   - role="tab" + aria-selected para lectores de pantalla.
 *   - Scroll horizontal en mobile si no caben.
 *   - Indicador visual claro del tab activo (border-primary + bg-primary/5).
 */

export type GenEasyTab = 'quick' | 'expert';

interface GenEasyViewProps {
  /** Generación rápida: productos pre-seleccionados y mapping inicial */
  quickModeProducts?: any[];
  quickModeMapping?: any;
  onGenerate?: (rows: any[]) => void;
  onMappingChange?: (mapping: any) => void;
}

const TABS: { id: GenEasyTab; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  {
    id: 'quick',
    label: 'Generación Rápida',
    icon: Zap,
    description: 'Calcula precios en segundos',
  },
  {
    id: 'expert',
    label: 'Generación Experta',
    icon: Wand2,
    description: 'Masiva desde Excel o inventario',
  },
];

export function GenEasyView({
  quickModeProducts,
  quickModeMapping,
  onGenerate,
  onMappingChange,
}: GenEasyViewProps) {
  const t = useTranslations('costSheet');
  const [activeTab, setActiveTab] = useState<GenEasyTab>('quick');
  const [isQuickModeGenerating, setIsQuickModeGenerating] = useState(false);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
          <Zap className="w-8 h-8" />
          Generar fácil
        </h1>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
          Crea fichas de costo de forma rápida o masiva
        </p>
      </div>

      {/* Tabs internos: Rápida / Experta */}
      <div className="w-full">
        {/* Desktop: tabs centrados con borde inferior */}
        <div
          className="hidden sm:flex border-b border-border bg-card rounded-t-xl overflow-hidden"
          role="tablist"
          aria-label="Modos de generación de fichas"
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
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px min-h-[44px]",
                  isActive
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile: scroll horizontal con tabs compactos */}
        <div
          className="sm:hidden flex overflow-x-auto border-b border-border bg-card sticky top-0 z-10"
          role="tablist"
          aria-label="Modos de generación de fichas"
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
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-black uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap min-h-[44px]",
                  isActive
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground"
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Descripción del tab activo */}
        <div className="px-1 py-2 text-xs text-muted-foreground italic">
          {TABS.find(tab => tab.id === activeTab)?.description}
        </div>
      </div>

      {/* Contenido del tab activo */}
      <div className="pt-2">
        {activeTab === 'quick' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isQuickModeGenerating ? (
              <div className="max-w-5xl mx-auto">
                <div className="mb-4 flex justify-start">
                  <button
                    type="button"
                    onClick={() => setIsQuickModeGenerating(false)}
                    className="rounded-xl font-bold uppercase tracking-widest text-xs text-muted-foreground hover:text-primary h-11 min-h-[44px] px-4"
                  >
                    ← Volver a Lista
                  </button>
                </div>
                <CostSheetMassiveGenerator
                  isSection={true}
                  initialProducts={quickModeProducts || undefined}
                  initialMapping={quickModeMapping}
                  onClose={() => setIsQuickModeGenerating(false)}
                  autoStart={true}
                  isQuickAction={true}
                />
              </div>
            ) : (
              <CostSheetQuickMode
                onGenerate={(rows: any[]) => {
                  setIsQuickModeGenerating(true);
                  onGenerate?.(rows);
                }}
                mapping={(quickModeMapping as any) || { targetColumn: 'sale_price' as const, modificationRow: '2' }}
                onMappingChange={(m: any) => onMappingChange?.(m)}
              />
            )}
          </div>
        )}

        {activeTab === 'expert' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CostSheetMassiveGenerator
              isSection={true}
              initialProducts={quickModeProducts || undefined}
              initialMapping={quickModeMapping}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default GenEasyView;
