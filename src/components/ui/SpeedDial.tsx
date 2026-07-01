'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Portal } from './Portal';

export interface SpeedDialAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  category?: 'Gestión' | 'Edición' | 'Acción';
  variant?: 'primary' | 'destructive' | 'success';
}

interface SpeedDialProps {
  actions: SpeedDialAction[];
  className?: string;
}

export const SpeedDial: React.FC<SpeedDialProps> = ({ actions, className }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Group actions by category
  const categories = Array.from(new Set(actions.map(a => a.category || 'Acción'))).reverse();

  return (
    <Portal>
      <div className={cn("fixed bottom-6 right-6 z-[110] flex flex-col items-end gap-3", className)}>
        <AnimatePresence>
          {isOpen && (
            <div className="flex flex-col items-end gap-6 mb-2">
              {categories.map((cat) => (
                <div key={cat} className="flex flex-col items-end gap-2">
                  <span className="text-xs font-black uppercase tracking-widest text-primary bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded border border-primary/20">
                    {cat}
                  </span>
                  <div className="flex flex-col items-end gap-2">
                    {actions
                      .filter(a => (a.category || 'Acción') === cat)
                      .map((action, idx) => (
                        <motion.button
                          key={action.id}
                          initial={{ opacity: 0, scale: 0.5, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.5, y: 10 }}
                          transition={{ delay: idx * 0.05 }}
                          onClick={() => {
                            action.onClick();
                            setIsOpen(false);
                          }}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all active:scale-95 neu-raised-sm hover:neu-raised-hover border-2",
                            action.variant === 'destructive' ? "bg-destructive/10 text-danger border-danger/20" :
                            action.variant === 'success' ? "bg-primary/10 text-primary border-primary/20" :
                            action.variant === 'primary' ? "bg-primary text-primary border-primary" :
                            "bg-card text-primary border-primary/20"
                          )}
                        >
                          <span className="text-sm font-bold uppercase tracking-widest">{action.label}</span>
                          <action.icon className="w-5 h-5 text-primary" />
                        </motion.button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AnimatePresence>

        <motion.button
          layout
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Cerrar menú de acciones" : "Abrir menú de acciones"} /* FIX-ACC-004 */
          aria-expanded={isOpen} /* FIX-ACC-004 */
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 z-20 neu-raised hover:neu-raised-hover",
            isOpen ? "bg-background border-2 border-primary text-primary rotate-0" : "bg-primary text-primary"
          )}
        >
          {isOpen ? (
            <X className="w-7 h-7" />
          ) : (
            <Plus className="w-7 h-7" />
          )}
        </motion.button>

        {/* Backdrop */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-background/60 backdrop-blur-sm -z-10"
            />
          )}
        </AnimatePresence>
      </div>
    </Portal>
  );
};
