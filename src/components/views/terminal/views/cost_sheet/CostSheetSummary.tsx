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
  AlertTriangle,
  RefreshCw,
  Target
} from 'lucide-react';
import { CalculatedRowValue, CostSheetHeader } from '@/types/cost-sheet';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const updateAnnexAdjustment = useCostSheetStore(state => state.updateAnnexAdjustment);
  const data = useCostSheetStore(state => state.data);

  // Current markup (utility over cost)
  const currentMarkup = totalCost > 0 ? (utility / totalCost) * 100 : 30;
  const [sliderValue, setSliderValue] = useState(currentMarkup);
  const [localPrice, setLocalPrice] = useState(totalPrice.toFixed(2));
  const [isEditingPrice, setIsEditingPrice] = useState(false);

  // Auto-adjustment state
  const [selectedAnnexId, setSelectedAnnexId] = useState<string>(data?.annexes?.[0]?.id || '');
  const [targetValue, setTargetValue] = useState<string>('');
  const [targetRowId, setTargetRowId] = useState<string>('14.1');
  const [adjustmentColumn, setAdjustmentColumn] = useState<string>('PRECIO UNITARIO');

  // Indirect Coefficient logic
  const row2 = telemetry['2']?.total || 0;
  const row4 = telemetry['4']?.total || 0;
  const row6 = telemetry['6']?.total || 0;
  const row7 = telemetry['7']?.total || 0;
  const indirectSum = row4 + row6 + row7;
  const indirectCoef = row2 > 0 ? (indirectSum / row2) : 0;
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

  const handleSliderChange = (val: number[]) => {
    const newValue = val[0];
    setSliderValue(newValue);
    updateUtilityFormula(newValue);
  };

  const handleCoefChange = (val: number) => {
    setLocalCoef(val);
    const updates = [
      { path: ['sections', 0, 'rows', 3, 'value'], value: val }, // Row 4
      { path: ['sections', 0, 'rows', 5, 'value'], value: val }, // Row 6
      { path: ['sections', 0, 'rows', 6, 'value'], value: val }  // Row 7
    ];
    updateValues(updates);
  };

  const goalSeek = (targetPrice: number) => {
    if (totalCost <= 0) return;
    const requiredMarkup = ((targetPrice / totalCost) - 1) * 100;
    const clampedMarkup = Math.max(1, Math.min(100, requiredMarkup));
    handleSliderChange([clampedMarkup]);
  };

  const handlePriceAdjust = (newPrice: number) => {
    setLocalPrice(newPrice.toFixed(2));
    goalSeek(newPrice);
  };

  const handleAutoAdjust = () => {
    const target = parseFloat(targetValue);
    if (isNaN(target) || !selectedAnnexId) return;

    const currentTargetValue = telemetry[targetRowId]?.total || 0;
    if (currentTargetValue === 0) return;

    const annex = data.annexes.find(a => a.id === selectedAnnexId);
    if (!annex) return;

    const currentCoef = annex.coefficient || 1;
    // Linear approximation: target / currentTargetValue = newCoef / currentCoef
    const newCoef = (target / currentTargetValue) * currentCoef;

    updateAnnexAdjustment(selectedAnnexId, newCoef, adjustmentColumn);
  };

  const getFeedback = (pct: number) => {
    if (pct < 10) return {
      text: "Margen bajo. Verifique si cubre los gastos operativos de forma sostenible.",
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

        <div className="w-full lg:w-[600px] space-y-8">
          {/* Main Adjustment Card */}
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
                <p className="text-[clamp(0.7rem,2vw,0.75rem)] text-muted-foreground uppercase tracking-widest leading-tight">
                  El sistema recalcula automáticamente el precio final y los impuestos basándose en este margen de utilidad.
                </p>
              </div>
            </footer>
          </div>

          {/* Auto-Adjustment Card */}
          <div className="glass-card-stitch rounded-3xl p-8 relative overflow-hidden border border-primary/20 shadow-xl bg-primary/5">
            <header className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-primary mb-1 font-bold">Ajuste por Coeficiente</p>
                <h3 className="text-lg font-black uppercase tracking-tighter italic text-foreground flex items-center gap-2">
                   <RefreshCw className="w-4 h-4 text-primary" /> Auto-ajuste de Anexos
                </h3>
              </div>
              <div className="p-2 rounded-xl bg-primary/10">
                <Wand2 className="w-5 h-5 text-primary animate-pulse" />
              </div>
            </header>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Seleccionar Anexo</label>
                  <Select value={selectedAnnexId} onValueChange={setSelectedAnnexId}>
                    <SelectTrigger className="h-10 bg-background/50 border-border rounded-xl text-xs font-bold uppercase">
                      <SelectValue placeholder="Anexo" />
                    </SelectTrigger>
                    <SelectContent>
                      {data?.annexes?.map(annex => (
                        <SelectItem key={annex.id} value={annex.id} className="text-xs font-bold uppercase">
                          Anexo {annex.id}: {annex.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Columna base</label>
                  <Select value={adjustmentColumn} onValueChange={setAdjustmentColumn}>
                    <SelectTrigger className="h-10 bg-background/50 border-border rounded-xl text-xs font-bold uppercase">
                      <SelectValue placeholder="Columna" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRECIO UNITARIO" className="text-xs font-bold uppercase">Precio Unitario</SelectItem>
                      <SelectItem value="VALOR" className="text-xs font-bold uppercase">Valor</SelectItem>
                      <SelectItem value="IMPORTE" className="text-xs font-bold uppercase">Importe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Variable Objetivo</label>
                  <Select value={targetRowId} onValueChange={setTargetRowId}>
                    <SelectTrigger className="h-10 bg-background/50 border-border rounded-xl text-xs font-bold uppercase">
                      <SelectValue placeholder="Target" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="14.1" className="text-xs font-bold uppercase">14.1 - Precio Final</SelectItem>
                      <SelectItem value="12" className="text-xs font-bold uppercase">12 - Costo Total</SelectItem>
                      <SelectItem value="13.1" className="text-xs font-bold uppercase">13.1 - Utilidad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Valor Objetivo</label>
                  <div className="relative">
                    <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      placeholder="Ej: 500.00"
                      className="h-10 pl-9 bg-background/50 border-border rounded-xl text-xs font-bold font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-black/20 border border-white/5 space-y-3">
                 <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                    <span className="text-muted-foreground">Valor Actual (Target):</span>
                    <span className="text-foreground">{(telemetry[targetRowId]?.total || 0).toLocaleString('es-CU', { style: 'currency', currency: 'CUP' })}</span>
                 </div>
                 {targetValue && !isNaN(parseFloat(targetValue)) && (
                   <>
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="text-muted-foreground">Diferencia:</span>
                        <span className={cn(
                          parseFloat(targetValue) - (telemetry[targetRowId]?.total || 0) > 0 ? "text-emerald-500" : "text-red-500"
                        )}>
                          {(parseFloat(targetValue) - (telemetry[targetRowId]?.total || 0)).toLocaleString('es-CU', { style: 'currency', currency: 'CUP' })}
                          {" ("}{(((parseFloat(targetValue) / (telemetry[targetRowId]?.total || 1)) - 1) * 100).toFixed(2)}%{")"}
                        </span>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="text-primary italic">Coeficiente sugerido:</span>
                        <span className="text-primary font-mono">
                          {((parseFloat(targetValue) / (telemetry[targetRowId]?.total || 1)) * (data.annexes.find(a => a.id === selectedAnnexId)?.coefficient || 1)).toFixed(4)}
                        </span>
                    </div>
                   </>
                 )}
              </div>

              <Button
                onClick={handleAutoAdjust}
                disabled={!targetValue || isNaN(parseFloat(targetValue))}
                className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-foreground font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 gap-3 group active:scale-95 transition-all"
              >
                <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                Auto-ajustar al objetivo
              </Button>
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
