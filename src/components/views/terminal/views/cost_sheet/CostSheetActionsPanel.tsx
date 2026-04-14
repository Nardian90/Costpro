'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X as XIcon, Search, FileText, Trash2, Upload, Save, FileSpreadsheet,
  Download, Settings, Table2, LayoutGrid, ChevronDown,
  BarChart3, Layout, ListFilter, PenTool, Zap, Wand2,
  BookOpen, Eye, Activity, Sparkles, FolderOpen, Bot, HelpCircle, Calculator,
  LifeBuoy, GraduationCap, Scale
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
  onToggle,
  isVisible = true,
  isSearchActive = false
}: {
  isVisible?: boolean;
  isSearchActive?: boolean;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  if (!isVisible) return null;

  return (
    <div className="border-b border-sidebar-border/50 last:border-0">
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between p-4 transition-colors",
          isOpen ? "bg-primary/5 text-sidebar-foreground" : "text-sidebar-foreground/60 hover:bg-primary/5 hover:text-sidebar-foreground"
        )}
        aria-expanded={isOpen}
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
        {(isOpen || isSearchActive) && (
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
  const [searchTerm, setSearchTerm] = useState('');

  const hasMatchingActions = (labels: string[]) => {
    if (!searchTerm) return true;
    return labels.some(label => label.toLowerCase().includes(searchTerm.toLowerCase()));
  };



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
          "w-full flex items-center gap-4 p-3.5 rounded-xl transition-all group active:scale-95 text-left mb-1",
          isActive
            ? "bg-primary text-foreground shadow-lg shadow-primary/20 font-black"
            : "hover:bg-primary/5 text-sidebar-foreground/70 font-bold",
          finalVariant === 'danger' && "hover:bg-danger/10 text-danger",
          finalVariant === 'success' && "hover:bg-success/10 text-success"
        )}
      >
        <Icon className={cn("w-4.5 h-4.5", isActive ? "text-foreground" : "group-hover:text-sidebar-foreground transition-colors")} />
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
              "fixed right-0 top-0 h-screen w-80 bg-sidebar/90 backdrop-blur-2xl border-l border-sidebar-border shadow-2xl z-[100] flex flex-col overflow-hidden"
            )}
          >
            {/* Header */}
            <div className="p-6 border-b border-sidebar-border/50 flex items-center justify-between bg-sidebar/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-sidebar-foreground block">Panel de Control</span>
                    <span className="text-[8px] font-bold uppercase tracking-[0.4em] text-sidebar-foreground/50">v5.8.0</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-primary/10 text-primary transition-colors active:scale-95"
                aria-label="Cerrar panel de control"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="px-6 py-4 shrink-0 border-b border-sidebar-border/30 bg-sidebar/5">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-foreground/50 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="BUSCAR ACCIÓN..."
                  className="w-full h-11 bg-background/50 border border-primary/10 rounded-xl pl-9 pr-4 text-xs font-black focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-[0.2em] placeholder:text-muted-foreground/30"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar">

              <AccordionGroup
                title="Ficha y Navegación"
                isVisible={hasMatchingActions(['Tablero', 'Encabezado', 'Secciones', 'Anexo', 'Firmas', 'Vista Consolidada', 'Experto'])}
                isSearchActive={!!searchTerm}
                icon={LayoutGrid}
                isOpen={openGroups.includes('ficha')}
                onToggle={() => toggleGroup('ficha')}
              >
                {('Tablero'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('kpis', 'Tablero', BarChart3, () => setActiveSection?.('kpis'), 'outline', activeSection === 'kpis')}
                {('Encabezado'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('header', 'Encabezado', Layout, () => setActiveSection?.('header'), 'outline', activeSection === 'header')}
                {('Secciones'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('open-sections', 'Secciones', ListFilter, onOpenSections)}
                {('Anexo'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('open-annexes', 'Anexo', FileSpreadsheet, onOpenAnnexes)}
                {('Firmas'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('signature', 'Firmas', PenTool, () => setActiveSection?.('signature'), 'outline', activeSection === 'signature')}
                {('Vista Consolidada'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('all-content', 'Vista Consolidada', Zap, () => setActiveSection?.('all-content'), 'outline', activeSection === 'all-content')}
                {('Experto'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('expert-content', 'Experto', Zap, () => setActiveSection?.('expert-content'), 'outline', activeSection === 'expert-content')}
              </AccordionGroup>

              <AccordionGroup
                title="Modos de Visualización"
                isVisible={hasMatchingActions(['Completo', 'Asistido', 'Resumido', 'Vistazo', 'Audit'])}
                isSearchActive={!!searchTerm}
                icon={Eye}
                isOpen={openGroups.includes('modos')}
                onToggle={() => toggleGroup('modos')}
              >
                {('Completo'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('mode-expert', 'Completo', Table2, () => setViewMode?.('expert'), 'outline', viewMode === 'expert')}
                {('Asistido'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('mode-assisted', 'Asistido', Wand2, () => setViewMode?.('assisted'), 'outline', viewMode === 'assisted')}
                {('Resumido'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('mode-reading', 'Resumido', BookOpen, () => setViewMode?.('reading'), 'outline', viewMode === 'reading')}
                {('Vistazo'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('mode-preview', 'Vistazo', Eye, () => setViewMode?.('preview'), 'outline', viewMode === 'preview')}
                {('Audit'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('mode-audit', 'Audit', Activity, () => setViewMode?.('audit'), 'outline', viewMode === 'audit')}
              </AccordionGroup>

              <AccordionGroup
                title="Inteligencia y Generación"
                isVisible={hasMatchingActions(['Darian AI', 'Generar Rápida', 'Generar Experta', 'Generación Masiva'])}
                isSearchActive={!!searchTerm}
                icon={Sparkles}
                isOpen={openGroups.includes('generacion')}
                onToggle={() => toggleGroup('generacion')}
              >
                {('Darian AI'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('ai-chat', 'Darian AI', Bot, () => setActiveSection?.('ai-chat'), 'primary', activeSection === 'ai-chat')}
                {('Generar Rápida'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('quick-gen', 'Generar Rápida', Sparkles, onQuickGenerate)}
                {('Generar Experta'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('expert-gen', 'Generar Experta', Zap, onExpertGenerate)}
                {('Generación Masiva'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('massive-gen', 'Generación Masiva', FileText, () => setActiveSection?.('massive-gen'), 'outline', activeSection === 'massive-gen')}
              </AccordionGroup>

              <AccordionGroup
                title="Gestión y Plantillas"
                isVisible={hasMatchingActions(['Explorar Plantillas', 'Cargar Ejemplo', 'Guardar (JSON)', 'Importar JSON'])}
                isSearchActive={!!searchTerm}
                icon={FolderOpen}
                isOpen={openGroups.includes('gestion')}
                onToggle={() => toggleGroup('gestion')}
              >
                {('Explorar Plantillas'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('templates', 'Explorar Plantillas', FolderOpen, () => setActiveSection?.('templates'), 'outline', activeSection === 'templates')}
                {('Cargar Ejemplo'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('load-example', 'Cargar Ejemplo', FileText)}
                {('Guardar (JSON)'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('export-json', 'Guardar (JSON)', Save)}
                {('Importar JSON'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('import-json', 'Importar JSON', Upload)}
              </AccordionGroup>

              <AccordionGroup
                title="Exportación y Formato"
                isVisible={hasMatchingActions(['Exportar Excel', 'Exportar PDF'])}
                isSearchActive={!!searchTerm}
                icon={Download}
                isOpen={openGroups.includes('export')}
                onToggle={() => toggleGroup('export')}
              >
                <div className="px-3 py-4 space-y-4 bg-primary/5 rounded-xl mb-2 mx-2 border border-primary/10">
                   <div className="text-[8px] font-black text-sidebar-foreground/70 tracking-[0.4em] uppercase">
                      Modo de Diseño
                   </div>
                   <ViewSwitcher
                     currentView={layoutMode}
                     onViewChange={setLayoutMode}
                     className="w-full bg-background border-border"
                   />
                </div>
                {('Exportar Excel'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('export-excel', 'Exportar Excel', FileSpreadsheet, undefined, 'primary')}
                {('Exportar PDF'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('export-pdf', 'Exportar PDF', Download, undefined, 'success')}
              </AccordionGroup>

              <AccordionGroup
                title="Soporte y Herramientas"
                isVisible={hasMatchingActions(['Calculadora Pro', 'Calculadora Estructura', 'Ayuda de esta vista', 'Ayuda del sistema', 'Academia'])}
                isSearchActive={!!searchTerm}
                icon={HelpCircle}
                isOpen={openGroups.includes('soporte')}
                onToggle={() => toggleGroup('soporte')}
              >
                {('Calculadora Pro'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('calculator', 'Calculadora Pro', Calculator)}
                {('Calculadora Estructura'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('steel-calculator', 'Calculadora Estructura', Scale, () => setActiveSection?.('steel-calculator'), 'outline', activeSection === 'steel-calculator')}
                {('Ayuda de esta vista'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('help', 'Ayuda de esta vista', HelpCircle, onOpenHelp)}
                {('Ayuda del sistema'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('system-help', 'Ayuda del sistema', LifeBuoy, onOpenSystemHelp)}
                {('Academia'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('academy', 'Academia', GraduationCap, onOpenAcademy)}
              </AccordionGroup>

            </div>

            {/* Footer */}
            <div className="p-6 border-t border-sidebar-border/50 bg-sidebar/5">
               <p className="text-[9px] font-black uppercase tracking-[0.3em] text-sidebar-foreground/50 text-center">
                  Soporte: info@costpro.app
               </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
