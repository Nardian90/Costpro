'use client';

import React, { useState } from 'react';
import { MatchingRule } from '@/lib/dexie';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  ChevronDown,
  Save,
  RotateCcw,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { MatchingRuleValidator } from '@/lib/ipv/rule-validator';

interface RuleMetaEditorProps {
  rule: MatchingRule;
  onSave: (id: string, meta: any) => Promise<void>;
}

export function RuleMetaEditor({ rule, onSave }: RuleMetaEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [meta, setMeta] = useState(rule.meta || {});
  const [isSaving, setIsSaving] = useState(false);

  const getRuleParams = (tipo: string) => {
    const configs: Record<string, any> = {
      STOCK_LIMIT: {
        fields: [
          {
            key: 'allow_negative',
            label: 'Permitir Stock Negativo',
            type: 'boolean',
            help: 'Si se desactiva, el algoritmo no usará productos sin existencia.',
            default: true
          }
        ]
      },
      TOLERANCE: {
        fields: [
          {
            key: 'tolerance_cents',
            label: 'Tolerancia (centavos)',
            type: 'number',
            min: 0,
            max: 10000,
            help: 'Diferencia máxima permitida en el cuadre (ej: 100 = .00)',
            default: 100
          }
        ]
      },
      PRICE_FLEX: {
        fields: [
          {
            key: 'max_variation_cents',
            label: 'Variación Máxima ($)',
            type: 'number',
            min: 0,
            max: 1000,
            help: 'Diferencia absoluta en pesos (ej: 10 = $0.10)',
            default: 10
          },
          {
            key: 'max_variation_percent',
            label: 'Variación Máxima (%)',
            type: 'number',
            min: 0,
            max: 50,
            help: 'Porcentaje de variación permitido del precio base',
            default: 20
          }
        ]
      },

      CASH_FILL: {
        fields: [
          {
            key: 'daily_cash_limit',
            label: 'Límite Diario ($)',
            type: 'number',
            min: 0,
            max: 1000000,
            help: 'Presupuesto total de efectivo inyectado por día',
            default: 20000
          },
          {
            key: 'max_per_tx_threshold',
            label: 'Umbral por Transacción ($)',
            type: 'number',
            min: 0,
            max: 50000,
            help: 'Máxima inyección de efectivo permitida por transacción',
            default: 5000
          },
          {
            key: 'mode',
            label: 'Modo Estricto',
            type: 'boolean',
            help: 'Si se activa (STRICT), bloquea la regla al superar el límite diario. Si se desactiva (SOFT), solo genera advertencias.',
            default: false
          }
        ]
      },

      EXACT_SUM: {
        fields: [
          {
            key: 'max_depth',
            label: 'Profundidad Máxima (backtracking)',
            type: 'number',
            min: 5,
            max: 20,
            help: 'Niveles de recursión en búsqueda de combinaciones',
            default: 12
          },
          {
            key: 'timeout_ms',
            label: 'Timeout (milisegundos)',
            type: 'number',
            min: 500,
            max: 10000,
            step: 100,
            help: 'Tiempo máximo para buscar combinación exacta',
            default: 2000
          },
          {
            key: "min_match_percent",
            label: "Porcentaje Mínimo de Coincidencia (%)",
            type: "number",
            min: 10,
            max: 100,
            help: "Acepta combinaciones que cubran al menos este porcentaje de la transferencia.",
            default: 90
          }
        ]
      }
    };
    return configs[tipo] || { fields: [] };
  };

  const config = getRuleParams(rule.tipo);

  const handleChange = (key: string, value: any) => {
    setMeta(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    // Validar regla antes de guardar
    const validation = MatchingRuleValidator.validateRule({ ...rule, meta });

    if (!validation.valid) {
      toast.error(`Errores de validación:\n${validation.errors.join('\n')}`);
      return;
    }

    if (validation.warnings.length > 0) {
      toast.warning(`Atención:\n${validation.warnings.join('\n')}`);
    }

    setIsSaving(true);
    try {
      await onSave(rule.id, meta);
      toast.success(`Parámetros de ${rule.tipo} guardados`);
      setIsOpen(false);
    } catch (error) {
      toast.error('Error al guardar parámetros');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setMeta(rule.meta || {});
  };

  if (config.fields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <button type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-sm font-medium"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        <span className="text-muted-foreground">Parámetros avanzados</span>
        <Badge variant="outline" className="ml-auto text-xs">
          {Object.keys(meta || {}).length} configurados
        </Badge>
      </button>

      {isOpen && (
        <Card className="p-4 space-y-4 bg-muted/30 border-primary/20">
          <div className="space-y-3">
            {config.fields.map((field: any) => (
              <div key={field.key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold uppercase text-foreground">
                    {field.label}
                  </label>
                  <Info className="w-3 h-3 text-muted-foreground opacity-50" />
                </div>
                <p className="text-xs text-muted-foreground">{field.help}</p>
                {field.type === 'boolean' ? (
                  <div className="flex items-center pt-1">
                    <Switch
                      checked={meta[field.key] ?? field.default}
                      onCheckedChange={(checked) => handleChange(field.key, checked)}
                    />
                  </div>
                ) : (
                  <Input
                    type={field.type}
                    min={field.min}
                    max={field.max}
                    step={field.step || 1}
                    value={meta[field.key] ?? field.default}
                    onChange={(e) => handleChange(field.key, Number(e.target.value))}
                    className="text-sm font-mono"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              size="sm"
              className="flex-1 gap-2"
            >
              <Save className="w-3 h-3" />
              Guardar
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              size="sm"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
