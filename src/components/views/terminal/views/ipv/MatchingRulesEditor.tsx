'use client';

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MatchingRule } from '@/lib/dexie';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Plus,
  GripVertical,
  Trash2,
  Info,
  ShieldCheck,
  Zap,
  Percent,
  Coins
} from 'lucide-react';
import { toast } from 'sonner';

export function MatchingRulesEditor() {
  const rules = useLiveQuery(() => db.matching_rules.orderBy('prioridad').toArray());

  const initializeDefaultRules = async () => {
    const defaults: MatchingRule[] = [
      { id: '1', tipo: 'HARD_REF', prioridad: 1, activo: true },
      { id: '2', tipo: 'EXACT_SUM', prioridad: 2, activo: true },
      { id: '3', tipo: 'TOLERANCE', prioridad: 3, activo: true, tolerancia_cents: 100 }, // $1.00
      { id: '4', tipo: 'CASH_FILL', prioridad: 4, activo: false }
    ];
    await db.matching_rules.bulkPut(defaults);
    toast.success('Reglas inicializadas');
  };

  const toggleRule = async (id: string, active: boolean) => {
    await db.matching_rules.update(id, { activo: active });
  };

  const updateTolerance = async (id: string, value: string) => {
    const cents = Math.round(parseFloat(value) * 100);
    if (!isNaN(cents)) {
        await db.matching_rules.update(id, { tolerancia_cents: cents });
    }
  };

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case 'HARD_REF': return <ShieldCheck className="text-blue-500" />;
      case 'EXACT_SUM': return <Zap className="text-yellow-500" />;
      case 'TOLERANCE': return <Percent className="text-green-500" />;
      case 'CASH_FILL': return <Coins className="text-orange-500" />;
      default: return <Info />;
    }
  };

  const getLabel = (tipo: string) => {
    switch (tipo) {
      case 'HARD_REF': return 'Referencia Directa';
      case 'EXACT_SUM': return 'Suma Exacta (Greedy)';
      case 'TOLERANCE': return 'Margen de Tolerancia';
      case 'CASH_FILL': return 'Ajuste Automático Efectivo';
      default: return tipo;
    }
  };

  const getDescription = (tipo: string) => {
    switch (tipo) {
      case 'HARD_REF': return 'Busca códigos de producto o descripciones en las observaciones de la transacción.';
      case 'EXACT_SUM': return 'Busca combinaciones de productos que sumen exactamente el importe recibido.';
      case 'TOLERANCE': return 'Permite un descuadre controlado si la suma se acerca al importe.';
      case 'CASH_FILL': return 'Cubre cualquier faltante restante marcándolo como venta en efectivo.';
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight">Motor de Decisiones</h3>
          <p className="text-sm text-muted-foreground">Define el orden y comportamiento del algoritmo de matching.</p>
        </div>
        {!rules || rules.length === 0 ? (
          <Button onClick={initializeDefaultRules} className="neu-btn-primary">
            Inicializar Reglas
          </Button>
        ) : null}
      </div>

      <div className="space-y-4">
        {rules?.map((rule) => (
          <Card key={rule.id} className="p-6 border-none shadow-md bg-background/50 flex items-center gap-6">
            <div className="text-muted-foreground cursor-grab">
                <GripVertical className="w-5 h-5" />
            </div>

            <div className="p-3 bg-card rounded-2xl shadow-inner">
                {getIcon(rule.tipo)}
            </div>

            <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm uppercase tracking-wide">{getLabel(rule.tipo)}</h4>
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black">Prioridad {rule.prioridad}</span>
                </div>
                <p className="text-xs text-muted-foreground max-w-xl">{getDescription(rule.tipo)}</p>
            </div>

            {rule.tipo === 'TOLERANCE' && (
                <div className="flex items-center gap-2 mr-4">
                    <Label className="text-xs font-bold uppercase">Max ($):</Label>
                    <Input
                        type="number"
                        className="w-20 h-8"
                        defaultValue={(rule.tolerancia_cents || 0) / 100}
                        onBlur={(e) => updateTolerance(rule.id, e.target.value)}
                    />
                </div>
            )}

            <div className="flex items-center gap-3">
                <Label htmlFor={`active-${rule.id}`} className="text-xs font-bold uppercase cursor-pointer">
                    {rule.activo ? 'Activa' : 'Inactiva'}
                </Label>
                <Switch
                    id={`active-${rule.id}`}
                    checked={rule.activo}
                    onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
