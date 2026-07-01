'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Calculator,
  Info,
  Maximize2,
  Settings2,
  AlertCircle,
  TrendingDown,
  DollarSign,
  HelpCircle,
  Building2,
  Zap,
  CheckCircle2,
  X,
  Plus,
  Scale
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

import { useTranslations } from 'next-intl';
type StructureType = 'simple' | 'industrial' | 'crane' | 'mezzanine' | 'heavy';
type PrecisionMode = 'fast' | 'standard' | 'conservative';

interface CalculationInputs {
  largo: number;
  ancho: number;
  altura: number;
  tipoEstructura: StructureType;
  precioTonelada: number;
  contingencia: number;
  modoPrecision: PrecisionMode;
  extras: {
    cerramientos: boolean;
    aislamiento: boolean;
    puertas: boolean;
    lucernarios: boolean;
  };
}

export const SteelStructureCalculator: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [inputs, setInputs] = useState<CalculationInputs>({
    largo: 30,
    ancho: 20,
    altura: 6,
    tipoEstructura: 'industrial',
    precioTonelada: 2500,
    contingencia: 5,
    modoPrecision: 'standard',
    extras: {
      cerramientos: false,
      aislamiento: false,
      puertas: false,
      lucernarios: false
    }
  });

  const [showHelp, setShowHelp] = useState(false);

  const results = useMemo(() => {
    const { largo, ancho, altura, tipoEstructura, precioTonelada, contingencia, modoPrecision, extras } = inputs;

    // 2. Variables Derivadas
    const area = largo * ancho;
    const relacionLuz = ancho / (altura || 1);

    // 3.1 Factor por altura
    let baseAltura = 50;
    if (altura <= 6) baseAltura = 28;
    else if (altura <= 9) baseAltura = 35;
    else if (altura <= 12) baseAltura = 42;

    // 3.2 Ajuste por luz estructural
    let ajusteAncho = 12;
    if (ancho <= 10) ajusteAncho = 0;
    else if (ancho <= 20) ajusteAncho = 4;
    else if (ancho <= 30) ajusteAncho = 8;

    // 3.3 Ajuste por esbeltez
    let ajusteEsbeltez = 0;
    if (relacionLuz < 1.5) ajusteEsbeltez = -2;
    else if (relacionLuz > 2.5) ajusteEsbeltez = 3;

    // 3.4 Tipo de estructura
    const factoresTipo: Record<StructureType, number> = {
      simple: 1.00,
      industrial: 1.08,
      crane: 1.15,
      mezzanine: 1.18,
      heavy: 1.25
    };
    const factorTipo = factoresTipo[tipoEstructura];

    // 3.5 Extras
    let extrasKg = 0;
    if (extras.cerramientos) extrasKg += 2;
    if (extras.aislamiento) extrasKg += 1.5;
    if (extras.puertas) extrasKg += 1;
    if (extras.lucernarios) extrasKg += 0.5;

    // 4. Cálculo del kg/m2 final
    let kgm2 = (baseAltura + ajusteAncho + ajusteEsbeltez + extrasKg) * factorTipo;

    // 5. Control de Rango (Sanity Check)
    const rawKgm2 = kgm2;
    if (kgm2 < 25) kgm2 = 25;
    if (kgm2 > 65) kgm2 = 65;

    // 6. Tonelaje
    let toneladas = (area * kgm2) / 1000;

    // 7. Modo de Precisión
    const factoresPrecision: Record<PrecisionMode, number> = {
      fast: 0.92,
      standard: 1.00,
      conservative: 1.12
    };
    toneladas *= factoresPrecision[modoPrecision];

    // 8. Costeo
    const costoBase = toneladas * precioTonelada;
    const costoTotal = costoBase * (1 + (contingencia || 0) / 100);

    // 9. Nivel de carga
    let nivelCarga = 'medio';
    if (kgm2 < 35) nivelCarga = 'liviano';
    else if (kgm2 > 50) nivelCarga = 'pesado';

    // 10. Simulación de rango
    const escenarioBajo = toneladas * 0.9;
    const escenarioAlto = toneladas * 1.1;
    const costoBajo = costoTotal * 0.9;
    const costoAlto = costoTotal * 1.1;

    return {
      area,
      relacionLuz,
      kgm2,
      rawKgm2,
      toneladas,
      costoBase,
      costoTotal,
      nivelCarga,
      rangoTon: [escenarioBajo, escenarioAlto],
      rangoCosto: [costoBajo, costoAlto]
    };
  }, [inputs]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

  const formatNumber = (val: number, decimals = 2) =>
    val.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header Interactivo */}
      <div className="px-8 py-6 border-b border-border/50 bg-muted/20 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter italic flex items-center gap-3">
            <Calculator className="w-8 h-8 text-primary" />
            Calculadora de Estructura Metálica (PEMB)
          </h2>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">
            Estimación Paramétrica de Acero Basada en Lógica Determinística v1.0
          </p>
        </div>
        <Button
          variant={showHelp ? "default" : "outline"}
          size="sm"
          onClick={() => setShowHelp(!showHelp)}
          className="rounded-xl font-black uppercase text-xs tracking-widest h-9"
        >
          {showHelp ? <X className="w-4 h-4 mr-2" /> : <HelpCircle className="w-4 h-4 mr-2" />}
          {showHelp ? "Cerrar Ayuda" : "¿Cómo se calcula?"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Panel de Inputs */}
          <div className="lg:col-span-4 space-y-6">
            <section className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                <Maximize2 className="w-3.5 h-3.5" /> Geometría Base
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Largo (m)</Label>
                  <Input
                    type="number"
                    value={inputs.largo}
                    onChange={(e) => setInputs({...inputs, largo: Number(e.target.value)})}
                    className="h-10 font-mono font-bold rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Ancho (m)</Label>
                  <Input
                    type="number"
                    value={inputs.ancho}
                    onChange={(e) => setInputs({...inputs, ancho: Number(e.target.value)})}
                    className="h-10 font-mono font-bold rounded-xl"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Altura a Hombro (m)</Label>
                  <Input
                    type="number"
                    value={inputs.altura}
                    onChange={(e) => setInputs({...inputs, altura: Number(e.target.value)})}
                    className="h-10 font-mono font-bold rounded-xl"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5" /> Configuración
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Tipo de Estructura</Label>
                  <Select
                    value={inputs.tipoEstructura}
                    onValueChange={(v: StructureType) => setInputs({...inputs, tipoEstructura: v})}
                  >
                    <SelectTrigger className="h-10 font-bold rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Simple (Sin grúa/mezzanine)</SelectItem>
                      <SelectItem value="industrial">Industrial Estándar</SelectItem>
                      <SelectItem value="crane">Con Grúa Ligera</SelectItem>
                      <SelectItem value="mezzanine">Con Mezzanine</SelectItem>
                      <SelectItem value="heavy">Alta Carga / Uso Intensivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Modo de Precisión</Label>
                  <Select
                    value={inputs.modoPrecision}
                    onValueChange={(v: PrecisionMode) => setInputs({...inputs, modoPrecision: v})}
                  >
                    <SelectTrigger className="h-10 font-bold rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fast">Rápido (Optimista Comercial -8%)</SelectItem>
                      <SelectItem value="standard">Estándar (Base 100%)</SelectItem>
                      <SelectItem value="conservative">Conservador (Protección Financiera +12%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                <Plus className="w-3.5 h-3.5" /> Adicionales (Extras kg/m²)
              </h3>
              <div className="grid grid-cols-1 gap-3 bg-muted/30 p-4 rounded-2xl border border-border/50">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Cerramientos Metálicos (+2)</Label>
                  <Switch
                    checked={inputs.extras.cerramientos}
                    onCheckedChange={(v) => setInputs({...inputs, extras: {...inputs.extras, cerramientos: v}})}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Aislamiento Térmico (+1.5)</Label>
                  <Switch
                    checked={inputs.extras.aislamiento}
                    onCheckedChange={(v) => setInputs({...inputs, extras: {...inputs.extras, aislamiento: v}})}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Puertas Industriales (+1)</Label>
                  <Switch
                    checked={inputs.extras.puertas}
                    onCheckedChange={(v) => setInputs({...inputs, extras: {...inputs.extras, puertas: v}})}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Lucernarios (+0.5)</Label>
                  <Switch
                    checked={inputs.extras.lucernarios}
                    onCheckedChange={(v) => setInputs({...inputs, extras: {...inputs.extras, lucernarios: v}})}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5" /> Costeo
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Precio / Ton</Label>
                  <Input
                    type="number"
                    value={inputs.precioTonelada}
                    onChange={(e) => setInputs({...inputs, precioTonelada: Number(e.target.value)})}
                    className="h-10 font-mono font-bold rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Contingencia (%)</Label>
                  <Input
                    type="number"
                    value={inputs.contingencia}
                    onChange={(e) => setInputs({...inputs, contingencia: Number(e.target.value)})}
                    className="h-10 font-mono font-bold rounded-xl"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Panel de Resultados */}
          <div className="lg:col-span-8 space-y-8">
            <AnimatePresence mode="wait">
              {showHelp ? (
                <motion.div
                  key="help"
                  initial={{ opacity: 0, y: 20 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? {} : { opacity: 0, y: -20 }}
                  className="bg-primary/5 rounded-3xl border border-primary/20 p-8 space-y-6"
                >
                  <div className="flex items-center gap-4 border-b border-primary/10 pb-4">
                    <div className="p-3 bg-primary/20 rounded-2xl">
                      <HelpCircle className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-lg font-black uppercase tracking-tighter italic">Metodología de Cálculo</h4>
                      <p className="text-xs font-bold text-primary/70 uppercase tracking-widest">Transparencia Total en Estimación</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                    <div className="space-y-4">
                      <h5 className="font-black uppercase text-xs tracking-widest flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary" /> Motor Kg/m²
                      </h5>
                      <ul className="space-y-2 text-muted-foreground font-medium">
                        <li>• <strong className="text-foreground">Base Altura:</strong> Aumenta con la altura (28 a 50 kg/m²) para soportar cargas de viento y peso propio.</li>
                        <li>• <strong className="text-foreground">Luz (Ancho):</strong> Penaliza claros mayores a 10m (+4 a +12 kg/m²) por exigencia en vigas/marcos.</li>
                        <li>• <strong className="text-foreground">Esbeltez:</strong> Relación Ancho/Altura. Optimiza (-2) o penaliza (+3).</li>
                        <li>• <strong className="text-foreground">Factor Tipo:</strong> Coeficiente multiplicador según uso (ej. Grúa = 1.15).</li>
                      </ul>
                    </div>
                    <div className="space-y-4">
                      <h5 className="font-black uppercase text-xs tracking-widest flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary" /> Salvaguardas
                      </h5>
                      <ul className="space-y-2 text-muted-foreground font-medium">
                        <li>• <strong className="text-foreground">Sanity Check:</strong> El sistema limita el resultado entre 25 y 65 kg/m² para evitar desviaciones irreales.</li>
                        <li>• <strong className="text-foreground">Modos:</strong> Permite ajustar la sensibilidad comercial (Optimista) o financiera (Conservador).</li>
                        <li>• <strong className="text-foreground">Rango Automático:</strong> Siempre entrega un +/- 10% para cubrir incertidumbre.</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-background/50 rounded-2xl p-6 border border-primary/10">
                    <code className="text-xs font-mono block whitespace-pre text-primary/80">
                      Kg_m2 = (Base_Altura + Ajuste_Ancho + Ajuste_Esbeltez + Extras) × Factor_Tipo_Estructura
                    </code>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                  exit={prefersReducedMotion ? {} : { opacity: 0, scale: 0.98 }}
                  className="space-y-8"
                >
                  {/* KPIs Principales */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ResultCard
                      label="Tonelaje Estimado"
                      value={formatNumber(results.toneladas, 2)}
                      unit="TON"
                      icon={Scale}
                      description="Peso teórico total de la estructura"
                      variant="primary"
                    />
                    <ResultCard
                      label="Índice de Acero"
                      value={formatNumber(results.kgm2, 1)}
                      unit="KG/M²"
                      icon={Zap}
                      description={`Nivel de carga: ${results.nivelCarga.toUpperCase()}`}
                      variant={results.nivelCarga === 'pesado' ? 'danger' : 'success'}
                    />
                    <ResultCard
                      label="Costo Total Estimado"
                      value={formatCurrency(results.costoTotal)}
                      unit=""
                      icon={DollarSign}
                      description={`Incluye ${inputs.contingencia}% contingencia`}
                      variant="info"
                    />
                  </div>

                  {/* Detalles y Rangos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="rounded-3xl border-border/40 shadow-xl shadow-black/5 overflow-hidden">
                      <div className="px-6 py-4 border-b border-border/40 bg-muted/20 flex justify-between items-center">
                        <h4 className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                          <TrendingDown className="w-3.5 h-3.5" /> Simulación de Escenarios
                        </h4>
                      </div>
                      <CardContent className="p-6 space-y-6">
                        <div className="space-y-4">
                          <div className="flex justify-between items-end">
                            <span className="text-xs font-bold text-muted-foreground uppercase">Escenario Base</span>
                            <span className="text-xl font-black">{formatNumber(results.toneladas)} Ton</span>
                          </div>
                          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                            <div className="absolute top-0 bottom-0 left-[10%] right-[10%] bg-primary/20" />
                            <div className="absolute top-0 bottom-0 left-[50%] w-1 bg-primary -translate-x-1/2 z-10" />
                          </div>
                          <div className="flex justify-between text-xs font-black text-muted-foreground uppercase tracking-widest">
                            <div className="text-left">
                              <p className="text-success">Mínimo (-10%)</p>
                              <p className="text-foreground">{formatNumber(results.rangoTon[0])} Ton</p>
                            </div>
                            <div className="text-right">
                              <p className="text-destructive">Máximo (+10%)</p>
                              <p className="text-foreground">{formatNumber(results.rangoTon[1])} Ton</p>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-border/40 space-y-4">
                           <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-muted-foreground uppercase">Rango de Inversión</span>
                              <span className="text-sm font-black text-primary">
                                {formatCurrency(results.rangoCosto[0])} - {formatCurrency(results.rangoCosto[1])}
                              </span>
                           </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-3xl border-border/40 shadow-xl shadow-black/5 overflow-hidden">
                      <div className="px-6 py-4 border-b border-border/40 bg-muted/20">
                        <h4 className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                          <Info className="w-3.5 h-3.5" /> Desglose del Motor
                        </h4>
                      </div>
                      <CardContent className="p-6">
                        <div className="space-y-4">
                          <BreakdownRow label="Área de Desplante" value={`${formatNumber(results.area, 0)} m²`} />
                          <BreakdownRow label="Relación de Luz" value={formatNumber(results.relacionLuz, 2)} />
                          <BreakdownRow
                            label="Kg/m² Calculado (Raw)"
                            value={`${formatNumber(results.rawKgm2, 1)} kg`}
                            warning={results.rawKgm2 !== results.kgm2}
                          />
                          <BreakdownRow label="Costo Base Estructura" value={formatCurrency(results.costoBase)} />

                          {results.rawKgm2 !== results.kgm2 && (
                            <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-xl flex gap-3">
                              <AlertCircle className="w-4 h-4 text-warning shrink-0" />
                              <p className="text-xs text-amber-700 font-bold leading-relaxed">
                                EL SISTEMA HA APLICADO UN LÍMITE DE SEGURIDAD (SANITY CHECK) YA QUE EL VALOR TEÓRICO ({formatNumber(results.rawKgm2, 1)}) ESTABA FUERA DEL RANGO DE DISEÑO ESTÁNDAR (25-65 KG).
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ResultCardProps {
  label: string;
  value: string;
  unit: string;
  icon: React.ElementType;
  description: string;
  variant: 'primary' | 'success' | 'danger' | 'info';
}

const ResultCard: React.FC<ResultCardProps> = ({ label, value, unit, icon: Icon, description, variant }) => {
  const styles = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    success: "border-success/20 bg-success/5 text-success",
    danger: "border-destructive/20 bg-destructive/5 text-destructive",
    info: "border-primary/20 bg-primary/5 text-primary",
  };

  return (
    <Card className={cn("rounded-3xl border shadow-lg shadow-black/5 overflow-hidden", styles[variant])}>
      <CardContent className="p-6 flex flex-col items-center text-center space-y-2">
        <div className={cn("p-2 rounded-xl mb-1",
          variant === 'primary' ? "bg-primary/10" :
          variant === 'success' ? "bg-success/10" :
          variant === 'danger' ? "bg-destructive/10" : "bg-primary/10"
        )}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-xs font-black uppercase tracking-[0.2em] opacity-70">{label}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black tracking-tighter italic">{value}</span>
          {unit && <span className="text-xs font-bold uppercase">{unit}</span>}
        </div>
        <p className="text-xs font-bold uppercase tracking-widest opacity-60 mt-2">{description}</p>
      </CardContent>
    </Card>
  );
};

const BreakdownRow: React.FC<{ label: string; value: string; warning?: boolean }> = ({ label, value, warning }) => (
  <div className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
    <span className="text-xs font-bold text-muted-foreground uppercase">{label}</span>
    <span className={cn("text-xs font-black", warning ? "text-warning" : "text-foreground")}>{value}</span>
  </div>
);

export default SteelStructureCalculator;
