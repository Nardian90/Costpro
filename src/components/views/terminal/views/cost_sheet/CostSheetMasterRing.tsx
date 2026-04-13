'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn, formatCurrency } from '@/lib/utils';
import { TrendingUp, Package, Users, Settings, Zap, Plus, Minus } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface TelemetryItem {
  label: string;
  value: number;
  percent: number;
  color: string;
  icon: any;
}

interface CostSheetMasterRingProps {
  totalPrice: number;
  utility: number;
  totalCost: number;
  className?: string;
  onPriceChange?: (value: number) => void;
  onPriceAdjust?: (delta: number) => void;
}

export const CostSheetMasterRing: React.FC<CostSheetMasterRingProps> = ({
  totalPrice,
  utility,
  totalCost,
  className,
  onPriceChange,
  onPriceAdjust
}) => {
  const utilityPercent = totalPrice > 0 ? (utility / totalPrice) * 100 : 0;
  const costPercent = totalPrice > 0 ? (totalCost / totalPrice) * 100 : 0;
  const markupPercent = totalCost > 0 ? (utility / totalCost) * 100 : 0;

  // Ring configurations
  const size = 320;
  const strokeWidth = 16;
  const center = size / 2;
  const radius = (size - strokeWidth * 4) / 2;
  const circumference = 2 * Math.PI * radius;

  // Colors based on theme
  const brandGreen = "text-primary";
  const brandGreenBg = "bg-primary";
  const brandGreenBorder = "border-primary/20";
  const brandGreenAlpha = "bg-primary/10";

  return (
    <div className={cn("flex flex-col items-center gap-10 w-full max-w-md mx-auto", className)}>
      {/* Main Master Ring */}
      <div className="relative flex items-center justify-center mx-auto aspect-square w-full max-w-[320px]">
        {/* Background Glow */}
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-[80px] opacity-50 dark:opacity-100" />

        {/* SVG Rings */}
        <svg
            viewBox={`0 0 ${size} ${size}`}
            className={cn(
                "w-full h-full max-w-[320px] -rotate-90 transition-all duration-500",
                "drop-shadow-[0_0_15px_rgba(22,163,74,0.1)] dark:drop-shadow-[0_0_15px_hsl(var(--primary)/0.2)]"
            )}
        >
          {/* Base Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/50 dark:text-border/40"
          />

          {/* Cost Ring (Background track) */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - (Math.min(costPercent, 100) / 100) * circumference }}
            transition={{ duration: 1.5, ease: "circOut" }}
            strokeLinecap="round"
            className="text-primary/20"
          />

          {/* Utility Ring (Main Neon/Primary) */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className={cn(brandGreen, "[filter:drop-shadow(0_0_8px_var(--primary))] dark:[filter:drop-shadow(0_0_12px_var(--primary))]")}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - (Math.min(utilityPercent, 100) / 100) * circumference }}
            transition={{ duration: 1.5, delay: 0.3, ease: "circOut" }}
            strokeLinecap="round"
          />
        </svg>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs font-black uppercase tracking-[0.4em] text-primary/70 mb-1">Total Venta</span>
          <h2 className="text-[clamp(2.25rem,12vw,3rem)] font-black tracking-tighter text-primary">
            {formatCurrency(totalPrice).split(',')[0]}
            <span className="text-[clamp(1rem,4vw,1.5rem)] opacity-40">,{formatCurrency(totalPrice).split(',')[1] || '00'}</span>
          </h2>
          <div className={cn("flex items-center gap-1.5 mt-3 px-4 py-1.5 rounded-full border backdrop-blur-sm transition-all duration-300", brandGreenAlpha, brandGreenBorder)}>
            <TrendingUp className={cn("w-3.5 h-3.5", brandGreen)} />
            <span className={cn("text-xs font-black", brandGreen)}>+{utilityPercent.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Price Control Slider */}
      {onPriceChange && (
        <div className="flex items-center gap-3 w-full px-4 sm:px-8 -mt-4 mb-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPriceAdjust?.(-1);
            }}
            className="h-11 w-11 flex items-center justify-center shrink-0 rounded-xl bg-muted dark:bg-muted/50 hover:bg-primary/10 hover:text-primary transition-all active:scale-95 border border-transparent hover:border-primary/20"
          >
            <Minus className="w-4 h-4" />
          </button>

          <div className="flex-1 px-2">
            <Slider
              value={[totalPrice]}
              min={totalCost}
              max={Math.max(totalPrice * 2, totalCost * 3)}
              step={0.01}
              onValueChange={(val) => onPriceChange(val[0])}
              className="w-full"
            />
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onPriceAdjust?.(1);
            }}
            className="h-11 w-11 flex items-center justify-center shrink-0 rounded-xl bg-muted dark:bg-muted/50 hover:bg-primary/10 hover:text-primary transition-all active:scale-95 border border-transparent hover:border-primary/20"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Primary KPI Breakdown */}
      <div className="flex flex-row justify-between items-start w-full px-4 sm:px-8 gap-2 sm:gap-4">
        <div className="flex flex-col min-w-0">
            <span className="text-xs sm:text-xs font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] text-primary/70 mb-2 truncate">Costo Bruto</span>
            <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-2xl font-black tabular-nums truncate text-primary">{formatCurrency(totalCost)}</span>
            </div>
            <p className="text-xs sm:text-xs text-muted-foreground/70 mt-1 uppercase font-black tracking-tighter opacity-70">Total Gastos</p>
        </div>
        <div className="flex flex-col items-end text-right min-w-0">
            <span className="text-xs sm:text-xs font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] text-primary/70 mb-2 truncate">Utilidad Bruta</span>
            <div className="flex flex-col items-end">
                <div className="flex items-baseline gap-1">
                    <span className={cn("text-lg sm:text-2xl font-black tabular-nums truncate", brandGreen)}>{formatCurrency(utility)}</span>
                </div>
                <div className={cn("text-xs font-black mt-0.5 opacity-70", brandGreen)}>
                    {markupPercent.toFixed(1)}% sobre costo
                </div>
            </div>
            <p className="text-xs sm:text-xs text-muted-foreground/70 mt-1 uppercase font-black tracking-tighter opacity-70">Margen Neto</p>
        </div>
      </div>
    </div>
  );
};

