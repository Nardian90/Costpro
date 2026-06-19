'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CircularProgressProps {
  value: number;
  label: string;
  subLabel: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

const CircularProgress: React.FC<CircularProgressProps> = ({
    value,
    label,
    subLabel,
    color = "text-primary",
    size = 'md'
}) => {
  const prefersReducedMotion = useReducedMotion();
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const safeValue = isNaN(value) ? 0 : value;
  const strokeDashoffset = circumference - (Math.min(safeValue, 100) / 100) * circumference;

  const sizeClasses = {
      sm: 'w-16 h-16',
      md: 'w-20 h-20',
      lg: 'w-24 h-24'
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("relative flex items-center justify-center", sizeClasses[size])}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={radius}
            className="stroke-muted/10 fill-none"
            strokeWidth="6"
          />
          <motion.circle
            cx="40"
            cy="40"
            r={radius}
            stroke="currentColor"
            className={cn("fill-none", color)}
            strokeWidth="6"
            strokeDasharray={circumference}
            initial={prefersReducedMotion ? { strokeDashoffset } : { strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeOut" }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className={cn(
              "font-black tracking-tighter",
              size === 'sm' ? "text-xs" : size === 'lg' ? "text-base" : "text-sm"
          )}>
              {Math.round(safeValue)}%
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
        <p className="text-xs font-black text-foreground tracking-tighter">{subLabel}</p>
      </div>
    </div>
  );
};

export default CircularProgress;
