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
    ? "text-destructive"
    : isLow
      ? "text-warning"
      : "text-primary";

  const bgClass = isCritical
    ? "bg-destructive/10"
    : isLow
      ? "bg-warning/10"
      : "bg-primary/10";

  return (
    <div className={cn("w-full p-8 rounded-[2.5rem] bg-sidebar/30 border border-border/40 backdrop-blur-xl relative overflow-hidden", className)}>
        <div className={cn("absolute -right-10 -top-10 w-40 h-40 rounded-full blur-[80px] opacity-20", isCritical ? "bg-destructive" : isLow ? "bg-warning" : "bg-primary")} />

        <div className="flex items-center gap-10 relative z-10">
            <div className="relative group">
                <svg width="60" height="120" viewBox="0 0 60 120" className="drop-shadow-2xl">
                    <path d="M22 2C22 0.895431 22.8954 0 24 0H36C37.1046 0 38 0.895431 38 2V5H22V2Z" className="fill-muted-foreground/30 dark:fill-muted" />
                    <rect x="0" y="5" width="60" height="115" rx="12" className="fill-muted dark:fill-background stroke-border dark:stroke-border" strokeWidth="2" />
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
                         <span className="text-xs font-black uppercase tracking-[0.3em] text-primary/70">Estado de Salud</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <h2 className={cn("text-[clamp(2.5rem,12vw,3.75rem)] font-black tracking-tighter tabular-nums leading-none", colorClass)}>{Math.round(percent)}</h2>
                        <span className={cn("text-[clamp(1.25rem,5vw,2rem)] font-black opacity-30", colorClass)}>%</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className={cn(
                        "inline-flex items-center gap-2 px-4 py-1.5 rounded-full border backdrop-blur-sm transition-all duration-500",
                        bgClass,
                        isCritical ? "border-destructive/20" : isLow ? "border-warning/20" : "border-primary/20"
                    )}>
                        {percent === 100 ? <ShieldCheck className={cn("w-3.5 h-3.5", colorClass)} /> : <AlertTriangle className={cn("w-3.5 h-3.5", colorClass)} />}
                        <span className={cn("text-xs font-black uppercase tracking-widest", colorClass)}>
                            {percent === 100 ? 'Integridad Total' : percent > 80 ? 'Nivel Excelente' : percent > 50 ? 'Nivel Aceptable' : 'Riesgo Estructural'}
                        </span>
                    </div>
                    <p className="text-xs font-bold text-primary/60 leading-relaxed uppercase">
                        Basado en validaciones estructurales, rentabilidad y coeficientes indirectos.
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};

export default HealthBattery;
