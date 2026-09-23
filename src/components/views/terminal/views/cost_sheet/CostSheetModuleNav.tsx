'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Zap, PenTool, Layers, BarChart3, Swords,
  Save, Upload, FileSpreadsheet, FileText, FileJson,
} from 'lucide-react';

import { CostSheetModeDropdown, CostSheetViewMode } from './CostSheetModeDropdown';

/**
 * GATE 1.4R.1 — NAVEGACIÓN DE SEGUNDO NIVEL DEL MÓDULO FICHAS DE COSTO
 * (mandato §4-§7, §15, §16, §20, §25)
 *
 * Reemplaza la navegación implícita del módulo por una barra SIEMPRE visible:
 *
 *   Fichas de Costo
 *   ├── Generar            → gen-easy      (generación rápida/fácil)
 *   ├── Experto            → main          (ex "Tablero Principal": Plantillas /
 *   │                                        Datos Generales / Estructura / Anexos)
 *   ├── Generación Masiva  → massive-gen
 *   ├── Análisis de Fichas → cost-analytics
 *   └── Arena FC           → arena-fc      (beta)
 *
 * CONTEXTO DE FICHA ABIERTA (scope Experto): segunda fila con el control
 * [Modo ▼] y la ZONA DE ACCIONES
 * [Guardar Ficha][Exportar JSON][Importar JSON][Exportar Excel][Exportar PDF].
 * C2-C: "Guardar Ficha" persiste en Supabase; "Exportar JSON" descarga un
 * archivo local — operaciones separadas y honestas (mandato C2 §15-§18).
 *
 * REUTILIZACIÓN (mandato §21): este componente NO duplica lógica — solo navega
 * (setActiveCostSection) y dispara handlers existentes de useCostSheetActions.
 * Es código nuevo porque esa capacidad NO tenía mecanismo de acceso (GATE 1:
 * el dropdown de modos era código muerto y no existía barra de módulo).
 *
 * Mobile-first: tabs con scroll horizontal, targets ≥44px, sin labels truncados.
 */

export interface CostSheetModuleTab {
  id: string;
  label: string;
  ariaLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  isBeta?: boolean;
}

const MODULE_TABS: CostSheetModuleTab[] = [
  { id: 'gen-easy', label: 'Generar', ariaLabel: 'Generar fichas: generación rápida o masiva', icon: Zap },
  { id: 'main', label: 'Experto', ariaLabel: 'Experto: espacio completo de trabajo de la ficha (Plantillas, Datos Generales, Estructura de Costos y Anexos)', icon: PenTool },
  { id: 'massive-gen', label: 'Masiva', ariaLabel: 'Generación Masiva de fichas desde Excel o inventario', icon: Layers },
  { id: 'cost-analytics', label: 'Análisis', ariaLabel: 'Análisis de Fichas: tablero dinámico de costos', icon: BarChart3 },
  { id: 'arena-fc', label: 'Arena FC', ariaLabel: 'Arena FC: comparar fichas de costo lado a lado (beta)', icon: Swords, isBeta: true },
];

/** Secciones que NO están dentro del espacio de trabajo de una ficha (Experto). */
const NON_FICHA_SECTIONS = new Set([
  'gen-easy', 'gen-quick', 'gen-expert', // Generar (+ legacy)
  'massive-gen',                          // Generación Masiva
  'cost-analytics',                       // Análisis de Fichas
  'arena-fc',                             // Arena FC
  'steel-calculator',                     // herramienta contextual
]);

/**
 * Mapea una sección técnica del módulo al tab de segundo nivel que la contiene.
 * Exportado para que MobileTabBar comparta la MISMA arquitectura (mandato §25:
 "no crear una IA diferente").
 */
export function moduleTabForCostSection(activeSection: string): string {
  if (NON_FICHA_SECTIONS.has(activeSection)) return activeSection;
  // Todo lo demás pertenece al espacio Experto (main, templates, header,
  // general, all-content, all-annexes, annex-*, signature, kpis, audit,
  // ai-chat, view-assisted, view-reading…).
  return 'main';
}

interface CostSheetModuleNavProps {
  activeSection: string;
  onNavigate: (section: string) => void;
  /** Contexto de ficha abierta (solo se muestra dentro del scope Experto). */
  fichaContext?: {
    viewMode: CostSheetViewMode;
    setViewMode: (mode: CostSheetViewMode) => void;
    /** C2-C: persiste la ficha en cost_sheets (Supabase). */
    onSave: () => void;
    onImport: () => void;
    onExportExcel: () => void;
    onExportPdf: () => void;
    /** C2-C: descarga la ficha como archivo JSON (independiente de Guardar). */
    onExportJson?: () => void;
    /** Estado de la PERSISTENCIA real (no del autosave local). */
    isSaving?: boolean;
  };
}

