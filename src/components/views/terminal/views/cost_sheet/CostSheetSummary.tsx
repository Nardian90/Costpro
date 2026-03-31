'use client';

import React, { memo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Info,
  AlertCircle,
  Package,
  Users,
  Zap,
  Settings,
  RefreshCw,
  Target,
  Wand2,
  Plus,
  Minus
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

  const currentMarkup = totalCost > 0 ? (utility / totalCost) * 100 : 30;
  const [sliderValue, setSliderValue] = useState(currentMarkup);
  const [localPrice, setLocalPrice] = useState(totalPrice.toFixed(2));
  const [isEditingPrice, setIsEditingPrice] = useState(false);

  const [selectedAnnexId, setSelectedAnnexId] = useState<string>(data?.annexes?.[0]?.id || '');
  const [targetValue, setTargetValue] = useState<string>('');
  const [targetRowId, setTargetRowId] = useState<string>('14.1');
  const [adjustmentColumn, setAdjustmentColumn] = useState<string>('PRECIO UNITARIO');

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
      { path: ['sections', 0, 'rows', 3, 'value'], value: val },
      { path: ['sections', 0, 'rows', 5, 'value'], value: val },
      { path: ['sections', 0, 'rows', 6, 'value'], value: val }
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
    const newCoef = (target / currentTargetValue) * currentCoef;
    updateAnnexAdjustment(selectedAnnexId, newCoef, adjustmentColumn);
  };

  const getFeedback = (pct: number) => {
    if (pct < 10) return { text: "Margen bajo. Verifique sostenibilidad.", icon: AlertCircle, color: "text-red-500" };
    if (pct > 30) return { text: "Margen elevado o de riesgo.", icon: AlertCircle, color: "text-amber-500" };
    return { text: "Precio competitivo.", icon: Info, color: "text-blue-500" };
  };

  const feedback = getFeedback(sliderValue);

  const healthPercent = providedHealthPercent !== undefined ? providedHealthPercent : (() => {
    const structuralIntegrity = !Object.values(telemetry).some(r => r.hasWarnings);
    const profitability = totalCost > 0 ? (utility / totalCost) <= 0.3 : true;
    const dest = header?.destino || header?.destination || '';
    const maxCoef = (String(dest).toLowerCase() === 'servicios') ? 1.0 : 1.5;
    const indirectLimitPassed = indirectCoef <= maxCoef;
    const passedCount = [structuralIntegrity, profitability, indirectLimitPassed].filter(Boolean).length;
    return (passedCount / 3) * 100;
  })();

  const telemetryItems = [
    { label: 'Materiales', value: telemetry['1']?.total || 0, percent: totalCost > 0 ? ((telemetry['1']?.total || 0) / totalCost) * 100 : 0, color: 'text-emerald-500', icon: Package },
    { label: 'Mano de Obra', value: telemetry['2']?.total || 0, percent: totalCost > 0 ? ((telemetry['2']?.total || 0) / totalCost) * 100 : 0, color: 'text-blue-500', icon: Users },
    { label: 'Gastos Directos', value: telemetry['3']?.total || 0, percent: totalCost > 0 ? ((telemetry['3']?.total || 0) / totalCost) * 100 : 0, color: 'text-cyan-500', icon: Zap },
    { label: 'Gastos Indirectos', value: indirectSum, percent: totalCost > 0 ? (indirectSum / totalCost) * 100 : 0, color: 'text-amber-500', icon: Settings }
  ];

  return (
    <div className="flex flex-col gap-6 sm:gap-12 max-w-7xl mx-auto px-1 sm:px-4 py-2 sm:py-8">
      <div className="flex flex-col lg:flex-row gap-6 sm:gap-12 items-center lg:items-start">
        <div className="flex-1 w-full space-y-6 sm:space-y-8">
          <div className="flex items-center justify-between mb-2">
            <div className="px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-primary/10 border border-primary/20 shadow-sm">
              <span className="text-[9px] sm:text-xs font-black uppercase tracking-[0.2em] text-primary animate-pulse">Margen Activo</span>
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

        <div className="w-full lg:w-[450px] xl:w-[550px] space-y-6 sm:space-y-8">
          {/* Main Markup Card */}
          <div className="glass-card-stitch rounded-2xl sm:rounded-3xl p-5 sm:p-10 relative overflow-hidden shadow-xl border border-border/50">
            <header className="mb-6 sm:mb-10">
              <p className="text-[9px] sm:text-xs uppercase tracking-[0.2em] text-primary mb-1 font-bold">Margen de Utilidad</p>
              <div className="flex items-baseline gap-1">
                <h1 className="font-display text-[clamp(1.25rem,7vw,3.5rem)] font-bold tracking-tighter text-foreground leading-none">
                  {sliderValue.toFixed(2)}<span className="text-primary text-[clamp(0.875rem,3vw,2rem)] ml-1">%</span>
                </h1>
              </div>
              <p className="text-[8px] sm:text-[10px] uppercase tracking-widest text-muted-foreground mt-1 sm:mt-2">Ajuste dinámico sobre costo</p>
            </header>

            <div className="space-y-6 sm:space-y-10 mb-8 sm:mb-10">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[9px] sm:text-xs uppercase tracking-widest text-muted-foreground font-medium">Margen</label>
                  <span className="text-primary font-display font-bold text-xs sm:text-base">{sliderValue.toFixed(2)}%</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <Button variant="ghost" size="icon" onClick={() => handleSliderChange([Math.max(1, sliderValue - 1)])} className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-primary/10 text-primary">
                    <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </Button>
                  <Slider value={[sliderValue]} min={1} max={100} step={0.1} onValueChange={handleSliderChange} className="w-full" />
                  <Button variant="ghost" size="icon" onClick={() => handleSliderChange([Math.min(100, sliderValue + 1)])} className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-primary/10 text-primary">
                    <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-[9px] sm:text-xs uppercase tracking-widest text-muted-foreground font-medium">Coeficiente Indirecto</label>
                  <span className="text-primary font-display font-bold text-xs sm:text-base">{localCoef.toFixed(4)}</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <Button variant="ghost" size="icon" onClick={() => handleCoefChange(Math.max(0, localCoef - 0.01))} className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-primary/10 text-primary">
                    <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </Button>
                  <Slider value={[localCoef]} min={0} max={2} step={0.001} onValueChange={(val) => handleCoefChange(val[0])} className="w-full" />
                  <Button variant="ghost" size="icon" onClick={() => handleCoefChange(Math.min(2, localCoef + 0.01))} className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-primary/10 text-primary">
                    <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <div className={cn("p-3 sm:p-4 rounded-xl mb-4 sm:mb-6 flex gap-2 sm:gap-3 items-start", sliderValue > 30 ? "bg-amber-500/5 border border-amber-500/20" : "bg-primary/5 border border-primary/20")}>
              <feedback.icon className={cn("shrink-0 w-4 h-4 sm:w-5 sm:h-5 mt-0.5", feedback.color)} />
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">{feedback.text}</p>
            </div>
          </div>

          {/* Auto-Adjustment Section */}
          <div className="glass-card-stitch rounded-2xl sm:rounded-3xl p-5 sm:p-8 relative overflow-hidden border border-primary/20 shadow-xl bg-primary/5">
            <header className="mb-6 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-primary mb-0.5 font-black truncate">Ajuste por Coeficiente</p>
                <h3 className="text-sm sm:text-lg font-black uppercase tracking-tighter italic text-foreground flex items-center gap-2">
                   <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary shrink-0" /> <span className="truncate">Auto-ajuste</span>
                </h3>
              </div>
              <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary opacity-50 shrink-0" />
            </header>

            <div className="space-y-4 sm:space-y-5">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[8px] sm:text-[9px] uppercase tracking-widest text-muted-foreground font-black ml-1">Seleccionar Anexo</label>
                  <Select value={selectedAnnexId} onValueChange={setSelectedAnnexId}>
                    <SelectTrigger className="h-9 sm:h-10 bg-background/50 border-border rounded-xl text-[10px] sm:text-xs font-bold uppercase overflow-hidden">
                      <SelectValue placeholder="Anexo" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[calc(100vw-40px)] sm:max-w-md">
                      {data?.annexes?.map(annex => (
                        <SelectItem key={annex.id} value={annex.id} className="text-[10px] sm:text-xs font-bold uppercase py-2">
                          Anexo {annex.id}: {annex.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[8px] sm:text-[9px] uppercase tracking-widest text-muted-foreground font-black ml-1">Columna de ajuste</label>
                  <Select value={adjustmentColumn} onValueChange={setAdjustmentColumn}>
                    <SelectTrigger className="h-9 sm:h-10 bg-background/50 border-border rounded-xl text-[10px] sm:text-xs font-bold uppercase">
                      <SelectValue placeholder="Columna" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRECIO UNITARIO" className="text-[10px] sm:text-xs font-bold uppercase">Precio Unitario</SelectItem>
                      <SelectItem value="VALOR" className="text-[10px] sm:text-xs font-bold uppercase">Valor</SelectItem>
                      <SelectItem value="IMPORTE" className="text-[10px] sm:text-xs font-bold uppercase">Importe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="space-y-1.5">
                  <label className="text-[8px] sm:text-[9px] uppercase tracking-widest text-muted-foreground font-black ml-1">Variable Objetivo</label>
                  <Select value={targetRowId} onValueChange={setTargetRowId}>
                    <SelectTrigger className="h-9 sm:h-10 bg-background/50 border-border rounded-xl text-[10px] sm:text-xs font-bold uppercase">
                      <SelectValue placeholder="Target" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="14.1" className="text-[10px] sm:text-xs font-bold uppercase">14.1 - Precio Final</SelectItem>
                      <SelectItem value="12" className="text-[10px] sm:text-xs font-bold uppercase">12 - Costo Total</SelectItem>
                      <SelectItem value="13.1" className="text-[10px] sm:text-xs font-bold uppercase">13.1 - Utilidad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[8px] sm:text-[9px] uppercase tracking-widest text-muted-foreground font-black ml-1">Valor Objetivo</label>
                  <div className="relative">
                    <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      placeholder="Ej: 500.00"
                      className="h-9 sm:h-10 pl-9 bg-background/50 border-border rounded-xl text-[10px] sm:text-xs font-bold font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 sm:p-4 rounded-xl bg-black/20 border border-white/5 space-y-2 sm:space-y-3 shadow-inner">
                 <div className="flex justify-between items-center text-[9px] sm:text-[10px] font-black uppercase tracking-widest">
                    <span className="text-muted-foreground">Actual:</span>
                    <span className="text-foreground">{(telemetry[targetRowId]?.total || 0).toLocaleString('es-CU', { style: 'currency', currency: 'CUP' })}</span>
                 </div>
                 {targetValue && !isNaN(parseFloat(targetValue)) && (
                   <>
                    <div className="flex justify-between items-center text-[9px] sm:text-[10px] font-black uppercase tracking-widest">
                        <span className="text-muted-foreground">Diferencia:</span>
                        <span className={cn(
                          parseFloat(targetValue) - (telemetry[targetRowId]?.total || 0) > 0 ? "text-emerald-500" : "text-red-500"
                        )}>
                          {(parseFloat(targetValue) - (telemetry[targetRowId]?.total || 0)).toLocaleString('es-CU', { style: 'currency', currency: 'CUP' })}
                          {" ("}{(((parseFloat(targetValue) / (telemetry[targetRowId]?.total || 1)) - 1) * 100).toFixed(1)}%{")"}
                        </span>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="flex justify-between items-center text-[9px] sm:text-[10px] font-black uppercase tracking-widest">
                        <span className="text-primary italic">Coeficiente:</span>
                        <span className="text-primary font-mono text-[10px] sm:text-xs font-black">
                          {((parseFloat(targetValue) / (telemetry[targetRowId]?.total || 1)) * (data.annexes.find(a => a.id === selectedAnnexId)?.coefficient || 1)).toFixed(4)}
                        </span>
                    </div>
                   </>
                 )}
              </div>

              <Button
                onClick={handleAutoAdjust}
                disabled={!targetValue || isNaN(parseFloat(targetValue)) || !selectedAnnexId}
                className="w-full h-11 sm:h-12 rounded-xl bg-primary hover:bg-primary/90 text-foreground font-black uppercase tracking-widest text-[10px] sm:text-xs shadow-lg shadow-primary/20 gap-3 active:scale-[0.98] transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Aplicar Auto-ajuste
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 items-start">
        <HealthBattery percent={healthPercent} />
        <CostSheetTelemetry telemetry={telemetryItems} />
      </div>
    </div>
  );
});

CostSheetSummary.displayName = 'CostSheetSummary';

export default CostSheetSummary;
