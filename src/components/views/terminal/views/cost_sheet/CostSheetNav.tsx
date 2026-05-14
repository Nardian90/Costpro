'use client';

import React from 'react';
import type { CostSheetAnnex, CostSheetData } from '@/types/cost-sheet';
import type { CostSheetViewMode } from './CostSheetModeDropdown';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { Save, Bot, Clock, ArrowLeft } from 'lucide-react';
import { CostSheetOptionsDropdown } from './CostSheetOptionsDropdown';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useUIStore } from '@/store';

interface AutoSaveVersion {
  timestamp: number;
  data: CostSheetData;
  label: string;
}

interface CostSheetNavProps {
  navItems?: unknown[];
  annexes?: CostSheetAnnex[];
  activeSection: string;
  setActiveSection: (id: string) => void;
  viewMode: CostSheetViewMode;
  setViewMode: (mode: CostSheetViewMode) => void;
  layoutMode?: ViewMode;
  setLayoutMode?: (mode: ViewMode) => void;
  onOpenActions?: () => void;
  onImport?: () => void;
  onSave?: () => void;
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  topOffset?: string;
  isEditing?: boolean;
  lastSavedAt?: number | null;
  isSaving?: boolean;
  versions?: AutoSaveVersion[];
  onRestoreVersion?: (v: AutoSaveVersion) => void;
}

const CostSheetNav: React.FC<CostSheetNavProps> = ({
  onSave,
  onExportExcel,
  onExportPdf,
  onImport,
  setActiveSection,
  topOffset,
  layoutMode,
  setLayoutMode,
  isEditing,
  lastSavedAt,
  isSaving,
  versions = [],
  onRestoreVersion
}) => {
  const { setCurrentView } = useUIStore();

  const navActions: Action[] = React.useMemo(() => {
    const actions: Action[] = [
        // 0. Regresar (back to dashboard)
        {
            id: 'back-action',
            label: 'Regresar',
            onClick: () => setCurrentView('dashboard'),
            component: (
                <button
                    onClick={() => setCurrentView('dashboard')}
                    type="button"
                    className="neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-95 transition-all text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl"
                    aria-label="Regresar al tablero principal"
                >
                    <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                </button>
            ),
            tooltip: "Regresar"
        },

        // 1. Guardar (Acción crítica inmediata)
        {
            id: 'save-action',
            label: 'Guardar',
            onClick: onSave || (() => {}),
            component: (
                <button
                    onClick={onSave || (() => {})}
                    type="button"
                    className="neu-raised-sm px-4 h-11 flex items-center justify-center gap-2 shrink-0 active:scale-95 transition-all text-primary font-black uppercase tracking-widest text-[10px] hover:bg-primary/10 rounded-xl"
                    aria-label="Guardar ficha de costo"
                >
                    <Save className="w-4 h-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{isSaving ? 'Guardando...' : 'Guardar'}</span>
                </button>
            ),
            tooltip: "Guardar Ficha"
        },

        // 2. Exportar / Opciones (Dropdown simplificado)
        {
            id: 'options-dropdown',
            label: '',
            onClick: () => {},
            component: (
                <CostSheetOptionsDropdown
                    onImport={onImport || (() => {})}
                    onSave={onSave || (() => {})}
                    onExportExcel={onExportExcel || (() => {})}
                    onExportPdf={onExportPdf || (() => {})}
                    onOpenAudit={() => setActiveSection('audit')}
                />
            )
        },

        // 3. Darian AI (Acción crítica)
        {
            id: 'darian-ai',
            label: 'Darian',
            onClick: () => setActiveSection('ai-chat'),
            component: (
                <button
                    onClick={() => setActiveSection('ai-chat')}
                    type="button"
                    className="neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-95 transition-all text-primary hover:bg-primary/10 rounded-xl"
                    aria-label="Abrir asistente Darian AI"
                >
                    <Bot className="w-5 h-5" aria-hidden="true" />
                </button>
            ),
            tooltip: "Darian AI Expert"
        },

        // 4. Historial / Auto-save status
        {
            id: 'history-popover',
            label: 'Historial',
            onClick: () => {},
            component: (
                <div className="flex items-center gap-2">
                    {lastSavedAt && (
                        <span className="hidden lg:block text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                            Guardado {formatDistanceToNow(lastSavedAt, { addSuffix: true, locale: es })}
                        </span>
                    )}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                className="neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-95 transition-all text-muted-foreground hover:bg-muted/10 rounded-xl"
                                aria-label="Historial de versiones autoguardadas"
                                type="button"
                            >
                                <Clock className="w-5 h-5" aria-hidden="true" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0 rounded-3xl border-sidebar-border overflow-hidden bg-card" align="end">
                            <div className="p-4 border-b border-sidebar-border/50 bg-sidebar/30">
                                <h4 className="text-xs font-black uppercase tracking-widest">Historial de Autoguardado</h4>
                                <p className="text-[10px] text-muted-foreground font-medium">Últimas 15 capturas automáticas</p>
                            </div>
                            <div className="max-h-64 overflow-y-auto p-2">
                                {versions.length === 0 ? (
                                    <div className="p-8 text-center text-xs text-muted-foreground font-medium">No hay versiones aún</div>
                                ) : (
                                    versions.map((v, i) => (
                                        <button
                                            key={i}
                                            onClick={() => onRestoreVersion?.(v)}
                                            className="w-full text-left p-3 rounded-2xl hover:bg-muted/50 transition-colors flex items-center justify-between group"
                                            aria-label={`Restaurar versión: ${v.label || 'Captura automática'}`}
                                        >
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-bold">{v.label || 'Captura automática'}</span>
                                                <span className="text-[10px] text-muted-foreground font-medium">
                                                    {formatDistanceToNow(v.timestamp, { addSuffix: true, locale: es })}
                                                </span>
                                            </div>
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black uppercase tracking-widest rounded-lg">Restaurar</Button>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            )
        }

    ];

    // 5. ViewSwitcher (tarjeta ↔ tabla) — inside the action menu after clock
    if (layoutMode !== undefined && setLayoutMode) {
      actions.push({
        id: 'view-switcher',
        label: 'Vista',
        onClick: () => {},
        component: (
          <ViewSwitcher
            currentView={layoutMode}
            onViewChange={setLayoutMode}
          />
        )
      });
    }

    return actions;
  }, [onSave, onExportExcel, onExportPdf, onImport, setActiveSection, isSaving, lastSavedAt, versions, onRestoreVersion, layoutMode, setLayoutMode, setCurrentView]);

  return (
    <div className="mb-0 flex items-center gap-3">
      <ActionMenu
        actions={navActions}
        topOffset={topOffset}
        sticky={false}
        className="!z-10 shadow-none bg-transparent !p-0 flex-1 min-w-0"
      />
    </div>
  );
};

export default CostSheetNav;
