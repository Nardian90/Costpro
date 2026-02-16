'use client';

import React, { memo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Info,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Activity,
  ShieldCheck,
  Wand2,
  BookOpen,
  Package,
  Users,
  Zap,
  Settings,
  AlertTriangle
} from 'lucide-react';
import { CalculatedRowValue, CostSheetHeader } from '@/types/cost-sheet';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { Slider } from '@/components/ui/slider';
import HealthBattery from './HealthBattery';
import CostSheetMasterRing, { CostSheetTelemetry } from './CostSheetMasterRing';

interface CostSheetSummaryProps {
  totalPrice: number;
  utility: number;
  totalCost: number;
  telemetry: Record<string, CalculatedRowValue>;
  header?: CostSheetHeader;
}

const CostSheetSummary: React.FC<CostSheetSummaryProps> = memo(({
  totalPrice,
  utility,
  totalCost,
  telemetry,
  header
}) => {
  const updateUtilityFormula = useCostSheetStore(state => state.updateUtilityFormula);
  const updateValues = useCostSheetStore(state => state.updateValues);
  const data = useCostSheetStore(state => state.data);

  // Current markup (utility over cost)
  const currentMarkup = totalCost > 0 ? (utility / totalCost) * 100 : 30;
  const [sliderValue, setSliderValue] = useState(currentMarkup);
  const [localPrice, setLocalPrice] = useState(totalPrice.toFixed(2));
  const [isEditingPrice, setIsEditingPrice] = useState(false);

  // Indirect Coefficient logic
  const row2 = telemetry['2']?.total || 0;
  const row4 = telemetry['4']?.total || 0;
  const row6 = telemetry['6']?.total || 0;
  const row7 = telemetry['7']?.total || 0;
  const indirectSum = row4 + row6 + row7;
  const indirectCoef = row2 > 0 ? indirectSum / row2 : 0;

  const [localCoef, setLocalCoef] = useState(indirectCoef);

  useEffect(() => {
    setSliderValue(currentMarkup);
  }, [currentMarkup]);

  useEffect(() => {
    if (!isEditingPrice) {
      setLocalPrice(totalPrice.toFixed(2));
    }
  }, [totalPrice, isEditingPrice]);

  useEffect(() => {
    setLocalCoef(indirectCoef);
  }, [indirectCoef]);

  const handleCoefChange = (newCoef: number) => {
    setLocalCoef(newCoef);
    if (row2 <= 0) return;

    const targetTotal = row2 * newCoef;
    const currentTotal = indirectSum;
    if (currentTotal <= 0) return;

    const factor = targetTotal / currentTotal;
    const updates: { path: (string | number)[]; value: number }[] = [];

    ['4', '6', '7'].forEach(sectionId => {
      const sectionIndex = data.sections.findIndex(s => s.id === sectionId);
      if (sectionIndex !== -1) {
        const section = data.sections[sectionIndex];
        section.rows.forEach((row, rowIndex) => {
          if (row.calculationMethod === 'ValorFijo' || !row.formula) {
            const currentValue = row.value || 0;
            updates.push({
              path: ['sections', sectionIndex, 'rows', rowIndex, 'value'],
              value: currentValue * factor
            });
          }
        });
      }
    });

    if (updates.length > 0) {
      updateValues(updates);
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

    const numericPrice = parseFloat(val);
    if (isNaN(numericPrice) || numericPrice <= 0 || totalCost <= 0) return;

    const neededUtility = numericPrice - totalCost;
    const neededMargin = (neededUtility / totalCost) * 100;
    const clampedMargin = Math.max(0, Math.min(500, neededMargin));

    setSliderValue(clampedMargin);
    updateUtilityFormula(clampedMargin);
  };

  const getFeedback = (pct: number) => {
    if (pct >= 20 && pct <= 30) return {
      text: "Precio para venta con productos normales.",
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20"
    };
    if (pct < 12) return {
      text: "Riesgo de pérdida. Margen insuficiente.",
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-500/10",
      border: "border-red-500/20"
    };
    if (pct > 30) return {
      text: "Margen abusivo o de alto riesgo comercial.",
      icon: AlertCircle,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20"
    };
    return {
      text: "Precio de venta mayorista o competitivo.",
      icon: Info,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20"
    };
  };

  const feedback = getFeedback(sliderValue);

  // Health calculation
  const structuralIntegrity = !Object.values(telemetry).some(r => r.hasWarnings);
  const profitability = (utility / totalCost) <= 0.3;
  const maxCoef = (header?.destino === 'servicios') ? 1.0 : 1.5;
  const indirectLimitPassed = indirectCoef <= maxCoef;

  const validations = [
    { name: 'Integridad Estructural', passed: structuralIntegrity },
    { name: 'Rentabilidad', passed: profitability },
    { name: 'Gasto Indirecto', passed: indirectLimitPassed }
  ];
  const passedCount = validations.filter(v => v.passed).length;
  const healthPercent = (passedCount / validations.length) * 100;

  // Map telemetry to array for CostSheetTelemetry component
  const telemetryItems = [
    {
      label: 'Materiales',
      value: telemetry['1']?.total || 0,
      percent: totalCost > 0 ? ((telemetry['1']?.total || 0) / totalCost) * 100 : 0,
      color: 'text-emerald-500',
      icon: Package
    },
    {
      label: 'Mano de Obra',
      value: telemetry['2']?.total || 0,
      percent: totalCost > 0 ? ((telemetry['2']?.total || 0) / totalCost) * 100 : 0,
      color: 'text-blue-500',
      icon: Users
    },
    {
      label: 'Gastos Directos',
      value: telemetry['3']?.total || 0,
      percent: totalCost > 0 ? ((telemetry['3']?.total || 0) / totalCost) * 100 : 0,
      color: 'text-cyan-500',
      icon: Zap
    },
    {
      label: 'Gastos Indirectos',
      value: indirectSum,
      percent: totalCost > 0 ? (indirectSum / totalCost) * 100 : 0,
      color: 'text-amber-500',
      icon: Settings
    }
  ];

  return (
    <div className="flex flex-col gap-12 max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-12 items-center lg:items-start">
        <div className="flex-1 w-full space-y-8">
          <div className="flex items-center justify-between mb-4">
            <div className="px-6 py-2 rounded-full bg-primary/10 border border-primary/20 shadow-[0_0_20px_rgba(57,255,20,0.1)]">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary animate-pulse">Margen Activo</span>
            </div>
          </div>
          <CostSheetMasterRing
            totalPrice={totalPrice}
            utility={utility}
            totalCost={totalCost}
          />
        </div>

        <div className="w-full lg:w-[450px] space-y-6">
          <div className="relative group p-8 rounded-[2.5rem] bg-sidebar/30 border border-sidebar-border/50 backdrop-blur-xl shadow-2xl transition-all duration-500 hover:border-primary/30">
            <div className="space-y-8">
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Margen de Utilidad</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">Ajuste dinámico sobre costo (13.1/12.1)</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-black tracking-tighter text-foreground">{sliderValue.toFixed(1)}</span>
                  <span className="text-xl font-black text-primary">%</span>
                </div>
              </div>

              <div className="space-y-6">
                <div className="group relative">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-emerald-500/50 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500"></div>
                  <div className="relative flex items-center justify-between p-5 rounded-2xl bg-black/40 border border-white/5 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                        <DollarSign className="w-5 h-5 text-primary" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Precio de Venta</p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Objetivo Final</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-muted-foreground/50 tracking-tighter">$</span>
                      <input
                        type="number"
                        value={localPrice}
                        onFocus={() => setIsEditingPrice(true)}
                        onBlur={() => setIsEditingPrice(false)}
                        onChange={handlePriceChange}
                        className="w-32 bg-transparent border-none text-right font-black text-3xl tracking-tighter focus:ring-0 p-0 text-foreground"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-row gap-6 h-64">
                  <div className="flex flex-col items-center bg-black/20 border border-white/5 rounded-3xl p-4 w-20 shadow-inner">
                    <p className="text-[8px] font-black text-primary/70 uppercase tracking-[0.3em] mb-4 [writing-mode:vertical-lr] rotate-180">COEFICIENTE</p>
                    <div className="flex-1 flex items-center py-2">
                      <Slider
                        value={[localCoef]}
                        min={0.1}
                        max={50}
                        step={0.05}
                        orientation="vertical"
                        onValueChange={(val) => handleCoefChange(val[0])}
                        className="h-full"
                      />
                    </div>
                    <span className="text-[10px] font-black text-primary mt-4 tabular-nums">{localCoef.toFixed(2)}</span>
                  </div>

                  <div className="flex-1 flex flex-col justify-center gap-8">
                    <div className="space-y-4">
                      <Slider
                        value={[sliderValue]}
                        min={1}
                        max={100}
                        step={0.5}
                        onValueChange={handleSliderChange}
                        className="py-4"
                      />
                      <div className="flex justify-between px-1">
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Mín 1%</span>
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Máx 100%</span>
                      </div>
                    </div>

                    <div className={cn(
                      "p-5 rounded-2xl border transition-all duration-500 flex items-start gap-4",
                      feedback.bg,
                      feedback.border
                    )}>
                      <div className={cn("p-2.5 rounded-xl bg-white dark:bg-slate-900 shadow-sm shrink-0", feedback.color)}>
                        <feedback.icon className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className={cn("text-[10px] font-black uppercase tracking-widest", feedback.color)}>Análisis de Margen</p>
                        <p className="text-xs font-bold text-foreground/80 leading-relaxed">
                          {feedback.text}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                  <div className="flex items-center gap-4 px-2">
                    <div className="p-2.5 rounded-xl bg-primary/10">
                      <TrendingUp className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground leading-relaxed uppercase tracking-wide">
                      El sistema recalcula automáticamente el precio final y los impuestos basándose en este margen de utilidad.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <HealthBattery percent={healthPercent} />
        <CostSheetTelemetry telemetry={telemetryItems} />
      </div>
    </div>
  );
});

CostSheetSummary.displayName = 'CostSheetSummary';

export default CostSheetSummary;
