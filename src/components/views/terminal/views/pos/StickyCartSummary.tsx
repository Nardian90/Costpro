'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, ChevronUp } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';

interface StickyCartSummaryProps {
  itemCount: number;
  total: number;
  onClick: () => void;
  className?: string;
}

export const StickyCartSummary: React.FC<StickyCartSummaryProps> = ({
  itemCount,
  total,
  onClick,
  className
}) => {
  if (itemCount === 0) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 p-4 bg-gradient-to-t from-background via-background/80 to-transparent pt-10",
        className
      )}
    >
      <button
        onClick={onClick}
        className="w-full bg-primary text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between group active:scale-[0.98] transition-all overflow-hidden relative"
      >
        {/* Animated background pulse */}
        <motion.div
          key={itemCount}
          initial={{ scale: 0.8, opacity: 0.5 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 bg-white/20 rounded-full"
        />

        <div className="flex items-center gap-4 relative z-10">
          <div className="relative">
            <div className="bg-white/20 p-2 rounded-xl">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <motion.span
              key={itemCount}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute -top-2 -right-2 bg-destructive text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-primary"
            >
              {itemCount}
            </motion.span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 leading-none mb-1">Tu Carrito</span>
            <span className="text-xl font-black tracking-tight leading-none">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl group-hover:bg-white/20 transition-colors relative z-10">
          <span className="text-xs font-black uppercase tracking-widest">Ver Caja</span>
          <ChevronUp className="w-4 h-4 animate-bounce" />
        </div>
      </button>
    </motion.div>
  );
};
