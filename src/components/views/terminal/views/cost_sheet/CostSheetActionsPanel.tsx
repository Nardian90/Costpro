'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X as XIcon, FileText, Trash2, Upload, Save, FileSpreadsheet, Download, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ActionItem {
  id: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'outline';
  disabled?: boolean;
}

import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import { CostSheetModeSwitcher } from './CostSheetModeSwitcher';

interface CostSheetActionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  actions: ActionItem[];
  viewMode: 'expert' | 'assisted' | 'reading' | 'quick';
  setViewMode: (mode: 'expert' | 'assisted' | 'reading' | 'quick') => void;
  layoutMode: ViewMode;
  setLayoutMode: (mode: ViewMode) => void;
}

export const CostSheetActionsPanel: React.FC<CostSheetActionsPanelProps> = ({
  isOpen,
  onClose,
  actions,
  viewMode,
  setViewMode,
  layoutMode,
  setLayoutMode,
}) => {
  // Categorize actions
  const actionGroups = [
    {
      title: 'Vistas y Análisis',
      items: [
        ...actions.filter(a => ['toggle-mode', 'kpis-header'].includes(a.id))
      ]
    },
    {
      title: 'Gestión',
      items: [
        ...actions.filter(a => a.id === 'audit'),
        ...actions.filter(a => ['load-example', 'reset', 'import-json', 'export-json', 'massive-gen'].includes(a.id))
      ]
    },
    {
      title: 'Exportar',
      items: actions.filter(a => ['export-excel', 'export-pdf'].includes(a.id))
    }
  ];

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
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "fixed right-0 top-0 h-screen w-72 bg-sidebar/95 backdrop-blur-2xl border-l border-sidebar-border shadow-2xl z-50 flex flex-col overflow-hidden"
            )}
          >
            {/* Header */}
            <div className="p-6 border-b border-sidebar-border/50 flex items-center justify-between bg-sidebar/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Acciones</span>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-primary/10 text-muted-foreground transition-colors active:scale-95"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-8 no-scrollbar">
              {/* Configuration / Switchers */}
              <div className="space-y-6 bg-primary/5 p-4 rounded-3xl border border-primary/10">
                <div className="space-y-4">
                  <div className="text-[10px] font-black text-primary/70 tracking-[0.4em] uppercase px-2">
                    Modo de Visualización
                  </div>
                  <CostSheetModeSwitcher viewMode={viewMode} setViewMode={setViewMode} />
                </div>

                {viewMode === 'expert' && (
                  <div className="space-y-4 pt-4 border-t border-primary/10">
                    <div className="text-[10px] font-black text-primary/70 tracking-[0.4em] uppercase px-2">
                      Diseño de Tablas
                    </div>
                    <div className="flex justify-center">
                      <ViewSwitcher currentView={layoutMode} onViewChange={setLayoutMode} />
                    </div>
                  </div>
                )}
              </div>

              {actionGroups.map((group, idx) => (
                group.items.length > 0 && (
                  <div key={idx} className="space-y-4">
                    <div className="px-4 text-[10px] font-black text-primary/70 tracking-[0.4em] uppercase">
                      {group.title}
                    </div>
                    <div className="space-y-1">
                      {group.items.map(item => (
                        <button
                          key={item.id}
                          disabled={item.disabled}
                          onClick={() => {
                            item.onClick();
                            if (window.innerWidth < 1024) onClose();
                          }}
                          className={cn(
                            "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95 text-left",
                            "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                            item.variant === 'danger'
                              ? "hover:bg-danger/10 text-danger"
                              : item.variant === 'success'
                                ? "hover:bg-success/10 text-success"
                                : "hover:bg-primary/5 text-sidebar-foreground/70"
                          )}
                        >
                          <item.icon className={cn(
                            "w-5 h-5 transition-colors",
                            item.variant === 'danger' ? "text-danger" : item.variant === 'success' ? "text-success" : "group-hover:text-primary"
                          )} />
                          <span className="text-xs font-bold uppercase tracking-widest">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-sidebar-border/50 bg-sidebar/5">
               <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground/50 text-center">
                  CostPro Terminal v5.7
               </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
