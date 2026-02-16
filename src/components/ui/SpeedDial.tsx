'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <div className={cn("fixed bottom-6 right-6 z-[110] flex flex-col items-end gap-3", className)}>
      <AnimatePresence>
        {isOpen && (
          <div className="flex flex-col items-end gap-6 mb-2">
            {categories.map((cat) => (
              <div key={cat} className="flex flex-col items-end gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded border border-border">
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
                          "flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border-2 transition-transform active:scale-95",
                          action.variant === 'destructive' ? "bg-destructive text-white border-destructive" :
                          action.variant === 'success' ? "bg-green-600 text-white border-green-600" :
                          "bg-card text-foreground border-border"
                        )}
                      >
                        <span className="text-sm font-bold">{action.label}</span>
                        <action.icon className="w-5 h-5" />
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
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 z-20",
          isOpen ? "bg-background border-2 border-border text-foreground rotate-0" : "bg-primary text-white"
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
  );
};
