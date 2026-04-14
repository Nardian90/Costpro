'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ConcentricDashboardRingProps {
  sales: number;
  costs: number;
  profit: number;
  className?: string;
}

export const ConcentricDashboardRing: React.FC<ConcentricDashboardRingProps> = ({
  sales,
  costs,
  profit,
  className
}) => {
  const profitPercent = sales > 0 ? (profit / sales) * 100 : 0;
  const costsPercent = sales > 0 ? (costs / sales) * 100 : 0;

  const c90 = 2 * Math.PI * 90;
  const c70 = 2 * Math.PI * 70;
  const c50 = 2 * Math.PI * 50;

  const salesOffset = 0;
  const costsOffset = c70 - (Math.min(costsPercent, 100) / 100) * c70;
  const profitOffset = c50 - (Math.min(profitPercent, 100) / 100) * c50;

  return (
    <div className={cn("relative flex items-center justify-center py-6 sm:py-10", className)}>
      <div className="absolute w-48 h-48 sm:w-64 sm:h-64 bg-primary/5 rounded-full blur-[80px] -z-10" />

      <svg className="w-56 h-56 sm:w-72 sm:h-72 -rotate-90" viewBox="0 0 200 200">
        {/* Outer Ring - Sales (Green) */}
        <circle
          cx="100" cy="100" fill="none" r="90"
          stroke="currentColor" strokeWidth="8"
          className="text-muted/30"
        />
        <motion.circle
          cx="100" cy="100" fill="none" r="90"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c90}
          initial={{ strokeDashoffset: c90 }}
          animate={{ strokeDashoffset: salesOffset }}
          transition={{ duration: 1.5, ease: "circOut" }}
          className="stroke-primary"
        />

        {/* Middle Ring - Costs (Muted) */}
        <circle
          cx="100" cy="100" fill="none" r="70"
          stroke="currentColor" strokeWidth="8"
          className="text-muted/30"
        />
        <motion.circle
          cx="100" cy="100" fill="none" r="70"
          stroke="currentColor" strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c70}
          initial={{ strokeDashoffset: c70 }}
          animate={{ strokeDashoffset: costsOffset }}
          transition={{ duration: 1.5, delay: 0.2, ease: "circOut" }}
          className="text-muted-foreground/70"
        />

        {/* Inner Ring - Profit (Emerald) */}
        <circle
          cx="100" cy="100" fill="none" r="50"
          stroke="currentColor" strokeWidth="8"
          className="text-muted/30"
        />
        <motion.circle
          cx="100" cy="100" fill="none" r="50"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c50}
          initial={{ strokeDashoffset: c50 }}
          animate={{ strokeDashoffset: profitOffset }}
          transition={{ duration: 1.5, delay: 0.4, ease: "circOut" }}
          className="stroke-emerald-400"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">Margen</span>
        <span className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground font-display">
          {profitPercent.toFixed(0)}<span className="text-emerald-500">%</span>
        </span>
      </div>
    </div>
  );
};
