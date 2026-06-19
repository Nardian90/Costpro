'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
  const shouldReduceMotion = useReducedMotion();
  const profitPercent = sales > 0 ? (profit / sales) * 100 : 0;
  const costsPercent = sales > 0 ? (costs / sales) * 100 : 0;

  const c90 = 2 * Math.PI * 90;
  const c70 = 2 * Math.PI * 70;
  const c50 = 2 * Math.PI * 50;

  const salesOffset = 0;
  const costsOffset = c70 - (Math.min(costsPercent, 100) / 100) * c70;
  const profitOffset = c50 - (Math.min(profitPercent, 100) / 100) * c50;

  const animDuration = shouldReduceMotion ? 0 : 1.5;
  const animDelay = shouldReduceMotion ? 0 : 0.2;

  return (
    <div className={cn("relative flex items-center justify-center py-6 sm:py-10", className)} role="img" aria-label={`Margen de beneficio: ${profitPercent.toFixed(0)}%`}>
      <div className="absolute w-48 h-48 sm:w-64 sm:h-64 bg-primary/5 rounded-full blur-[80px] -z-10" />

      <svg className="w-56 h-56 sm:w-72 sm:h-72 -rotate-90" viewBox="0 0 200 200">
        {/* Outer Ring — Sales (Primary token) */}
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
          initial={{ strokeDashoffset: shouldReduceMotion ? salesOffset : c90 }}
          animate={{ strokeDashoffset: salesOffset }}
          transition={{ duration: animDuration, ease: "circOut" }}
          className="stroke-primary"
        />

        {/* Middle Ring — Costs (Muted foreground token) */}
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
          initial={{ strokeDashoffset: shouldReduceMotion ? costsOffset : c70 }}
          animate={{ strokeDashoffset: costsOffset }}
          transition={{ duration: animDuration, delay: animDelay, ease: "circOut" }}
          className="text-muted-foreground/70"
        />

        {/* Inner Ring — Profit (Success token — matches theme) */}
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
          initial={{ strokeDashoffset: shouldReduceMotion ? profitOffset : c50 }}
          animate={{ strokeDashoffset: profitOffset }}
          transition={{ duration: animDuration, delay: animDelay * 2, ease: "circOut" }}
          className="stroke-success"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">Margen</span>
        <span className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground font-display tabular-nums">
          {profitPercent.toFixed(0)}<span className="text-success">%</span>
        </span>
      </div>
    </div>
  );
};
