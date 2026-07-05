'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Zap, RefreshCw, Brain, Activity, TrendingUp, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface SimulationModelConfig {
  enabled: boolean;
  weight: number; // 0-100
}

export interface SimulationConfig {
  mode: 'auto' | 'manual';
  models: {
    frequency: SimulationModelConfig;
    markov: SimulationModelConfig;
    positional: SimulationModelConfig;
    sumrange: SimulationModelConfig;
  };
  windowDays: number; // 30, 60, 90, 180
  topPicks: number; // 1-10
  minConfidence: number; // 0-100
}

interface SimulationConfigPanelProps {
  config: SimulationConfig;
  onChange: (config: SimulationConfig) => void;
  onReRun: () => void;
  isRunning: boolean;
}

const DEFAULT_CONFIG: SimulationConfig = {
  mode: 'auto',
  models: {
    frequency: { enabled: true, weight: 25 },
    markov: { enabled: true, weight: 25 },
    positional: { enabled: true, weight: 25 },
    sumrange: { enabled: true, weight: 25 },
  },
  windowDays: 60,
  topPicks: 3,
  minConfidence: 20,
};

const MODEL_INFO = {
  frequency: {
    name: 'Frequency',
    icon: TrendingUp,
    description: 'Hot/cold numbers con chi-cuadrado de significancia',
    color: 'text-emerald-500',
  },
  markov: {
    name: 'Markov',
    icon: Activity,
    description: 'Cadena de Markov orden 1 por posición',
    color: 'text-blue-500',
  },
  positional: {
    name: 'Positional',
    icon: Layers,
    description: 'Análisis posicional independiente (centena/decena/unidad)',
    color: 'text-purple-500',
  },
  sumrange: {
    name: 'Sum Range',
    icon: Brain,
    description: 'Distribución de sumas y patrones odd-even/high-low',
    color: 'text-amber-500',
  },
};

