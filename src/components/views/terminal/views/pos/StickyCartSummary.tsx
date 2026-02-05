'use client';

import React from 'react';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface StickyCartSummaryProps {
  itemCount: number;
  totalAmount: number;
  onClick: () => void;
  className?: string;
}

export const StickyCartSummary: React.FC<StickyCartSummaryProps> = ({
  itemCount,
  totalAmount,
  onClick,
  className,
}) => {
  if (itemCount === 0) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-background via-background/95 to-transparent",
        className
      )}
    >
      <button
        onClick={onClick}
        className={cn(
          "w-full neu-btn-primary flex items-center justify-between p-4 rounded-2xl shadow-2xl active:scale-95 transition-all",
          "neu-pulse"
        )}
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={itemCount}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute -top-2 -right-2 bg-white text-primary text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-lg border-2 border-primary"
              >
                {itemCount}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Total en Carrito</p>
            <p className="text-xl font-black text-white tracking-tighter">
              {formatCurrency(totalAmount)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl backdrop-blur-md">
          <span className="text-[10px] font-black uppercase tracking-widest text-white">Revisar</span>
          <ArrowRight className="w-4 h-4 text-white" />
        </div>
      </button>
    </motion.div>
  );
};
