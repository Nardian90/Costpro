'use client';

import React, { memo, useMemo, useState, useEffect } from 'react';
import { CalculatedRowValue } from '@/types/cost-sheet';
import { Package, Users, Zap, Settings, Info, AlertTriangle, CheckCircle2, TrendingUp, DollarSign } from 'lucide-react';
import CostSheetMasterRing, { CostSheetTelemetry } from './CostSheetMasterRing';
import { Slider } from '@/components/ui/slider';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { cn } from '@/lib/utils';

interface CostSheetSummaryProps {
  calculatedValues: Record<string, CalculatedRowValue>;
  data: any;
}

const CostSheetSummary: React.FC<CostSheetSummaryProps> = memo(({ calculatedValues, data }) => {
  // Helper to get total for a row ID
  const getTotal = (id: string) => calculatedValues?.[id]?.total || 0;

  const totalPrice = getTotal('14');
  const utility = getTotal('13');
  const totalCost = getTotal('12');

  const telemetry = useMemo(() => {
    const rawMaterials = getTotal('1');
    const labor = getTotal('2');
    const directOther = getTotal('3');
    const indirects = getTotal('4') + getTotal('11');

    const totalForTelemetry = rawMaterials + labor + directOther + indirects || 1;

    return [
      {
        label: 'Materiales',
        value: rawMaterials,
        percent: (rawMaterials / totalForTelemetry) * 100,
        color: 'text-primary dark:text-[#39FF14]',
        icon: Package
      },
      {
        label: 'Mano de Obra',
        value: labor,
        percent: (labor / totalForTelemetry) * 100,
        color: 'text-green-400',
        icon: Users
      },
      {
        label: 'Gastos Directos',
        value: directOther,
        percent: (directOther / totalForTelemetry) * 100,
        color: 'text-emerald-400',
        icon: Zap
      },
      {
        label: 'Gastos Indirectos',
        value: indirects,
        percent: (indirects / totalForTelemetry) * 100,
        color: 'text-lime-400',
        icon: Settings
      }
    ];
  }, [calculatedValues]);

  const updateValue = useCostSheetStore(state => state.updateValue);

  // Current markup (utility over cost)
  const currentMarkup = totalCost > 0 ? (utility / totalCost) * 100 : 30;
  const [sliderValue, setSliderValue] = useState(currentMarkup);
  const [localPrice, setLocalPrice] = useState(totalPrice.toFixed(2));
  const [isEditingPrice, setIsEditingPrice] = useState(false);

  // Sync slider and local price with actual values if they change elsewhere
  useEffect(() => {
    setSliderValue(currentMarkup);
  }, [currentMarkup]);

  useEffect(() => {
    if (!isEditingPrice) {
        setLocalPrice(totalPrice.toFixed(2));
    }
  }, [totalPrice, isEditingPrice]);

  const updateUtilityFormula = (newValue: number) => {
    if (data?.sections) {
      for (let sIdx = 0; sIdx < data.sections.length; sIdx++) {
        const section = data.sections[sIdx];
        for (let rIdx = 0; rIdx < section.rows.length; rIdx++) {
          const row = section.rows[rIdx];
          if (row.id === '13' || row.label.toLowerCase().includes('utilidad')) {
            // Update formula to ref('12') * factor
            // Factor is newValue / 100
            const factor = (newValue / 100).toFixed(4);
            updateValue(['sections', sIdx, 'rows', rIdx, 'formula'], `ref('12') * ${factor}`);
            updateValue(['sections', sIdx, 'rows', rIdx, 'totalFormula'], `ref('12') * ${factor}`);
            return;
          }
        }
      }
    }
  };

  const handleSliderChange = (val: number[]) => {
    const newValue = val[0];
    setSliderValue(newValue);
    updateUtilityFormula(newValue);
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalPrice(val);

    const newPrice = parseFloat(val);
    if (isNaN(newPrice) || totalCost <= 0) return;

    // Calculate ratio to account for taxes: Price / (Cost + Utility)
    const currentSubtotal = totalCost + utility;
    const taxRatio = currentSubtotal > 0 ? totalPrice / currentSubtotal : 1;

    // targetSubtotal = newPrice / taxRatio
    const targetSubtotal = newPrice / (taxRatio || 1);
    const neededUtility = targetSubtotal - totalCost;
    const neededMargin = (neededUtility / totalCost) * 100;

    // Clamp margin to reasonable range (0% to 500%)
    const clampedMargin = Math.max(0, Math.min(500, neededMargin));

    setSliderValue(clampedMargin);
    updateUtilityFormula(clampedMargin);
  };

  const getFeedback = (pct: number) => {
    if (pct >= 20 && pct <= 30) return {
        text: "Precio para venta con productos normales.",
        color: "text-green-500",
        bg: "bg-green-500/10",
        border: "border-green-500/20",
        icon: CheckCircle2
    };
    if (pct >= 12 && pct < 20) return {
        text: "Venta mayorista para aumentar rotación.",
        color: "text-blue-500",
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
        icon: Info
    };
    if (pct < 12) return {
        text: "Cuidado: puede caer en pérdida al cumplir con las obligaciones tributarias.",
        color: "text-red-500",
        bg: "bg-red-500/10",
        border: "border-red-500/20",
        icon: AlertTriangle
    };
    return {
        text: "Precio que puede estancar mercancía o considerarse abusivo por las autoridades.",
        color: "text-amber-500",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        icon: AlertTriangle
    };
  };

  const feedback = getFeedback(sliderValue);

  return (
    <div className="space-y-12 pb-12">
      <CostSheetSummaryContent
        totalPrice={totalPrice}
        utility={utility}
        totalCost={totalCost}
      />

      {/* Utility Slider Control */}
      <div className="max-w-md mx-auto w-full px-6 py-8 rounded-[2.5rem] bg-sidebar/30 border border-sidebar-border/50 backdrop-blur-xl space-y-8 shadow-2xl">
        <div className="flex items-center justify-between px-2">
            <div className="space-y-1">
                <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-primary">Margen de Utilidad</h4>
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Ajuste dinámico sobre costo (13.1/12.1)</p>
            </div>
            <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black tracking-tighter text-foreground">{sliderValue.toFixed(1)}</span>
                <span className="text-sm font-black text-primary">%</span>
            </div>
        </div>

        {/* Dynamic Selling Price Input - Extension Plus */}
        <div className="px-2">
            <div className="group relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-emerald-500/50 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500"></div>
                <div className="relative flex items-center justify-between p-4 rounded-2xl bg-black/20 border border-white/5 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                            <DollarSign className="w-4 h-4 text-primary" />
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[9px] font-black text-primary uppercase tracking-[0.2em]">Precio de Venta</p>
                            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Objetivo Final</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-muted-foreground/50 tracking-tighter">$</span>
                        <input
                            type="number"
                            value={localPrice}
                            onFocus={() => setIsEditingPrice(true)}
                            onBlur={() => setIsEditingPrice(false)}
                            onChange={handlePriceChange}
                            className="w-28 bg-transparent border-none text-right font-black text-2xl tracking-tighter focus:ring-0 p-0 text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                    </div>
                </div>
            </div>
        </div>

        <div className="px-2 pt-2">
            <Slider
                value={[sliderValue]}
                min={1}
                max={100}
                step={0.5}
                onValueChange={handleSliderChange}
                className="py-4"
            />
            <div className="flex justify-between mt-2 px-1">
                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Mín 1%</span>
                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Máx 100%</span>
            </div>
        </div>

        {/* Feedback Note */}
        <div className={cn(
            "p-4 rounded-2xl border transition-all duration-500 flex items-start gap-4",
            feedback.bg,
            feedback.border
        )}>
            <div className={cn("p-2 rounded-xl bg-white dark:bg-slate-900 shadow-sm shrink-0", feedback.color)}>
                <feedback.icon className="w-4 h-4" />
            </div>
            <div className="space-y-1">
                <p className={cn("text-[10px] font-black uppercase tracking-widest", feedback.color)}>Análisis de Margen</p>
                <p className="text-xs font-bold text-foreground/80 leading-relaxed">
                    {feedback.text}
                </p>
            </div>
        </div>

        <div className="pt-4 border-t border-sidebar-border/30">
            <div className="flex items-center gap-3 px-2">
                <div className="p-2 rounded-lg bg-primary/10">
                    <TrendingUp className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-[9px] font-bold text-muted-foreground leading-tight uppercase">
                    El sistema recalcula automáticamente el precio final y los impuestos basándose en este margen de utilidad.
                </p>
            </div>
        </div>
      </div>

      <CostSheetTelemetry telemetry={telemetry} />
    </div>
  );
});

// Separate component for the content to ensure re-rendering with theme changes if needed
const CostSheetSummaryContent: React.FC<any> = ({ totalPrice, utility, totalCost }) => {
    return (
        <CostSheetMasterRing
            totalPrice={totalPrice}
            utility={utility}
            totalCost={totalCost}
        />
    );
}

export default CostSheetSummary;
