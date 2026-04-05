'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X as XIcon, Search, FileText, Trash2, Upload, Save, FileSpreadsheet,
  Download, Settings, Table2, LayoutGrid, ChevronDown,
  BarChart3, Layout, ListFilter, PenTool, Zap, Wand2,
  BookOpen, Eye, Activity, Sparkles, FolderOpen, Bot, HelpCircle, Calculator,
  LifeBuoy, GraduationCap, Scale, LogOut, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import ViewSwitcher, { ViewMode as LayoutViewMode } from '@/components/ui/ViewSwitcher';
import { CostSheetViewMode } from './CostSheetModeDropdown';
import { useAuthStore } from '@/store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ActionItem {
  id: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'outline';
  disabled?: boolean;
}

interface CostSheetActionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  actions: ActionItem[];
  layoutMode: LayoutViewMode;
  setLayoutMode: (mode: LayoutViewMode) => void;
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
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  isVisible?: boolean;
  isSearchActive?: boolean;
}) => {
  if (!isVisible) return null;

  return (
    <div className="border-b border-sidebar-border/30 overflow-hidden">
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between p-4 hover:bg-sidebar-accent/50 transition-colors group",
          isOpen && "bg-sidebar-accent/30"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg transition-colors",
            isOpen ? "bg-primary/20 text-primary" : "bg-sidebar-foreground/5 text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70"
          )}>
            <Icon className="w-4 h-4" />
          </div>
          <span className={cn(
            "text-[10px] font-black uppercase tracking-[0.2em]",
            isOpen ? "text-sidebar-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
          )}>
            {title}
          </span>
        </div>
        <ChevronDown className={cn(
          "w-3.5 h-3.5 text-sidebar-foreground/30 transition-transform duration-300",
          isOpen && "rotate-180 text-primary"
        )} />
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen || isSearchActive ? 'auto' : 0 }}
        className="overflow-hidden"
      >
        <div className="p-2 space-y-1">
          {children}
        </div>
      </motion.div>
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
  const [openGroups, setOpenGroups] = useState<string[]>(['generacion']);
  const logout = useAuthStore(state => state.logout);

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(g => g !== groupId)
        : [...prev, groupId]
    );
  };

  const handleAction = (onClick: () => void, isCritical = false) => {
    if (isCritical) {
      if (confirm('¿Estás seguro de realizar esta acción? Esta operación puede sobrescribir datos actuales.')) {
        onClick();
        if (window.innerWidth < 1024) onClose();
      }
    } else {
      onClick();
      if (window.innerWidth < 1024) onClose();
    }
  };

  const actionMap = actions.reduce((acc, action) => {
    acc[action.id] = action;
    return acc;
  }, {} as Record<string, ActionItem>);

  const renderActionButton = (
    id: string,
    label: string,
    icon: React.ElementType,
    onClick?: () => void,
    variant?: ActionItem['variant'],
    isActive?: boolean,
    isCritical = false
  ) => {
    const action = actionMap[id];
    const finalOnClick = onClick || (action ? action.onClick : () => {});
    const Icon = icon || (action ? action.icon : Settings);
    const finalVariant = variant || (action ? action.variant : 'outline');

    const variantStyles = {
      primary: "hover:bg-primary/10 text-primary border-primary/20",
      success: "hover:bg-success/10 text-success border-success/20",
      danger: "hover:bg-danger/10 text-danger border-danger/20",
      warning: "hover:bg-warning/10 text-warning border-warning/20",
      info: "hover:bg-info/10 text-info border-info/20",
      outline: "hover:bg-primary/5 text-sidebar-foreground/70 border-primary/5",
      default: "hover:bg-primary/5 text-sidebar-foreground/70 border-primary/5"
    };

    return (
      <button
        key={id}
        onClick={() => handleAction(finalOnClick, isCritical)}
        className={cn(
          "w-full flex items-center gap-3 p-3 rounded-xl transition-all group active:scale-95 text-left mb-1 border",
          isActive
            ? "bg-primary text-foreground shadow-lg shadow-primary/20 font-black border-primary"
            : cn("bg-transparent font-bold", variantStyles[finalVariant as keyof typeof variantStyles] || variantStyles.outline)
        )}
      >
        <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-foreground" : "group-hover:scale-110 transition-transform")} />
        <span className="text-[9px] font-bold uppercase tracking-widest truncate">{label}</span>
      </button>
    );
  };

  const hasMatchingActions = (labels: string[]) => {
    if (!searchTerm) return true;
    return labels.some(label => label.toLowerCase().includes(searchTerm.toLowerCase()));
  };

  const onSave = actionMap['export-json']?.onClick;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] lg:hidden"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-[320px] bg-sidebar border-l border-sidebar-border z-[101] flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="p-6 border-b border-sidebar-border/50 flex items-center justify-between bg-sidebar/5">
              <div>
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-primary">Panel de Acciones</h2>
                <p className="text-[9px] font-bold text-sidebar-foreground/40 uppercase tracking-widest mt-1">CostPro IPV v6.0</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-sidebar-accent rounded-xl transition-colors text-sidebar-foreground/50 hover:text-primary"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Floating Save Button Hook-like (Fixed at top of content or bottom) */}
            <div className="px-6 py-4 bg-sidebar/5 border-b border-sidebar-border/30 flex gap-2">
              <Button
                onClick={() => onSave?.()}
                className="flex-1 h-12 bg-success hover:bg-success/90 text-foreground font-black uppercase tracking-widest rounded-xl shadow-lg shadow-success/20 gap-2 active:scale-95 transition-all"
              >
                <Save className="w-4 h-4" />
                Guardar Ficha
              </Button>
            </div>

            {/* Quick Section - Featured Buttons */}
            <div className="p-4 space-y-3 bg-sidebar/10">
               <div className="text-[8px] font-black text-sidebar-foreground/30 uppercase tracking-[0.3em] px-2 mb-1">
                  Acceso Rápido
               </div>
               <div className="grid grid-cols-2 gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-10 border-success/20 text-success hover:bg-success/5 font-bold text-[9px] uppercase tracking-widest rounded-lg gap-2">
                        <LayoutGrid className="w-3.5 h-3.5" />
                        Navegar
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-sidebar border-sidebar-border p-1">
                      <DropdownMenuItem onClick={() => setActiveSection?.('kpis')} className="text-[9px] font-bold uppercase tracking-widest p-3 rounded-lg focus:bg-success/10 focus:text-success">
                        <BarChart3 className="w-4 h-4 mr-3" /> Tablero
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setActiveSection?.('header')} className="text-[9px] font-bold uppercase tracking-widest p-3 rounded-lg focus:bg-success/10 focus:text-success">
                        <Layout className="w-4 h-4 mr-3" /> Encabezado
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onOpenSections} className="text-[9px] font-bold uppercase tracking-widest p-3 rounded-lg focus:bg-success/10 focus:text-success">
                        <ListFilter className="w-4 h-4 mr-3" /> Secciones
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onOpenAnnexes} className="text-[9px] font-bold uppercase tracking-widest p-3 rounded-lg focus:bg-success/10 focus:text-success">
                        <FileSpreadsheet className="w-4 h-4 mr-3" /> Anexos
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setActiveSection?.('signature')} className="text-[9px] font-bold uppercase tracking-widest p-3 rounded-lg focus:bg-success/10 focus:text-success">
                        <PenTool className="w-4 h-4 mr-3" /> Firmas
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-10 border-success/20 text-success hover:bg-success/5 font-bold text-[9px] uppercase tracking-widest rounded-lg gap-2">
                        <Eye className="w-3.5 h-3.5" />
                        Vistas
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-sidebar border-sidebar-border p-1">
                      <DropdownMenuItem onClick={() => setViewMode?.('expert')} className={cn("text-[9px] font-bold uppercase tracking-widest p-3 rounded-lg focus:bg-success/10 focus:text-success", viewMode === 'expert' && "bg-success/10 text-success")}>
                        <Table2 className="w-4 h-4 mr-3" /> Completo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setViewMode?.('assisted')} className={cn("text-[9px] font-bold uppercase tracking-widest p-3 rounded-lg focus:bg-success/10 focus:text-success", viewMode === 'assisted' && "bg-success/10 text-success")}>
                        <Wand2 className="w-4 h-4 mr-3" /> Asistido
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setViewMode?.('reading')} className={cn("text-[9px] font-bold uppercase tracking-widest p-3 rounded-lg focus:bg-success/10 focus:text-success", viewMode === 'reading' && "bg-success/10 text-success")}>
                        <BookOpen className="w-4 h-4 mr-3" /> Resumido
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setViewMode?.('preview')} className={cn("text-[9px] font-bold uppercase tracking-widest p-3 rounded-lg focus:bg-success/10 focus:text-success", viewMode === 'preview' && "bg-success/10 text-success")}>
                        <Eye className="w-4 h-4 mr-3" /> Vistazo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setViewMode?.('audit')} className={cn("text-[9px] font-bold uppercase tracking-widest p-3 rounded-lg focus:bg-success/10 focus:text-success", viewMode === 'audit' && "bg-success/10 text-success")}>
                        <Activity className="w-4 h-4 mr-3" /> Audit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
               </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-sidebar-border/30 bg-sidebar/5">
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
                title="Generación Asistida"
                isVisible={hasMatchingActions(['Darian AI', 'Generar Rápida', 'Generar Experta', 'Generación Masiva'])}
                isSearchActive={!!searchTerm}
                icon={Sparkles}
                isOpen={openGroups.includes('generacion')}
                onToggle={() => toggleGroup('generacion')}
              >
                {('Darian AI'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('ai-chat', 'Darian AI', Bot, () => setActiveSection?.('ai-chat'), 'warning', activeSection === 'ai-chat')}
                {('Generar Rápida'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('quick-gen', 'Generar Rápida', Sparkles, onQuickGenerate, 'warning')}
                {('Generar Experta'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('expert-gen', 'Generar Experta', Zap, onExpertGenerate, 'warning')}
                {('Generación Masiva'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('massive-gen', 'Generación Masiva', FileText, () => setActiveSection?.('massive-gen'), 'warning', activeSection === 'massive-gen', true)}
              </AccordionGroup>

              <AccordionGroup
                title="Operaciones de Datos"
                isVisible={hasMatchingActions(['Explorar Plantillas', 'Cargar Ejemplo', 'Guardar (JSON)', 'Importar JSON', 'Exportar Excel', 'Exportar PDF'])}
                isSearchActive={!!searchTerm}
                icon={FolderOpen}
                isOpen={openGroups.includes('gestion')}
                onToggle={() => toggleGroup('gestion')}
              >
                {('Importar JSON'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('import-json', 'Importar JSON', Upload, undefined, 'danger', false, true)}
                {('Explorar Plantillas'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('templates', 'Explorar Plantillas', FolderOpen, () => setActiveSection?.('templates'), 'outline', activeSection === 'templates')}
                {('Cargar Ejemplo'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('load-example', 'Cargar Ejemplo', FileText, undefined, 'danger', false, true)}

                <div className="my-2 border-t border-sidebar-border/30 pt-2">
                   <div className="text-[8px] font-black text-sidebar-foreground/30 uppercase tracking-[0.3em] px-2 mb-2">
                      Exportación y Formato
                   </div>
                   <div className="px-3 py-4 space-y-4 bg-primary/5 rounded-xl mb-2 mx-1 border border-primary/10">
                      <div className="text-[8px] font-black text-sidebar-foreground/70 tracking-[0.4em] uppercase">
                         Modo de Diseño
                      </div>
                      <ViewSwitcher
                        currentView={layoutMode}
                        onViewChange={setLayoutMode}
                        className="w-full bg-background border-border"
                      />
                   </div>

                   <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full h-12 border-danger/20 text-danger hover:bg-danger/5 font-bold text-[9px] uppercase tracking-widest rounded-xl gap-3 justify-start px-3.5 mb-1 active:scale-95 transition-all">
                        <Download className="w-4.5 h-4.5" />
                        Exportar Ficha
                        <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 bg-sidebar border-sidebar-border p-1">
                      <DropdownMenuItem onClick={() => handleAction(actionMap['export-excel'].onClick, true)} className="text-[10px] font-bold uppercase tracking-widest p-4 rounded-xl focus:bg-danger/10 focus:text-danger">
                        <FileSpreadsheet className="w-5 h-5 mr-4 text-success" /> Exportar a Excel (.xlsx)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAction(actionMap['export-pdf'].onClick, true)} className="text-[10px] font-bold uppercase tracking-widest p-4 rounded-xl focus:bg-danger/10 focus:text-danger">
                        <Download className="w-5 h-5 mr-4 text-danger" /> Exportar a PDF (.pdf)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </AccordionGroup>

              <AccordionGroup
                title="Herramientas y Soporte"
                isVisible={hasMatchingActions(['Calculadora Pro', 'Calculadora Estructura', 'Ayuda de esta vista', 'Ayuda del sistema', 'Academia'])}
                isSearchActive={!!searchTerm}
                icon={HelpCircle}
                isOpen={openGroups.includes('soporte')}
                onToggle={() => toggleGroup('soporte')}
              >
                {('Calculadora Pro'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('calculator', 'Calculadora Pro', Calculator, undefined, 'info')}
                {('Calculadora Estructura'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('steel-calculator', 'Calculadora Estructura', Scale, () => setActiveSection?.('steel-calculator'), 'info', activeSection === 'steel-calculator')}
                {('Ayuda de esta vista'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('help', 'Ayuda de esta vista', HelpCircle, onOpenHelp, 'info')}
                {('Ayuda del sistema'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('system-help', 'Ayuda del sistema', LifeBuoy, onOpenSystemHelp, 'info')}
                {('Academia'.toLowerCase().includes(searchTerm.toLowerCase()) || !searchTerm) && renderActionButton('academy', 'Academia', GraduationCap, onOpenAcademy, 'info')}
              </AccordionGroup>

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-sidebar-border/50 bg-sidebar/5 space-y-4">
               <button
                 onClick={() => handleAction(logout)}
                 className="w-full flex items-center justify-center gap-3 p-3.5 rounded-xl transition-all active:scale-95 text-destructive hover:bg-destructive/10 font-black border border-destructive/10"
               >
                 <LogOut className="w-4 h-4" />
                 <span className="text-[10px] font-black uppercase tracking-[0.3em]">Cerrar Sesión</span>
               </button>
               <p className="text-[8px] font-black uppercase tracking-[0.4em] text-sidebar-foreground/30 text-center">
                  Soporte: info@costpro.app
               </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
