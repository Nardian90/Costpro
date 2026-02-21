'use client';

import React, { memo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Info,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Plus,
  Minus,
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

  const [localCoef, setLocalCoef] = useState(() => {
    // Try to extract current multiplier from section 4 formulas
    const s4 = data.sections.find(s => s.id === '4' || s.id === 's4');
    if (s4 && s4.rows.length > 0) {
      const firstRow = s4.rows[0];
      const formula = firstRow.formula || '';
      const match = formula.match(/\*\s*([\d.]+)$/);
      if (match) return parseFloat(match[1]);
    }
    return 1.0;
  });

  useEffect(() => {
    setSliderValue(currentMarkup);
  }, [currentMarkup]);

  useEffect(() => {
    if (!isEditingPrice) {
      setLocalPrice(totalPrice.toFixed(2));
    }
  }, [totalPrice, isEditingPrice]);

  // Decoupled from indirectCoef to allow manual multiplier setting

  const handleCoefChange = (newCoef: number) => {
    setLocalCoef(newCoef);

    const updates: { path: (string | number)[]; value: any }[] = [];

    ['4', '6', '7'].forEach(sectionId => {
      const sectionIndex = data.sections.findIndex(s => s.id === sectionId || s.id === `s${sectionId}`);
      if (sectionIndex !== -1) {
        const section = data.sections[sectionIndex];

        const walk = (rows: any[], pathBase: (string | number)[]) => {
          rows.forEach((row, rowIndex) => {
            const rowPath = [...pathBase, rowIndex];
            if (row.children && row.children.length > 0) {
              walk(row.children, [...rowPath, 'children']);
            } else {
              // Get current formula or fallback to value
              let currentFormula = row.formula || row.totalFormula || String(row.value || 0);
              let baseFormula = currentFormula.trim();
              if (baseFormula.startsWith('=')) baseFormula = baseFormula.substring(1).trim();

              // Extract base if already wrapped: (base) * coefficient
              const wrappedRegex = /^\((.*)\)\s*\*\s*[\d.]+$/;
              const match = baseFormula.match(wrappedRegex);
              const innerFormula = match ? match[1].trim() : baseFormula;

              // Inject the new coefficient wrapping the inner formula
              const finalFormula = `=(${innerFormula}) * ${newCoef.toFixed(4)}`;

              updates.push({
                path: [...rowPath, 'formula'],
                value: finalFormula
              });
              updates.push({
                path: [...rowPath, 'calculationMethod'],
                value: 'FORMULA'
              });
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

  const goalSeek = (target: number) => {
    if (isNaN(target) || target <= 0 || totalCost <= 0) return;

    // Use tax factor to estimate relationship: Price = (Cost + Utility) * Factor
    const baseVal = totalCost + utility;

    // Dynamic tax factor detection
    let safeTaxFactor = 1.1111; // Default fallback

    const currentTaxFactor = baseVal > 0 ? totalPrice / baseVal : 1.0;
    if (currentTaxFactor > 1.0001) {
      safeTaxFactor = currentTaxFactor;
    } else {
      // Try to extract it from row 13.2 formula (Impuesto sobre Ventas)
      const s13 = data.sections.find(s => s.id === "13" || s.id === "s13");
      const row13_2 = s13?.rows.find(r => r.id === "13.2");
      const formula = row13_2?.formula || row13_2?.totalFormula || "";

      // Standard pattern: ref("13.1")/0.9*0.1
      const match = formula.match(/\/([\d.]+)\*([\d.]+)$/);
      if (match) {
        const divisor = parseFloat(match[1]);
        const multiplier = parseFloat(match[2]);
        if (divisor > 0) {
          safeTaxFactor = 1 + (multiplier / divisor);
        }
      }
    }

    const getPriceForMargin = (m: number) => (totalCost * (1 + m / 100)) * safeTaxFactor;
    // Numerical approximation using Binary Search for efficiency and precision
    let low = 0.0001;
    let high = 5000;
    let iterations = 0;
    const tolerance = 0.0001;

    while (iterations < 40) {
      const mid = (low + high) / 2;
      const currentPrice = getPriceForMargin(mid);

      if (Math.abs(currentPrice - target) < tolerance) {
        low = mid;
        break;
      }

      if (currentPrice < target) {
        low = mid;
      } else {
        high = mid;
      }
      iterations++;
    }

    const clampedMargin = Math.max(0.0001, Math.min(2000, low));
    setSliderValue(clampedMargin);
    updateUtilityFormula(clampedMargin);
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalPrice(val);
    goalSeek(parseFloat(val));
  };

  const handlePriceAdjust = (delta: number) => {
    const current = parseFloat(localPrice) || totalPrice;
    const next = Math.max(0, current + delta);
    setLocalPrice(next.toFixed(2));
    goalSeek(next);
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
            <div className="px-6 py-2 rounded-full bg-primary/10 border border-primary/20 shadow-[0_0_20px_rgba(22,163,74,0.1)]">
              <span className="text-xs font-black uppercase tracking-[0.3em] text-primary animate-pulse">Margen Activo</span>
            </div>
          </div>
          <CostSheetMasterRing
            totalPrice={totalPrice}
            utility={utility}
            totalCost={totalCost}
            onPriceChange={goalSeek}
            onPriceAdjust={handlePriceAdjust}
          />
        </div>

        <div className="w-full lg:w-[600px]">
          <div className="glass-card-stitch rounded-3xl p-10 relative overflow-hidden group shadow-2xl">
            <header className="mb-10">
              <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2 font-bold">Margen de Utilidad</p>
              <div className="flex items-baseline gap-1">
                <h1 className="font-display text-[clamp(2rem,10vw,3.75rem)] font-bold tracking-tighter neon-glow text-foreground leading-none">
                  {sliderValue.toFixed(3)}<span className="text-primary text-[clamp(1.25rem,5vw,2.25rem)] ml-1">%</span>
                </h1>
              </div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mt-2">Ajuste dinámico sobre costo (13.1/12.1)</p>
            </header>



            <div className="space-y-10 mb-12">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Margen Deseado</label>
                  <span className="text-primary font-display font-bold">{sliderValue.toFixed(3)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSliderChange([Math.max(1, sliderValue - 1)])}
                    className="h-11 w-11 flex items-center justify-center shrink-0 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-90"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <Slider
                  value={[sliderValue]}
                  min={1}
                  max={100}
                  step={0.5}
                  onValueChange={handleSliderChange}
                  className="w-full"
                />
                  <button
                    onClick={() => handleSliderChange([Math.min(100, sliderValue + 1)])}
                    className="h-11 w-11 flex items-center justify-center shrink-0 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-90"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground uppercase font-bold tracking-tighter">
                  <span>mín 1%</span>
                  <span>máx 100%</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Coeficiente</label>
                  <span className="text-primary font-display font-bold">{localCoef.toFixed(4)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleCoefChange(Math.max(0, localCoef - 0.0001))}
                    className="h-11 w-11 flex items-center justify-center shrink-0 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-90"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <Slider
                  value={[localCoef]}
                  min={0}
                  max={4}
                  step={0.0001}
                  onValueChange={(val) => handleCoefChange(val[0])}
                  className="w-full"
                />
                  <button
                    onClick={() => handleCoefChange(Math.min(4, localCoef + 0.0001))}
                    className="h-11 w-11 flex items-center justify-center shrink-0 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-90"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-muted-foreground uppercase font-bold tracking-tighter">
                    <span>mín 0.0</span>
                    <span>máx 4.0</span>
                  </div>
                  <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/10 shadow-[inner_0_1px_2px_rgba(0,0,0,0.1)]">
                    <p className="text-xs text-muted-foreground uppercase tracking-[0.1em] leading-relaxed flex justify-between items-center">
                      <span>Relación Actual (Gtos Ind. / Salario):</span>
                      <span className="text-primary font-black text-xs">{indirectCoef.toFixed(4)}</span>
                    </p>
                  </div>
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
                <p className="text-xs text-muted-foreground uppercase tracking-widest leading-tight">
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
