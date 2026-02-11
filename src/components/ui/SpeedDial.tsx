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
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  category?: string;
}

interface SpeedDialProps {
  actions: SpeedDialAction[];
  mainIcon?: LucideIcon;
  className?: string;
}

export const SpeedDial = ({ actions, mainIcon: MainIcon = Plus, className }: SpeedDialProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Group actions by category if present
  const categorizedActions = actions.reduce((acc, action) => {
    const category = action.category || 'Otras';
    if (!acc[category]) acc[category] = [];
    acc[category].push(action);
    return acc;
  }, {} as Record<string, SpeedDialAction[]>);

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <div className={cn("fixed bottom-6 right-24 sm:right-8 z-[110] flex flex-col items-end gap-4", className)}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            className="flex flex-col items-end gap-6 mb-2"
          >
            {Object.entries(categorizedActions).map(([category, items]) => (
              <div key={category} className="flex flex-col items-end gap-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md border border-border">
                  {category}
                </span>
                <div className="flex flex-col items-end gap-3">
                  {items.map((action, index) => (
                    <motion.button
                      key={action.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => {
                        action.onClick();
                        setIsOpen(false);
                      }}
                      className="flex items-center gap-3 group"
                    >
                      <span className="bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-border shadow-sm text-[10px] font-black uppercase tracking-wider opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        {action.label}
                      </span>
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-90",
                        action.variant === 'primary' ? "bg-primary text-white" :
                        action.variant === 'danger' ? "bg-destructive text-white" :
                        action.variant === 'success' ? "bg-emerald-500 text-white" :
                        "bg-card text-foreground border border-border"
                      )}>
                        <action.icon className="w-5 h-5" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={toggleOpen}
        className={cn(
          "w-16 h-16 rounded-3xl flex items-center justify-center shadow-2xl transition-all active:scale-95 z-50",
          isOpen ? "bg-destructive text-white rotate-45" : "bg-primary text-white"
        )}
      >
        {isOpen ? <X className="w-8 h-8 -rotate-45" /> : <MainIcon className="w-8 h-8" />}
      </button>

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[-1]"
          />
        )}
      </AnimatePresence>
    </div>
  );
};