export function CostSheetModuleNav({
  activeSection,
  onNavigate,
  fichaContext,
}: CostSheetModuleNavProps) {
  const activeTab = moduleTabForCostSection(activeSection);
  const showFichaBar = !!fichaContext && !NON_FICHA_SECTIONS.has(activeSection);

  return (
    <div className="w-full max-w-6xl mx-auto px-2 sm:px-0">
      {/* ── Nivel 2: tabs del módulo ─────────────────────────────────── */}
      <div
        className="flex overflow-x-auto border-b border-border bg-card rounded-t-xl"
        role="tablist"
        aria-label="Secciones del módulo Fichas de Costo"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {MODULE_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={tab.ariaLabel}
              onClick={() => onNavigate(tab.id)}
              className={cn(
                "flex items-center justify-center gap-1.5 py-3 px-3 sm:px-4 text-xs font-black uppercase tracking-widest transition-colors border-b-2 -mb-px whitespace-nowrap min-h-[44px] flex-1",
                isActive
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
              {tab.isBeta && (
                <span className="text-[9px] font-black uppercase tracking-widest px-1 py-0.5 rounded-md bg-primary/15 text-primary">Beta</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Contexto de ficha abierta: Modo + Acciones (mandato §15/§16) ── */}
      {showFichaBar && fichaContext && (
        <div
          className="flex items-center gap-2 sm:gap-3 px-1 py-2 bg-card/60 border-b border-border/60 overflow-x-auto"
          aria-label="Modo y acciones de la ficha"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <CostSheetModeDropdown
            viewMode={fichaContext.viewMode}
            setViewMode={fichaContext.setViewMode}
          />

          <div className="w-px h-6 bg-border/60 shrink-0" aria-hidden="true" />

          {/* ZONA DE ACCIONES — C2-C: Guardar ≠ Exportar JSON (mandato §15-§18) */}
          <button
            type="button"
            onClick={fichaContext.onSave}
            disabled={fichaContext.isSaving}
            className="flex items-center gap-1.5 px-3 h-11 min-h-[44px] rounded-xl shrink-0 active:scale-[0.98] transition-all text-xs font-black uppercase tracking-widest bg-primary/10 text-primary hover:bg-primary/15 border border-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Guardar ficha: persiste la ficha actual en tu librería (Supabase)"
          >
            <Save className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{fichaContext.isSaving ? 'Guardando…' : 'Guardar Ficha'}</span>
          </button>

          <button
            type="button"
            onClick={fichaContext.onExportJson}
            className="flex items-center gap-1.5 px-3 h-11 min-h-[44px] rounded-xl shrink-0 active:scale-[0.98] transition-all text-xs font-black uppercase tracking-widest text-foreground/80 hover:text-foreground hover:bg-muted/50 border border-border/60"
            aria-label="Exportar JSON: descarga la ficha actual como archivo local"
          >
            <FileJson className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Exportar JSON</span>
          </button>

          <button
            type="button"
            onClick={fichaContext.onImport}
            className="flex items-center gap-1.5 px-3 h-11 min-h-[44px] rounded-xl shrink-0 active:scale-[0.98] transition-all text-xs font-black uppercase tracking-widest text-foreground/80 hover:text-foreground hover:bg-muted/50 border border-border/60"
            aria-label="Importar JSON: carga un archivo JSON de una ficha existente"
          >
            <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Importar JSON</span>
          </button>

          <button
            type="button"
            onClick={fichaContext.onExportExcel}
            className="flex items-center gap-1.5 px-3 h-11 min-h-[44px] rounded-xl shrink-0 active:scale-[0.98] transition-all text-xs font-black uppercase tracking-widest text-foreground/80 hover:text-foreground hover:bg-muted/50 border border-border/60"
            aria-label="Exportar ficha a Excel"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Exportar Excel</span>
          </button>

          <button
            type="button"
            onClick={fichaContext.onExportPdf}
            className="flex items-center gap-1.5 px-3 h-11 min-h-[44px] rounded-xl shrink-0 active:scale-[0.98] transition-all text-xs font-black uppercase tracking-widest text-foreground/80 hover:text-foreground hover:bg-muted/50 border border-border/60"
            aria-label="Exportar ficha a PDF"
          >
            <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Exportar PDF</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default CostSheetModuleNav;
