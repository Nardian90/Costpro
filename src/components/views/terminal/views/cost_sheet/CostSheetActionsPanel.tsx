'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X as XIcon, FileText, Trash2, Upload, Save, FileSpreadsheet,
  Download, Settings, Table2, LayoutGrid, ChevronDown,
  BarChart3, Layout, ListFilter, PenTool, Zap, Wand2,
  BookOpen, Eye, Activity, Sparkles, FolderOpen, Bot, HelpCircle, Calculator,
  LifeBuoy, GraduationCap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import ViewSwitcher, { ViewMode as LayoutViewMode } from '@/components/ui/ViewSwitcher';
import { CostSheetViewMode } from './CostSheetModeDropdown';

interface ActionItem {
  id: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'outline';
  disabled?: boolean;
}

interface CostSheetActionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  actions: ActionItem[];
  layoutMode: LayoutViewMode;
  setLayoutMode: (mode: LayoutViewMode) => void;
  // New props for better integration
  activeSection?: string;
  setActiveSection?: (id: string) => void;
  viewMode?: CostSheetViewMode;
  setViewMode?: (mode: CostSheetViewMode) => void;
  onOpenSections?: () => void;
  onOpenAnnexes?: () => void;
  onOpenHelp?: () => void;
  onOpenSystemHelp?: () => void;
  onOpenAcademy?: () => void;
  onQuickGenerate?: () => void;
  onExpertGenerate?: () => void;
}

