'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ShoppingCart, ChevronUp } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';

interface StickyCartSummaryProps {
  itemCount: number;
  total: number;
  onClick: () => void;
  className?: string;
}

export const StickyCartSummary = ({
  itemCount,
  total,
  onClick,
  className
}: StickyCartSummaryProps) => {
  const prefersReducedMotion = useReducedMotion();
  if (itemCount === 0) return null;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={prefersReducedMotion ? undefined : { y: 100, opacity: 0 }}
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background/80 to-transparent pt-10",
        className
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full bg-primary text-primary-foreground p-4 rounded-2xl shadow-2xl flex items-center justify-between group active:scale-[0.98] transition-all overflow-hidden relative"
      >
        {/* Animated background pulse */}
        <motion.div
          key={itemCount}
          initial={prefersReducedMotion ? false : { scale: 0.8, opacity: 0.5 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
          className="absolute inset-0 bg-primary-foreground/20 rounded-full"
        />

        <div className="flex items-center gap-4 relative z-10">
          <div className="relative">
            <div className="bg-primary-foreground/20 p-2 rounded-xl">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <motion.span
              key={itemCount}
              initial={prefersReducedMotion ? false : { scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-xs font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-primary"
            >
              {itemCount}
            </motion.span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-xs font-bold uppercase tracking-widest opacity-70 leading-none mb-1">Tu Carrito</span>
            <span className="text-xl font-black tracking-tight leading-none tabular-nums">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-primary-foreground/10 px-4 py-2 rounded-xl group-hover:bg-primary-foreground/20 transition-colors relative z-10">
          <span className="text-xs font-black uppercase tracking-widest">Ver Caja</span>
          <ChevronUp className="w-4 h-4 animate-bounce" />
        </div>
      </button>
    </motion.div>
  );
};
