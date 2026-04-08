'use client';

import React, { memo, useState, useEffect, useMemo } from 'react';
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
  Target,
  ChevronRight,
  ArrowRight,
  Save
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
import { solveCoefficient } from '@/lib/cost-engine/solver';
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
  const updateAnnexAdjustment = useCostSheetStore, updateIndirectConfig = useCostSheetStore(state => state.updateAnnexAdjustment);
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

  // Coeficiente manual/slider state
  const annex = useMemo(() => data?.annexes?.find(a => a.id === selectedAnnexId), [data, selectedAnnexId]);
  const [manualCoef, setManualCoef] = useState<number>(annex?.coefficient || 1);

  // Sync manualCoef when annex changes
  useEffect(() => {
    if (annex) {
      setManualCoef(annex.coefficient || 1);
    }
  }, [selectedAnnexId, annex?.coefficient]);

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
    setSimulatedMarkup(newValue);
    setIsSimulationMode(true);
    const simulatedPrice = totalCost * (1 + (newValue / 100));
    setLocalPrice(simulatedPrice.toFixed(2));
  };

  const handleCoefChange = (val: number) => {
    setLocalCoef(val);
    updateIndirectConfig({ coefficient: val });
  };

  const handleToggleIndirectSection = (id: string) => {
    const current = data?.indirectConfig?.selectedSections || [];
    const next = current.includes(id) ? current.filter(i => i !== id) : [...current, id];
    updateIndirectConfig({ selectedSections: next });
  };

  const [simulatedMarkup, setSimulatedMarkup] = useState<number | null>(null);
  const [isSimulationMode, setIsSimulationMode] = useState(false);

  const handlePriceAdjust = (newPrice: number) => {
    if (totalCost <= 0) return;
    const requiredMarkup = ((newPrice / totalCost) - 1) * 100;
    const clampedMarkup = Math.max(0, Math.min(500, requiredMarkup));
    setSimulatedMarkup(clampedMarkup);
    setIsSimulationMode(true);
    setSliderValue(clampedMarkup);
  };

  const handleApplySimulation = () => {
    if (simulatedMarkup !== null) {
      updateUtilityFormula(simulatedMarkup);
      setIsSimulationMode(false);
      setSimulatedMarkup(null);
      toast.success("Cambios aplicados permanentemente");
    }
  };

  const handleCancelSimulation = () => {
    setIsSimulationMode(false);
    setSimulatedMarkup(null);
    setSliderValue(currentMarkup);
    setLocalPrice(totalPrice.toFixed(2));
  };

  const handleAutoAdjust = () => {
    const target = parseFloat(targetValue);
    if (isNaN(target) || !selectedAnnexId) return;

    try {
      const bestCoef = solveCoefficient(data, selectedAnnexId, target, { targetRowId });
      updateAnnexAdjustment(selectedAnnexId, bestCoef, adjustmentColumn);
      setManualCoef(bestCoef);
    } catch (err) {
      console.error("Auto adjust error:", err);
    }
  };

  const handleManualCoefAdjust = (val: number) => {
    setManualCoef(val);
    if (selectedAnnexId) {
       updateAnnexAdjustment(selectedAnnexId, val, adjustmentColumn);
    }
  };

  const handleCommitAdjustment = () => {
    if (selectedAnnexId) {
       updateAnnexAdjustment(selectedAnnexId, manualCoef, adjustmentColumn, true);
       setManualCoef(1);
    }
  };

  const getFeedback = (pct: number) => {
    if (pct < 10) return {
      text: "Margen bajo. Verifique si cubre los gastos operativos de forma sostenible.",
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-500/10"
    };
    if (pct < 20) return {
      text: "Margen moderado. Típico para productos de alta rotación.",
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-500/10"
    };
    return {
      text: "Margen saludable. Garantiza rentabilidad y crecimiento.",
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10"
    };
  };

  const feedback = getFeedback(sliderValue);
  const healthPercent = providedHealthPercent !== undefined ? providedHealthPercent : 85;

  const telemetryItems = [
    {
      label: 'Costo Total',
      value: totalCost,
      percent: totalPrice > 0 ? (totalCost / totalPrice) * 100 : 0,
      color: 'text-blue-500',
      icon: Package
    },
    {
      label: 'Utilidad',
      value: utility,
      percent: totalPrice > 0 ? (utility / totalPrice) * 100 : 0,
      color: 'text-emerald-500',
      icon: TrendingUp
    },
    {
      label: 'Precio Final',
      value: totalPrice,
      percent: 100,
      color: 'text-primary',
      icon: DollarSign
    }
  ];

  const suggestedCoef = useMemo(() => {
    const target = parseFloat(targetValue);
    if (isNaN(target) || !selectedAnnexId || !telemetry[targetRowId]) return 1;
    try {
      return solveCoefficient(data, selectedAnnexId, target, { targetRowId });
    } catch (e) {
      console.error("Summary solver error:", e);
      return 1;
    }
  }, [targetValue, selectedAnnexId, targetRowId, telemetry, annex, data]);

      return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Master View Header: Ring & Key Metrics */}
      <div className="bg-card/30 backdrop-blur-3xl border border-white/5 rounded-[3rem] p-6 sm:p-12 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Zap className="w-64 h-64 text-primary" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
          <div className="flex justify-center lg:justify-start">
            <CostSheetMasterRing
              totalPrice={totalPrice}
              utility={utility}
              totalCost={totalCost}
              onPriceChange={handlePriceAdjust}
              onPriceAdjust={(step) => handlePriceAdjust(totalPrice + step)}
            />
          </div>

          <div className="space-y-8">
            <div>
              <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter italic text-foreground leading-[0.9]">
                Resumen de <span className="text-primary">Rentabilidad</span>
              </h2>
              <p className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-muted-foreground mt-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Análisis de Margen y Coeficientes
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="p-6 rounded-[2rem] bg-background/40 border border-white/5 backdrop-blur-md">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary/70 mb-2 block">% de Utilidad</span>
                <span className="text-3xl font-black font-mono">+{totalCost > 0 ? Math.round((utility / totalCost) * 100) : 0}%</span>
              </div>
              <div className="p-6 rounded-[2rem] bg-background/40 border border-white/5 backdrop-blur-md">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary/70 mb-2 block">Salud Ficha</span>
                <span className={cn("text-3xl font-black font-mono", healthPercent > 80 ? "text-emerald-500" : "text-amber-500")}>
                  {Math.round(healthPercent)}%
                </span>
              </div>
            </div>


          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Main Controls */}
        <div className="xl:col-span-7 space-y-8">
          <div className="glass-card-stitch rounded-[2.5rem] p-8 sm:p-10 border border-white/10 shadow-2xl bg-card/40 backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />

            <header className="mb-10 relative">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">Panel de Control Financiero</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter italic text-foreground leading-none">
                Ajuste Dinámico
              </h2>
            </header>

            <div className="space-y-12">
              {/* Price Goal */}
              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <label className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <DollarSign className="w-3 h-3" /> Precio de Venta Objetivo
                  </label>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase mr-1">CUP</span>
                    <Input
                      type="number"
                      value={localPrice}
                      onFocus={() => setIsEditingPrice(true)}
                      onBlur={() => setIsEditingPrice(false)}
                      onChange={(e) => handlePriceAdjust(parseFloat(e.target.value) || 0)}
                      className="w-32 h-10 bg-transparent border-none text-right text-2xl font-black font-mono p-0 focus-visible:ring-0"
                    />
                  </div>
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
              </div>

              {/* Markup Slider */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-widest text-foreground">% de Utilidad</h4>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Impacto directo en rentabilidad</p>
                  </div>
                  <span className="text-2xl font-black italic text-primary drop-shadow-[0_0_15px_rgba(22,163,74,0.3)]">
                    {sliderValue.toFixed(1)}%
                  </span>
                </div>

                <div className="px-2">
                  <Slider
                    value={[sliderValue]}
                    min={1}
                    max={300}
                    step={0.1}
                    onValueChange={handleSliderChange}
                    className="py-4"
                  />
                  <div className="flex justify-between mt-2 px-1">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Conservador (1%)</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Agresivo (300%)</span>
                  </div>
                </div>
                {isSimulationMode && (
                  <div className="flex gap-2 mt-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    <Button
                      variant="outline"
                      onClick={handleCancelSimulation}
                      className="flex-1 rounded-xl h-10 text-[10px] font-black uppercase tracking-widest"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleApplySimulation}
                      className="flex-1 rounded-xl h-10 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20"
                    >
                      Aplicar Cambios
                    </Button>
                  </div>
                )}
              </div>

              {/* Indirect Coef */}
              <div className="p-6 rounded-3xl bg-muted/30 border border-white/5 space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-foreground leading-tight">Coef. Gastos Indirectos</h4>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter italic">Relación Gtos/Sección Base</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => handleCoefChange(Math.max(0, localCoef - 0.05))}
                      className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-90"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-xl font-black font-mono w-16 text-center text-primary">{localCoef.toFixed(4)}</span>
                    <button
                      onClick={() => handleCoefChange(localCoef + 0.05)}
                      className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-90"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between text-[9px] text-muted-foreground uppercase font-black tracking-widest">
                    <span>mín 0.0</span>
                    <span>máx 4.0</span>
                  </div>
                  <Slider
                    value={[localCoef]}
                    min={0}
                    max={4}
                    step={0.0001}
                    onValueChange={(val) => handleCoefChange(val[0])}
                  />
                </div>

                {/* Section Selector */}
                <div className="space-y-3 pt-4 border-t border-white/5">
                  <h5 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <ListFilter className="w-3 h-3" /> Secciones Indirectas Afectadas
                  </h5>
                  <div className="grid grid-cols-2 gap-2">
                    {data?.sections?.map((s, idx) => (
                      <button
                        key={s.id}
                        onClick={() => handleToggleIndirectSection((idx + 1).toString())}
                        className={cn(
                          "px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all border",
                          data?.indirectConfig?.selectedSections?.includes((idx + 1).toString())
                            ? "bg-primary/20 border-primary/40 text-primary"
                            : "bg-background/40 border-border/50 text-muted-foreground hover:bg-background/60"
                        )}
                      >
                        Sección {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h5 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Target className="w-3 h-3" /> Sección Base
                  </h5>
                  <Select
                    value={data?.indirectConfig?.baseSection || '2'}
                    onValueChange={(val) => updateIndirectConfig({ baseSection: val })}
                  >
                    <SelectTrigger className="h-9 bg-background/50 border-border/50 rounded-xl text-[10px] font-bold uppercase">
                      <SelectValue placeholder="Base" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {data?.sections?.map((s, idx) => (
                        <SelectItem key={s.id} value={(idx + 1).toString()} className="text-[10px] font-bold uppercase">
                          Sección {idx + 1}: {s.label?.split(':')?.[1]?.trim() || s.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-foreground leading-tight">Coef. Gastos Indirectos</h4>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter italic">Relación Gtos/Sección Base</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => handleCoefChange(Math.max(0, localCoef - 0.05))}
                      className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-90"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-xl font-black font-mono w-16 text-center text-primary">{localCoef.toFixed(4)}</span>
                    <button
                      onClick={() => handleCoefChange(localCoef + 0.05)}
                      className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-90"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] text-muted-foreground uppercase font-black tracking-widest">
                    <span>mín 0.0</span>
                    <span>máx 4.0</span>
                  </div>
                  <Slider
                    value={[localCoef]}
                    min={0}
                    max={4}
                    step={0.0001}
                    onValueChange={(val) => handleCoefChange(val[0])}
                  />
                </div>
              </div>
            </div>

            <div className={cn(
              "mt-8 p-6 rounded-3xl transition-all duration-500 flex gap-4 border",
              sliderValue > 30 ? "bg-amber-500/5 border-amber-500/20" : "bg-primary/5 border-primary/20"
            )}>
              <feedback.icon className={cn("shrink-0 w-6 h-6 mt-1", feedback.color)} />
              <div>
                <h3 className={cn("text-[10px] font-black uppercase tracking-widest mb-1", feedback.color)}>Análisis de Margen</h3>
                <p className="text-xs text-muted-foreground font-medium leading-relaxed uppercase tracking-tight">
                  {feedback.text}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Auto-adjustment & Health */}
        <div className="xl:col-span-5 space-y-8">
          {/* Auto-Adjustment Card - Redesigned Mobile-First/Desktop-First */}
          <div className="glass-card-stitch rounded-[2.5rem] p-6 sm:p-10 relative overflow-hidden border border-primary/20 shadow-2xl bg-card/40 backdrop-blur-xl">
            <header className="mb-10">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-primary text-primary-foreground shadow-2xl shadow-primary/30">
                    <Wand2 className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-primary/70 font-black">AI Finance Assistant</p>
                    <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tighter italic text-foreground leading-tight">Auto-ajuste</h3>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Live Engine</span>
                </div>
              </div>
            </header>

            <div className="space-y-8">
              {/* Configuration Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black flex items-center gap-2 px-1">
                    <Package className="w-3 h-3" /> Anexo
                  </label>
                  <Select value={selectedAnnexId} onValueChange={setSelectedAnnexId}>
                    <SelectTrigger className="h-12 bg-background/50 border-border/50 rounded-2xl text-xs font-bold uppercase hover:bg-background/80 transition-colors">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-border/50">
                      {data?.annexes?.map(annex => (
                        <SelectItem key={annex.id} value={annex.id} className="text-xs font-bold uppercase py-3">
                          {annex.id} - {annex.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black flex items-center gap-2 px-1">
                    <Settings className="w-3 h-3" /> Columna
                  </label>
                  <Select value={adjustmentColumn} onValueChange={setAdjustmentColumn}>
                    <SelectTrigger className="h-12 bg-background/50 border-border/50 rounded-2xl text-xs font-bold uppercase hover:bg-background/80 transition-colors">
                      <SelectValue placeholder="Columna" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-border/50">
                      <SelectItem value="PRECIO UNITARIO" className="text-xs font-bold uppercase py-3">Precio Unitario</SelectItem>
                      <SelectItem value="VALOR" className="text-xs font-bold uppercase py-3">Valor</SelectItem>
                      <SelectItem value="IMPORTE" className="text-xs font-bold uppercase py-3">Importe</SelectItem>
                      <SelectItem value="NORMA DE CONSUMO" className="text-xs font-bold uppercase py-3">Norma de Consumo</SelectItem>
                      <SelectItem value="AMBOS" className="text-xs font-bold uppercase py-3">Ambos (Norma y Precio)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black flex items-center gap-2 px-1">
                    <ShieldCheck className="w-3 h-3" /> Objetivo
                  </label>
                  <Select value={targetRowId} onValueChange={setTargetRowId}>
                    <SelectTrigger className="h-12 bg-background/50 border-border/50 rounded-2xl text-xs font-bold uppercase hover:bg-background/80 transition-colors">
                      <SelectValue placeholder="Target" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-border/50">
                      <SelectItem value="14.1" className="text-xs font-bold uppercase py-3">14.1 - Precio Final</SelectItem>
                      <SelectItem value="12" className="text-xs font-bold uppercase py-3">12 - Costo Total</SelectItem>
                      <SelectItem value="13.1" className="text-xs font-bold uppercase py-3">13.1 - Utilidad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-black flex items-center gap-2 px-1">
                    <Target className="w-3 h-3" /> Valor
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      placeholder="Ej: 500"
                      className="h-12 pl-4 bg-background/50 border-border/50 rounded-2xl text-sm font-black font-mono focus:bg-background/80 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Analysis & Slider */}
              <div className="space-y-6">
                <div className="p-6 rounded-3xl bg-black/20 border border-white/5 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Actual:</span>
                    <span className="text-sm font-black font-mono">{(telemetry[targetRowId]?.total || 0).toLocaleString('es-CU', { style: 'currency', currency: 'CUP' })}</span>
                  </div>

                  {targetValue && !isNaN(parseFloat(targetValue)) && (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-500">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Desviación:</span>
                        <div className={cn(
                          "flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter",
                          parseFloat(targetValue) - (telemetry[targetRowId]?.total || 0) > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {parseFloat(targetValue) - (telemetry[targetRowId]?.total || 0) > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingUp className="w-3 h-3 rotate-180" />}
                          {(parseFloat(targetValue) - (telemetry[targetRowId]?.total || 0)).toLocaleString('es-CU', { style: 'currency', currency: 'CUP' })}
                        </div>
                      </div>

                      <div className="h-px bg-white/5" />

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary italic">Ajuste Sugerido:</span>
                          <span className="text-lg font-black font-mono text-primary drop-shadow-[0_0_10px_rgba(22,163,74,0.2)]">
                            x{suggestedCoef.toFixed(4)}
                          </span>
                        </div>

                        <Button
                          onClick={handleAutoAdjust}
                          className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-foreground font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 gap-3 group active:scale-95 transition-all"
                        >
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          Simular Sugerencia
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Fine Tuning Slider - Mobile Friendly Grid */}
                <div className="space-y-6 pt-4 border-t border-white/5">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                      <div className="space-y-1">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                           <Settings className="w-3 h-3 text-primary" /> Ajuste de Precisión
                        </h4>
                        <p className="text-[8px] text-muted-foreground uppercase font-black">Control manual de granularidad fina</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 rounded-lg bg-primary/10 text-xs font-black font-mono text-primary border border-primary/20">
                          x{manualCoef.toFixed(4)}
                        </span>
                      </div>
                   </div>

                   <div className="px-1">
                     <Slider
                       value={[manualCoef]}
                       min={0.1}
                       max={5.0}
                       step={0.0001}
                       onValueChange={(val) => handleManualCoefAdjust(val[0])}
                       className="py-4"
                     />
                     <div className="flex justify-between text-[8px] font-black text-muted-foreground/50 uppercase tracking-[0.2em]">
                        <span>- Reducción (0.1x)</span>
                        <span>+ Ampliación (5.0x)</span>
                     </div>
                   </div>
                </div>

                <div className="pt-4">
                  <Button
                    onClick={handleCommitAdjustment}
                    disabled={manualCoef === 1 && !annex?.coefficient}
                    className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-xs shadow-2xl shadow-emerald-500/30 gap-3 active:scale-95 transition-all group border-b-4 border-emerald-700"
                  >
                    <Save className="w-4 h-4 group-hover:scale-125 transition-transform" />
                    Aplicar Cambios Permanentes
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-primary/50" />
              <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest leading-tight">
                "Simular" aplica el coeficiente dinámicamente. "Aplicar Permanentemente" multiplica físicamente los valores de la columna base y reinicia el coeficiente a 1.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8">
            <HealthBattery percent={healthPercent} />
            <CostSheetTelemetry telemetry={telemetryItems} />
          </div>
        </div>
      </div>
    </div>
  );
});

CostSheetSummary.displayName = 'CostSheetSummary';

export default CostSheetSummary;
