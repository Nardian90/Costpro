'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Activity, ShieldCheck, AlertTriangle } from 'lucide-react';

interface HealthBatteryProps {
  percent: number;
  className?: string;
}

const HealthBattery: React.FC<HealthBatteryProps> = ({ percent, className }) => {
  const isLow = percent < 50;
  const isCritical = percent < 20;

  const colorClass = isCritical
    ? "text-red-500"
    : isLow
      ? "text-amber-500"
      : "text-primary dark:text-[var(--primary)]";

  const bgClass = isCritical
    ? "bg-red-500/10"
    : isLow
      ? "bg-amber-500/10"
      : "bg-primary/10 dark:bg-[var(--primary)]/10";

  return (
    <div className={cn("w-full p-8 rounded-[2.5rem] bg-sidebar/30 border border-border/40 backdrop-blur-xl relative overflow-hidden", className)}>
        <div className={cn("absolute -right-10 -top-10 w-40 h-40 rounded-full blur-[80px] opacity-20", isCritical ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-primary")} />

        <div className="flex items-center gap-10 relative z-10">
            <div className="relative group">
                <svg width="60" height="120" viewBox="0 0 60 120" className="drop-shadow-2xl">
                    <path d="M22 2C22 0.895431 22.8954 0 24 0H36C37.1046 0 38 0.895431 38 2V5H22V2Z" className="fill-slate-300 dark:fill-slate-700" />
                    <rect x="0" y="5" width="60" height="115" rx="12" className="fill-slate-100 dark:fill-slate-900 stroke-slate-200 dark:stroke-slate-800" strokeWidth="2" />
                    <g clipPath="url(#batteryClip)">
                         <rect
                            x="4"
                            y={116 - (107 * (percent / 100))}
                            width="52"
                            height={107 * (percent / 100)}
                            rx="8"
                            className={cn("transition-all duration-1000 ease-out fill-current", colorClass)}
                         />
                         <rect x="8" y="5" width="8" height="115" className="fill-white/10" />
                    </g>
                    <defs>
                        <clipPath id="batteryClip">
                            <rect x="4" y="9" width="52" height="107" rx="8" />
                        </clipPath>
                    </defs>
                </svg>
            </div>

            <div className="flex-1 space-y-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                         <Activity className={cn("w-3 h-3", colorClass)} />
                         <span className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Estado de Salud</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <h2 className={cn("text-6xl font-black tracking-tighter tabular-nums", colorClass)}>{Math.round(percent)}</h2>
                        <span className={cn("text-2xl font-black opacity-30", colorClass)}>%</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className={cn(
                        "inline-flex items-center gap-2 px-4 py-1.5 rounded-full border backdrop-blur-sm transition-all duration-500",
                        bgClass,
                        isCritical ? "border-red-500/20" : isLow ? "border-amber-500/20" : "border-primary/20"
                    )}>
                        {percent === 100 ? <ShieldCheck className={cn("w-3.5 h-3.5", colorClass)} /> : <AlertTriangle className={cn("w-3.5 h-3.5", colorClass)} />}
                        <span className={cn("text-xs font-black uppercase tracking-widest", colorClass)}>
                            {percent === 100 ? 'Integridad Total' : percent > 80 ? 'Nivel Excelente' : percent > 50 ? 'Nivel Aceptable' : 'Riesgo Estructural'}
                        </span>
                    </div>
                    <p className="text-xs font-bold text-slate-400 leading-relaxed uppercase">
                        Basado en validaciones estructurales, rentabilidad y coeficientes indirectos.
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};

export default HealthBattery;
