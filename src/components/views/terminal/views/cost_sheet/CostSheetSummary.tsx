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
  healthPercent?: number;
}

const CostSheetSummary: React.FC<CostSheetSummaryProps> = memo(({
  totalPrice,
  utility,
  totalCost,
  telemetry,
  header,
  healthPercent: providedHealthPercent
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

    const updates: { path: (string | number)[]; value: any }[] = [];

    ['4', '6', '7'].forEach(sectionId => {
      const sectionIndex = data.sections.findIndex(s => s.id === sectionId);
      if (sectionIndex !== -1) {
        const section = data.sections[sectionIndex];

        const walk = (rows: any[], pathBase: (string | number)[]) => {
          rows.forEach((row, rowIndex) => {
            const rowPath = [...pathBase, rowIndex];
            if (row.children && row.children.length > 0) {
              walk(row.children, [...rowPath, 'children']);
            } else {
              let baseValue = 0;
              // Intentar extraer la base de la fórmula si ya sigue el patrón =(X) * Y
              const formulaMatch = row.formula?.match(/^=\((([\d.]+))\)\s*\*\s*[\d.]+$/);
              if (formulaMatch) {
                baseValue = parseFloat(formulaMatch[1]);
              } else {
                // De lo contrario, calcular la base basada en el coeficiente indirecto actual
                // El objetivo es que Sum(baseValue) = row2 (Salario Directo)
                baseValue = indirectCoef > 0 ? (row.value || 0) / indirectCoef : 0;
              }

              if (!isNaN(baseValue)) {
                // Formatear con 4 decimales para precisión en la base, y 2 para el coeficiente
                updates.push({
                  path: [...rowPath, 'formula'],
                  value: `=(${baseValue.toFixed(4)}) * ${newCoef.toFixed(2)}`
                });
                updates.push({
                  path: [...rowPath, 'calculationMethod'],
                  value: 'FORMULA'
                });
              }
            }
          });
        };

        walk(section.rows, ['sections', sectionIndex, 'rows']);
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

  // Health calculation - Use provided or fallback to simple if not available (legacy)
  const healthPercent = providedHealthPercent !== undefined ? providedHealthPercent : (() => {
    const structuralIntegrity = !Object.values(telemetry).some(r => r.hasWarnings);
    const profitability = totalCost > 0 ? (utility / totalCost) <= 0.3 : true;
    const dest = header?.destino || header?.destination || '';
    const maxCoef = (String(dest).toLowerCase() === 'servicios') ? 1.0 : 1.5;
    const indirectLimitPassed = indirectCoef <= maxCoef;

    const validations = [
      { name: 'Integridad Estructural', passed: structuralIntegrity },
      { name: 'Rentabilidad', passed: profitability },
      { name: 'Gasto Indirecto', passed: indirectLimitPassed }
    ];
    const passedCount = validations.filter(v => v.passed).length;
    return (passedCount / validations.length) * 100;
  })();

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

        <div className="w-full lg:w-[450px]">
          <div className="glass-card-stitch rounded-3xl p-8 relative overflow-hidden group shadow-2xl">
            <header className="mb-10">
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary mb-2 font-bold">Margen de Utilidad</p>
              <div className="flex items-baseline gap-1">
                <h1 className="font-display text-6xl font-bold tracking-tighter neon-glow text-foreground">
                  {sliderValue.toFixed(1)}<span className="text-primary text-3xl ml-1">%</span>
                </h1>
              </div>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-2">Ajuste dinámico sobre costo (13.1/12.1)</p>
            </header>

            <div className="glass-card-stitch rounded-2xl p-6 mb-10 relative overflow-hidden group/price">
              <div className="absolute -right-4 -top-4 opacity-5 group-hover/price:opacity-10 transition-opacity">
                <DollarSign className="w-24 h-24 text-foreground" />
              </div>
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <DollarSign className="text-primary w-8 h-8 font-bold" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-1">Precio de Venta</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-light text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={localPrice}
                      onFocus={() => setIsEditingPrice(true)}
                      onBlur={() => setIsEditingPrice(false)}
                      onChange={handlePriceChange}
                      className="bg-transparent border-none text-left font-display text-4xl font-bold tracking-tight focus:ring-0 p-0 text-foreground w-full"
                    />
                  </div>
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground mt-1">Objetivo Final Calculado</p>
                </div>
              </div>
            </div>

            <div className="space-y-10 mb-12">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Margen Deseado</label>
                  <span className="text-primary font-display font-bold">{sliderValue.toFixed(1)}%</span>
                </div>
                <Slider
                  value={[sliderValue]}
                  min={1}
                  max={100}
                  step={0.5}
                  onValueChange={handleSliderChange}
                  className="w-full"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">
                  <span>mín 1%</span>
                  <span>máx 100%</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Coeficiente</label>
                  <span className="text-primary font-display font-bold">{localCoef.toFixed(2)}</span>
                </div>
                <Slider
                  value={[localCoef]}
                  min={0.1}
                  max={5}
                  step={0.01}
                  onValueChange={(val) => handleCoefChange(val[0])}
                  className="w-full"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">
                  <span>base 1.0</span>
                  <span>máx 5.0</span>
                </div>
              </div>
            </div>

            <div className={cn(
              "amber-glow-border p-5 rounded-r-xl mb-auto transition-all duration-500",
              sliderValue > 30 ? "bg-amber-500/5 opacity-100" : "bg-primary/5 border-primary opacity-80"
            )}>
              <div className="flex gap-4">
                <feedback.icon className={cn("shrink-0 w-6 h-6", feedback.color)} />
                <div>
                  <h3 className={cn("text-xs font-bold uppercase tracking-widest mb-2", feedback.color)}>Análisis de Margen</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feedback.text}
                  </p>
                </div>
              </div>
            </div>

            <footer className="mt-12 pt-6 border-t border-white/5">
              <div className="flex items-center gap-3">
                <div className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest leading-tight">
                  El sistema recalcula automáticamente el precio final y los impuestos basándose en este margen de utilidad.
                </p>
              </div>
            </footer>
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
