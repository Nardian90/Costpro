'use client';

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Star,
  Plus,
  Trash2,
  Copy,
  BarChart3,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useScenarioStore } from '@/store/scenario-store';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import type { CostSheetScenario } from '@/types/cost-sheet';

interface ScenarioManagerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCENARIO_COLORS: Record<string, string> = {
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
};

const ScenarioManagerSheet: React.FC<ScenarioManagerSheetProps> = ({
  open,
  onOpenChange,
}) => {
  const {
    activeScenarioIds,
    isComparisonMode,
    toggleComparisonMode,
    createScenario,
    deleteScenario,
    renameScenario,
    setPrimaryScenario,
    activateScenario,
    deactivateScenario,
  } = useScenarioStore();

  const { data } = useCostSheetStore();
  const scenarios: CostSheetScenario[] = data?.scenarios || [];
  const primaryId = data?.scenarioConfig?.primaryScenarioId || 'v1';

  const handleCreate = () => {
    const usedIds = scenarios.map((s) => s.id);
    const sourceId = usedIds.includes('v1') ? 'v1' : 'v2';
    createScenario(sourceId as any, `Escenario ${scenarios.length + 1}`);
  };

  const handleDuplicate = (scenario: CostSheetScenario) => {
    createScenario(scenario.id as any, `${scenario.label} (Copia)`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 overflow-y-auto">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            Gestión de Escenarios
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Administra hasta 3 escenarios de costo para comparar y analizar diferentes configuraciones.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 space-y-6">
          {/* Comparison mode toggle */}
          <div className="flex items-center justify-between p-4 rounded-2xl border bg-muted/30">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs font-bold">Modo Comparación</p>
                <p className="text-[10px] text-muted-foreground">
                  {isComparisonMode
                    ? `${activeScenarioIds.length} escenarios activos`
                    : 'Activa 2+ escenarios para comparar'}
                </p>
              </div>
            </div>
            <Switch
              id="comparison-mode"
              checked={isComparisonMode}
              onCheckedChange={toggleComparisonMode}
              disabled={activeScenarioIds.length < 2}
              className="data-[state=checked]:bg-primary"
            />
          </div>

          {/* Scenario list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Escenarios ({scenarios.length}/3)
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px] gap-1.5 rounded-lg"
                onClick={handleCreate}
                disabled={scenarios.length >= 3}
              >
                <Plus className="w-3 h-3" />
                Nuevo
              </Button>
            </div>

            {scenarios.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No hay escenarios. Crea uno para empezar.
              </div>
            ) : (
              <div className="space-y-2">
                {scenarios.map((scenario) => {
                  const isPrimary = scenario.id === primaryId;
                  const isActive = activeScenarioIds.includes(scenario.id as any);

                  return (
                    <div
                      key={scenario.id}
                      className={cn(
                        'group flex items-center gap-3 p-3 rounded-xl border transition-all',
                        isPrimary
                          ? 'border-amber-500/30 bg-amber-500/5'
                          : 'border-border/50 bg-card hover:bg-muted/30'
                      )}
                    >
                      {/* Color dot */}
                      <div
                        className={cn(
                          'w-3 h-3 rounded-full shrink-0',
                          SCENARIO_COLORS[scenario.color] || 'bg-gray-400'
                        )}
                      />

                      {/* Label (editable) */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Input
                            value={scenario.label}
                            onChange={(e) =>
                              renameScenario(scenario.id as any, e.target.value)
                            }
                            className="h-6 text-xs font-bold bg-transparent border-none p-0 focus-visible:ring-0 w-full truncate"
                          />
                          {isPrimary && (
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {isActive ? 'Activo' : 'Inactivo'} · Creado{' '}
                          {new Date(scenario.createdAt).toLocaleDateString('es-CU')}
                        </p>
                      </div>

                      {/* Active toggle */}
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            activateScenario(scenario.id as any);
                          } else if (activeScenarioIds.length > 1) {
                            deactivateScenario(scenario.id as any);
                          }
                        }}
                        className="data-[state=checked]:bg-primary shrink-0"
                      />

                      {/* Actions dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-xl">
                          <DropdownMenuItem
                            onClick={() =>
                              setPrimaryScenario(scenario.id as any)
                            }
                            className="text-xs"
                            disabled={isPrimary}
                          >
                            <Star className="w-3.5 h-3.5 mr-2 text-amber-500" />
                            Establecer como Principal
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDuplicate(scenario)}
                            className="text-xs"
                            disabled={scenarios.length >= 3}
                          >
                            <Copy className="w-3.5 h-3.5 mr-2" />
                            Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => deleteScenario(scenario.id as any)}
                            className="text-xs text-destructive focus:bg-destructive/10"
                            disabled={isPrimary}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-3 rounded-xl bg-muted/20 text-[10px] text-muted-foreground space-y-1">
            <p className="font-bold text-foreground/70">Consejos:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Activa 2 o más escenarios para habilitar la comparación</li>
              <li>El escenario &quot;Principal&quot; aplica sus valores a la ficha base</li>
              <li>Máximo 3 escenarios simultáneos</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ScenarioManagerSheet;