export const CostSheetTelemetry: React.FC<{ telemetry: TelemetryItem[], className?: string }> = ({ telemetry, className }) => {
    const brandGreen = "text-primary";
    const brandGreenBg = "bg-primary";

    return (
      <div className={cn("w-full max-w-md mx-auto space-y-8 pt-10 border-t border-border/30", className)}>
        <div className="flex items-center justify-between px-2">
            <h4 className="text-xs font-black uppercase tracking-[0.3em] text-primary/70">Desglose Operativo</h4>
            <div className="flex items-center gap-2.5">
                <div className="relative flex h-2 w-2">
                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", brandGreenBg)}></span>
                    <span className={cn("relative inline-flex rounded-full h-2 w-2", brandGreenBg)}></span>
                </div>
                <span className={cn("text-xs font-black uppercase tracking-[0.2em]", brandGreen)}>Telemetría en Vivo</span>
            </div>
        </div>

        <div className="grid gap-4">
            {telemetry.map((item, idx) => (
                <div key={idx} className="bg-muted/50 dark:bg-background/50 p-4 rounded-[1.5rem] border border-border/40 flex items-center justify-between group hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                    <div className="flex items-center gap-5">
                        <div className={cn("p-3 rounded-2xl bg-card dark:bg-muted shadow-sm border border-border/50 transition-colors duration-300", item.color)}>
                            <item.icon className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-black text-primary/70 uppercase tracking-widest mb-0.5">{item.label}</p>
                            <p className="text-base font-black tracking-tight tabular-nums text-primary">{formatCurrency(item.value)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                             <p className="text-xs font-black text-muted-foreground/70 tracking-tighter">{item.percent.toFixed(1)}%</p>
                        </div>
                        <div className="flex gap-1 items-end h-8">
                            {[1, 2, 3, 4, 5].map((bar) => {
                                const active = bar <= Math.ceil((item.percent / 100) * 5);
                                return (
                                    <div
                                        key={bar}
                                        className={cn(
                                            "w-1.5 rounded-full transition-all duration-700 delay-100",
                                            active ? brandGreenBg : "bg-muted dark:bg-muted",
                                            active && "[box-shadow:0_0_8px_rgba(22,163,74,0.2)] dark:[box-shadow:0_0_8px_hsl(var(--primary)/0.4)]"
                                        )}
                                        style={{
                                            height: `${bar * 20 + 20}%`,
                                            opacity: active ? 1 : 0.3,
                                        }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </div>
    );
};

export default CostSheetMasterRing;