export function SimulationConfigPanel({ config, onChange, onReRun, isRunning }: SimulationConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<SimulationConfig>(config);

  const updateModel = (model: keyof SimulationConfig['models'], updates: Partial<SimulationModelConfig>) => {
    const newConfig = {
      ...localConfig,
      models: {
        ...localConfig.models,
        [model]: { ...localConfig.models[model], ...updates },
      },
    };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  const setMode = (mode: 'auto' | 'manual') => {
    const newConfig = { ...localConfig, mode };
    if (mode === 'auto') {
      // Reset weights to equal
      newConfig.models = {
        frequency: { enabled: true, weight: 25 },
        markov: { enabled: true, weight: 25 },
        positional: { enabled: true, weight: 25 },
        sumrange: { enabled: true, weight: 25 },
      };
    }
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  // Normalizar pesos para que sumen 100
  const normalizeWeights = () => {
    const enabledModels = Object.entries(localConfig.models).filter(([_, m]) => m.enabled);
    if (enabledModels.length === 0) return;
    const equalWeight = Math.floor(100 / enabledModels.length);
    const remainder = 100 - equalWeight * enabledModels.length;
    const newModels = { ...localConfig.models };
    enabledModels.forEach(([key, _], i) => {
      newModels[key as keyof typeof newModels].weight = equalWeight + (i === 0 ? remainder : 0);
    });
    const newConfig = { ...localConfig, models: newModels };
    setLocalConfig(newConfig);
    onChange(newConfig);
    toast.success('Pesos normalizados');
  };

  const enabledCount = Object.values(localConfig.models).filter(m => m.enabled).length;

  return (
    <Card className="rounded-[28px] border-border/50 overflow-hidden">
      <CardHeader className="border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Configuración de Simulación
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 bg-background/50 p-1 rounded-full border border-border/30">
              <button
                onClick={() => setMode('auto')}
                className={cn(
                  "px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all",
                  localConfig.mode === 'auto'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Zap className="w-3 h-3 inline mr-1" /> Auto
              </button>
              <button
                onClick={() => setMode('manual')}
                className={cn(
                  "px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all",
                  localConfig.mode === 'manual'
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Settings className="w-3 h-3 inline mr-1" /> Manual
              </button>
            </div>
          </div>
        </div>
        <CardDescription className="text-[10px] font-bold uppercase opacity-60">
          {localConfig.mode === 'auto'
            ? 'Modo automático: pesos dinámicos basados en backtest'
            : 'Modo manual: ajusta modelos y pesos para optimizar predicciones'}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {localConfig.mode === 'manual' ? (
          <>
            {/* Modelos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase opacity-60">Modelos Activos ({enabledCount}/4)</p>
                <button
                  onClick={normalizeWeights}
                  className="text-[9px] font-black uppercase text-primary hover:underline"
                >
                  Normalizar pesos
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(Object.entries(localConfig.models) as Array<[keyof SimulationConfig['models'], SimulationModelConfig]>).map(([key, model]) => {
                  const info = MODEL_INFO[key];
                  const Icon = info.icon;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "p-3 rounded-xl border transition-all",
                        model.enabled
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/30 bg-muted/10 opacity-60"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className={cn("w-4 h-4", info.color)} />
                          <span className="text-[11px] font-black uppercase">{info.name}</span>
                        </div>
                        <button
                          onClick={() => updateModel(key, { enabled: !model.enabled })}
                          className={cn(
                            "w-9 h-5 rounded-full transition-colors relative",
                            model.enabled ? "bg-primary" : "bg-muted"
                          )}
                        >
                          <div className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                            model.enabled ? "translate-x-4" : "translate-x-0.5"
                          )} />
                        </button>
                      </div>
                      <p className="text-[9px] opacity-60 leading-relaxed mb-2">{info.description}</p>
                      {model.enabled && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase opacity-50">Peso</span>
                            <span className="text-[10px] font-black text-primary">{model.weight}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={model.weight}
                            onChange={(e) => updateModel(key, { weight: parseInt(e.target.value) })}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Parámetros adicionales */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase opacity-60">Ventana (días)</label>
                <select
                  className="w-full h-9 rounded-lg border-border bg-background px-2 text-[11px] font-bold"
                  value={localConfig.windowDays}
                  onChange={(e) => {
                    const newConfig = { ...localConfig, windowDays: parseInt(e.target.value) };
                    setLocalConfig(newConfig);
                    onChange(newConfig);
                  }}
                >
                  <option value={30}>30 días</option>
                  <option value={60}>60 días</option>
                  <option value={90}>90 días</option>
                  <option value={180}>180 días</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase opacity-60">Top Picks</label>
                <select
                  className="w-full h-9 rounded-lg border-border bg-background px-2 text-[11px] font-bold"
                  value={localConfig.topPicks}
                  onChange={(e) => {
                    const newConfig = { ...localConfig, topPicks: parseInt(e.target.value) };
                    setLocalConfig(newConfig);
                    onChange(newConfig);
                  }}
                >
                  <option value={1}>1 pick</option>
                  <option value={3}>3 picks</option>
                  <option value={5}>5 picks</option>
                  <option value={10}>10 picks</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase opacity-60">Confianza mínima: {localConfig.minConfidence}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localConfig.minConfidence}
                  onChange={(e) => {
                    const newConfig = { ...localConfig, minConfidence: parseInt(e.target.value) };
                    setLocalConfig(newConfig);
                    onChange(newConfig);
                  }}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted mt-3"
                />
              </div>
            </div>

            {/* Botón Re-ejecutar */}
            <Button
              onClick={onReRun}
              disabled={isRunning || enabledCount === 0}
              className="w-full h-10 rounded-full font-black uppercase text-xs"
            >
              {isRunning ? (
                <><RefreshCw className="w-3 h-3 mr-2 animate-spin" /> Re-ejecutando...</>
              ) : (
                <><Zap className="w-3 h-3 mr-2" /> Re-ejecutar Simulación</>
              )}
            </Button>
            {enabledCount === 0 && (
              <p className="text-[9px] text-destructive text-center font-bold uppercase">
                ⚠ Debe habilitar al menos 1 modelo
              </p>
            )}
          </>
        ) : (
          <div className="text-center py-6 space-y-2">
            <Zap className="w-8 h-8 mx-auto text-primary opacity-50" />
            <p className="text-[11px] font-black uppercase opacity-60">
              Modo Automático Activo
            </p>
            <p className="text-[10px] opacity-50 max-w-md mx-auto leading-relaxed">
              El sistema calcula automáticamente los pesos óptimos de cada modelo basándose
              en su desempeño histórico (backtest). Los 4 modelos están activos con pesos dinámicos.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 pt-2">
              <Badge variant="outline" className="text-[9px] uppercase">Frequency</Badge>
              <Badge variant="outline" className="text-[9px] uppercase">Markov</Badge>
              <Badge variant="outline" className="text-[9px] uppercase">Positional</Badge>
              <Badge variant="outline" className="text-[9px] uppercase">Sum Range</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { DEFAULT_CONFIG };
