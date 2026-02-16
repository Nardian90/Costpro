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

  // Circumferences
  const c90 = 2 * Math.PI * 90; // ~565.48
  const c70 = 2 * Math.PI * 70; // ~439.82
  const c50 = 2 * Math.PI * 50; // ~314.16

  // We'll show:
  // Outer (Blue): Sales (always 100% or relative to a target, here we'll just show it full or 100%)
  // Middle (White/Slate): Costs as % of sales
  // Inner (Green): Profit as % of sales

  const salesOffset = 0; // 100% full
  const costsOffset = c70 - (Math.min(costsPercent, 100) / 100) * c70;
  const profitOffset = c50 - (Math.min(profitPercent, 100) / 100) * c50;

  return (
    <div className={cn("relative flex items-center justify-center py-10 overflow-hidden", className)}>
      <div className="absolute w-64 h-64 bg-primary/10 rounded-full blur-[100px] -z-10"></div>

      <svg className="w-72 h-72 -rotate-90" viewBox="0 0 200 200">
        {/* Outer Ring - Sales (Blue) */}
        <circle
          className="text-slate-200 dark:text-white/5"
          cx="100" cy="100" fill="none" r="90"
          stroke="currentColor" strokeWidth="8"
        />
        <motion.circle
          className="glow-blue"
          cx="100" cy="100" fill="none" r="90"
          stroke="#00E0FF" strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c90}
          initial={{ strokeDashoffset: c90 }}
          animate={{ strokeDashoffset: salesOffset }}
          transition={{ duration: 1.5, ease: "circOut" }}
          style={{ filter: 'drop-shadow(0 0 8px rgba(0, 224, 255, 0.4))' }}
        />

        {/* Middle Ring - Costs (White in Dark, Slate in Light) */}
        <circle
          className="text-slate-200 dark:text-white/5"
          cx="100" cy="100" fill="none" r="70"
          stroke="currentColor" strokeWidth="8"
        />
        <motion.circle
          className="text-slate-400 dark:text-white"
          cx="100" cy="100" fill="none" r="70"
          stroke="currentColor" strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c70}
          initial={{ strokeDashoffset: c70 }}
          animate={{ strokeDashoffset: costsOffset }}
          transition={{ duration: 1.5, delay: 0.2, ease: "circOut" }}
        />

        {/* Inner Ring - Profit (Green) */}
        <circle
          className="text-slate-200 dark:text-white/5"
          cx="100" cy="100" fill="none" r="50"
          stroke="currentColor" strokeWidth="8"
        />
        <motion.circle
          className="glow-green"
          cx="100" cy="100" fill="none" r="50"
          stroke="#39FF14" strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c50}
          initial={{ strokeDashoffset: c50 }}
          animate={{ strokeDashoffset: profitOffset }}
          transition={{ duration: 1.5, delay: 0.4, ease: "circOut" }}
          style={{ filter: 'drop-shadow(0 0 8px rgba(57, 255, 20, 0.4))' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center rotate-0">
        <span className="text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Margen</span>
        <span className="text-4xl font-black tracking-tighter text-foreground">
          {profitPercent.toFixed(0)}<span className="text-primary">%</span>
        </span>
        <span className="text-[10px] font-mono text-primary opacity-0">
          {/* We don't have historical delta here yet */}
          +0.0%
        </span>
      </div>
    </div>
  );
};
