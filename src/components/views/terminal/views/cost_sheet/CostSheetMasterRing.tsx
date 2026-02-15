'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn, formatCurrency } from '@/lib/utils';
import { TrendingUp, Package, Users, Settings, Zap } from 'lucide-react';
import { useTheme } from 'next-themes';

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
}

export const CostSheetMasterRing: React.FC<CostSheetMasterRingProps> = ({
  totalPrice,
  utility,
  totalCost,
  className
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

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
  const brandGreen = "text-primary dark:text-[#39FF14]";
  const brandGreenBg = "bg-primary dark:bg-[#39FF14]";
  const brandGreenBorder = "border-primary/20 dark:border-[#39FF14]/20";
  const brandGreenAlpha = "bg-primary/10 dark:bg-[#39FF14]/10";

  return (
    <div className={cn("flex flex-col items-center gap-10 w-full max-w-md mx-auto", className)}>
      {/* Main Master Ring */}
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        {/* Background Glow */}
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-[80px] opacity-50 dark:opacity-100" />

        {/* SVG Rings */}
        <svg
            width={size}
            height={size}
            className={cn(
                "-rotate-90 transition-all duration-500",
                isDark ? "drop-shadow-[0_0_15px_rgba(57,255,20,0.2)]" : "drop-shadow-[0_0_15px_rgba(22,163,74,0.1)]"
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
            className="text-slate-200/50 dark:text-slate-800/40"
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
            className="text-primary/20 dark:text-[#39FF14]/20"
          />

          {/* Utility Ring (Main Neon/Primary) */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className={brandGreen}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - (Math.min(utilityPercent, 100) / 100) * circumference }}
            transition={{ duration: 1.5, delay: 0.3, ease: "circOut" }}
            strokeLinecap="round"
            style={{
                filter: isDark
                    ? 'drop-shadow(0 0 12px rgba(57, 255, 20, 0.6))'
                    : 'drop-shadow(0 0 12px rgba(22, 163, 74, 0.3))',
            }}
          />
        </svg>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400 mb-1">Total Venta</span>
          <h2 className="text-5xl font-black tracking-tighter text-slate-900 dark:text-white">
            {formatCurrency(totalPrice).split(',')[0]}
            <span className="text-2xl opacity-40">,{formatCurrency(totalPrice).split(',')[1] || '00'}</span>
          </h2>
          <div className={cn("flex items-center gap-1.5 mt-3 px-4 py-1.5 rounded-full border backdrop-blur-sm transition-all duration-300", brandGreenAlpha, brandGreenBorder)}>
            <TrendingUp className={cn("w-3.5 h-3.5", brandGreen)} />
            <span className={cn("text-xs font-black", brandGreen)}>+{utilityPercent.toFixed(1)}%</span>
          </div>
        </div>

        {/* Badge Indicator */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2">
            <div className={cn(
                brandGreenBg,
                "text-white dark:text-black text-[10px] font-black px-5 py-2 rounded-full uppercase tracking-widest flex items-center gap-2 transition-all duration-300",
                isDark ? "shadow-[0_0_20px_rgba(57,255,20,0.5)]" : "shadow-[0_0_20px_rgba(22,163,74,0.3)]"
            )}>
                <Zap className="w-3 h-3 fill-current" />
                Margen Activo
            </div>
        </div>
      </div>

      {/* Primary KPI Breakdown */}
      <div className="flex flex-row justify-between items-start w-full px-4 sm:px-8 gap-4">
        <div className="flex flex-col min-w-0">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] text-slate-500 mb-2 truncate">Costo Bruto</span>
            <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-2xl font-black tabular-nums truncate text-slate-900 dark:text-white">{formatCurrency(totalCost)}</span>
            </div>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1 uppercase font-black tracking-tighter opacity-70">Total Gastos</p>
        </div>
        <div className="flex flex-col items-end text-right min-w-0">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] text-slate-500 mb-2 truncate">Utilidad Bruta</span>
            <div className="flex flex-col items-end">
                <div className="flex items-baseline gap-1">
                    <span className={cn("text-lg sm:text-2xl font-black tabular-nums truncate", brandGreen)}>{formatCurrency(utility)}</span>
                </div>
                <div className={cn("text-[10px] font-black mt-0.5 opacity-70", brandGreen)}>
                    {markupPercent.toFixed(1)}% sobre costo
                </div>
            </div>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1 uppercase font-black tracking-tighter opacity-70">Margen Neto</p>
        </div>
      </div>
    </div>
  );
};

export const CostSheetTelemetry: React.FC<{ telemetry: TelemetryItem[], className?: string }> = ({ telemetry, className }) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const brandGreen = "text-primary dark:text-[#39FF14]";
    const brandGreenBg = "bg-primary dark:bg-[#39FF14]";

    return (
      <div className={cn("w-full max-w-md mx-auto space-y-8 pt-10 border-t border-border/30", className)}>
        <div className="flex items-center justify-between px-2">
            <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Desglose Operativo</h4>
            <div className="flex items-center gap-2.5">
                <div className="relative flex h-2 w-2">
                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", brandGreenBg)}></span>
                    <span className={cn("relative inline-flex rounded-full h-2 w-2", brandGreenBg)}></span>
                </div>
                <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", brandGreen)}>Telemetría en Vivo</span>
            </div>
        </div>

        <div className="grid gap-4">
            {telemetry.map((item, idx) => (
                <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-[1.5rem] border border-border/40 flex items-center justify-between group hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                    <div className="flex items-center gap-5">
                        <div className={cn("p-3 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-border/50 transition-colors duration-300", item.color)}>
                            <item.icon className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{item.label}</p>
                            <p className="text-base font-black tracking-tight tabular-nums text-slate-900 dark:text-white">{formatCurrency(item.value)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                             <p className="text-[11px] font-black text-slate-400 tracking-tighter">{item.percent.toFixed(1)}%</p>
                        </div>
                        <div className="flex gap-1 items-end h-8">
                            {[1, 2, 3, 4, 5].map((bar) => {
                                const active = bar <= Math.ceil((item.percent / 100) * 5);
                                return (
                                    <div
                                        key={bar}
                                        className={cn(
                                            "w-1.5 rounded-full transition-all duration-700 delay-100",
                                            active ? brandGreenBg : "bg-slate-200 dark:bg-slate-800"
                                        )}
                                        style={{
                                            height: `${bar * 20 + 20}%`,
                                            opacity: active ? 1 : 0.3,
                                            boxShadow: active
                                                ? (isDark ? '0 0 8px rgba(57, 255, 20, 0.4)' : '0 0 8px rgba(22, 163, 74, 0.2)')
                                                : 'none'
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