const AccordionGroup = ({
  title,
  icon: Icon,
  children,
  isOpen,
  onToggle
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  return (
    <div className="border-b border-sidebar-border/50 last:border-0">
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between p-4 transition-colors",
          isOpen ? "bg-primary/5 text-[#00FF00]" : "text-[#00FF00]/60 hover:bg-[#00FF00]/5 hover:text-[#00FF00]"
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">{title}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 opacity-50" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="p-2 space-y-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const CostSheetActionsPanel: React.FC<CostSheetActionsPanelProps> = ({
  isOpen,
  onClose,
  actions,
  layoutMode,
  setLayoutMode,
  activeSection,
  setActiveSection,
  viewMode,
  setViewMode,
  onOpenSections,
  onOpenAnnexes,
  onOpenHelp,
  onOpenSystemHelp,
  onOpenAcademy,
  onQuickGenerate,
  onExpertGenerate
}) => {
  const [openGroups, setOpenGroups] = useState<string[]>(['ficha']);

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(g => g !== groupId)
        : [...prev, groupId]
    );
  };

  const handleAction = (onClick: () => void) => {
    onClick();
    if (window.innerWidth < 1024) onClose();
  };

  const actionMap = actions.reduce((acc, action) => {
    acc[action.id] = action;
    return acc;
  }, {} as Record<string, ActionItem>);

  const renderActionButton = (id: string, label: string, icon: React.ElementType, onClick?: () => void, variant?: any, isActive?: boolean) => {
    const action = actionMap[id];
    const finalOnClick = onClick || (action ? action.onClick : () => {});
    const Icon = icon || (action ? action.icon : Settings);
    const finalVariant = variant || (action ? action.variant : 'outline');

    return (
      <button
        key={id}
        onClick={() => handleAction(finalOnClick)}
        className={cn(
          "w-full flex items-center gap-3 p-3 rounded-xl transition-all group active:scale-95 text-left",
          isActive
            ? "bg-[#00FF00]/10 text-[#00FF00] font-bold shadow-sm"
            : "hover:bg-[#00FF00]/5 text-[#00FF00]/70 hover:text-[#00FF00]",
          finalVariant === 'danger' && "hover:bg-danger/10 text-danger",
          finalVariant === 'success' && "hover:bg-success/10 text-success"
        )}
      >
        <Icon className={cn(
          "w-4 h-4 transition-colors",
          isActive ? "text-[#00FF00]" : "group-hover:text-[#00FF00]"
        )} />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </button>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[90] lg:hidden"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "fixed right-0 top-0 h-screen w-80 bg-sidebar/95 backdrop-blur-2xl border-l border-sidebar-border shadow-2xl z-[100] flex flex-col overflow-hidden"
            )}
          >
            {/* Header */}
            <div className="p-6 border-b border-sidebar-border/50 flex items-center justify-between bg-sidebar/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#00FF00]/10">
                  <Settings className="w-5 h-5 text-[#00FF00]" />
                </div>
                <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00FF00] block">Panel de Control</span>
                    <span className="text-[8px] font-bold uppercase tracking-[0.4em] text-[#00FF00]/50">v5.7.25</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-[#00FF00]/10 text-[#00FF00] transition-colors active:scale-95"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar">

              <AccordionGroup
                title="Ficha y Navegación"
                icon={LayoutGrid}
                isOpen={openGroups.includes('ficha')}
                onToggle={() => toggleGroup('ficha')}
              >
                {renderActionButton('kpis', 'Tablero', BarChart3, () => setActiveSection?.('kpis'), 'outline', activeSection === 'kpis')}
                {renderActionButton('header', 'Encabezado', Layout, () => setActiveSection?.('header'), 'outline', activeSection === 'header')}
                {renderActionButton('open-sections', 'Secciones', ListFilter, onOpenSections)}
                {renderActionButton('open-annexes', 'Anexo', FileSpreadsheet, onOpenAnnexes)}
                {renderActionButton('signature', 'Firmas', PenTool, () => setActiveSection?.('signature'), 'outline', activeSection === 'signature')}
                {renderActionButton('all-content', 'Vista Consolidada', Zap, () => setActiveSection?.('all-content'), 'outline', activeSection === 'all-content')}
                {renderActionButton('expert-content', 'Experto', Zap, () => setActiveSection?.('expert-content'), 'outline', activeSection === 'expert-content')}
              </AccordionGroup>

              <AccordionGroup
                title="Modos de Visualización"
                icon={Eye}
                isOpen={openGroups.includes('modos')}
                onToggle={() => toggleGroup('modos')}
              >
                {renderActionButton('mode-expert', 'Completo', Table2, () => setViewMode?.('expert'), 'outline', viewMode === 'expert')}
                {renderActionButton('mode-assisted', 'Asistido', Wand2, () => setViewMode?.('assisted'), 'outline', viewMode === 'assisted')}
                {renderActionButton('mode-reading', 'Resumido', BookOpen, () => setViewMode?.('reading'), 'outline', viewMode === 'reading')}
                {renderActionButton('mode-preview', 'Vistazo', Eye, () => setViewMode?.('preview'), 'outline', viewMode === 'preview')}
                {renderActionButton('mode-audit', 'Audit', Activity, () => setViewMode?.('audit'), 'outline', viewMode === 'audit')}
              </AccordionGroup>

              <AccordionGroup
                title="Inteligencia y Generación"
                icon={Sparkles}
                isOpen={openGroups.includes('generacion')}
                onToggle={() => toggleGroup('generacion')}
              >
                {renderActionButton('ai-chat', 'Darian AI', Bot, () => setActiveSection?.('ai-chat'), 'primary', activeSection === 'ai-chat')}
                {renderActionButton('quick-gen', 'Generar Rápida', Sparkles, onQuickGenerate)}
                {renderActionButton('expert-gen', 'Generar Experta', Zap, onExpertGenerate)}
                {renderActionButton('massive-gen', 'Generación Masiva', FileText, () => setActiveSection?.('massive-gen'), 'outline', activeSection === 'massive-gen')}
              </AccordionGroup>

              <AccordionGroup
                title="Gestión y Plantillas"
                icon={FolderOpen}
                isOpen={openGroups.includes('gestion')}
                onToggle={() => toggleGroup('gestion')}
              >
                {renderActionButton('templates', 'Explorar Plantillas', FolderOpen, () => setActiveSection?.('templates'), 'outline', activeSection === 'templates')}
                {renderActionButton('load-example', 'Cargar Ejemplo', FileText)}
                {renderActionButton('export-json', 'Guardar (JSON)', Save)}
                {renderActionButton('import-json', 'Importar JSON', Upload)}
                {renderActionButton('reset', 'Reiniciar Ficha', Trash2, undefined, 'danger')}
              </AccordionGroup>

              <AccordionGroup
                title="Exportación y Formato"
                icon={Download}
                isOpen={openGroups.includes('export')}
                onToggle={() => toggleGroup('export')}
              >
                <div className="px-3 py-4 space-y-4 bg-primary/5 rounded-xl mb-2 mx-2 border border-[#00FF00]/10">
                   <div className="text-[8px] font-black text-[#00FF00]/70 tracking-[0.4em] uppercase">
                      Modo de Diseño
                   </div>
                   <ViewSwitcher
                     currentView={layoutMode}
                     onViewChange={setLayoutMode}
                     className="w-full bg-background border-border"
                   />
                </div>
                {renderActionButton('export-excel', 'Exportar Excel', FileSpreadsheet, undefined, 'primary')}
                {renderActionButton('export-pdf', 'Exportar PDF', Download, undefined, 'success')}
              </AccordionGroup>

              <AccordionGroup
                title="Soporte y Herramientas"
                icon={HelpCircle}
                isOpen={openGroups.includes('soporte')}
                onToggle={() => toggleGroup('soporte')}
              >
                {renderActionButton('calculator', 'Calculadora Pro', Calculator)}
                {renderActionButton('help', 'Ayuda de esta vista', HelpCircle, onOpenHelp)}
                {renderActionButton('system-help', 'Ayuda del sistema', LifeBuoy, onOpenSystemHelp)}
                {renderActionButton('academy', 'Academia', GraduationCap, onOpenAcademy)}
              </AccordionGroup>

            </div>

            {/* Footer */}
            <div className="p-6 border-t border-sidebar-border/50 bg-sidebar/5">
               <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#00FF00]/50 text-center">
                  Soporte: info@costpro.app
               </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
