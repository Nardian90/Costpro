'use client';

/**
 * ExecutivePeriodBar — control de período del Resumen Ejecutivo.
 *
 * Presets 7/30/90 días + rango personalizado (mismos límites del dashboard
 * anterior: sin fechas futuras, máx 365 días, máx 730 días hacia atrás) con
 * UNA diferencia de honestidad: siempre muestra el INTERVALO real del período
 * activo y de su ventana de comparación (misión §6 — «cada período debe
 * indicar claramente su intervalo de fechas»; corrige el defecto de auditoría
 * que mostraba «Ventas (30d)» con rango personalizado).
 */

import React from 'react';
import dynamic from 'next/dynamic';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CalendarRange, Loader2, RefreshCw } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { buildCustomPeriod, buildPresetPeriod, windowLabel, type ExecutivePeriod } from './useExecutiveData';

export interface ExecutivePeriodBarProps {
  period: ExecutivePeriod;
  onChange: (p: ExecutivePeriod) => void;
  isFetching: boolean;
  onRefresh: () => void;
}

export function ExecutivePeriodBar({ period, onChange, isFetching, onRefresh }: ExecutivePeriodBarProps) {
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);

  const applyPreset = (days: 7 | 30 | 90) => {
    setDateRange(undefined);
    onChange(buildPresetPeriod(days));
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-card p-2 sm:p-2.5"
      data-testid="executive-period-bar"
    >
      <ToggleGroup
        type="single"
        value={period.preset === 'custom' ? '' : String(period.preset)}
        onValueChange={(v) => { if (v) applyPreset(Number(v) as 7 | 30 | 90); }}
        className="bg-muted rounded-xl p-1"
      >
        {([7, 30, 90] as const).map((d) => (
          <ToggleGroupItem
            key={d}
            value={String(d)}
            aria-label={`Últimos ${d} días`}
            className="text-xs font-bold px-3 py-2 min-h-[40px] rounded-lg data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {d}d
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* Rango personalizado con validaciones del dashboard anterior */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'h-10 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-colors min-h-[40px]',
              period.preset === 'custom'
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/50 bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-label="Seleccionar rango de fechas personalizado"
          >
            <CalendarRange className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{period.preset === 'custom' ? 'Personalizado' : 'Rango'}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 border-border/50 bg-card shadow-sm rounded-2xl" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => {
              setDateRange(range);
              if (range?.from && range?.to) {
                const today = new Date();
                if (range.to > today) {
                  toast.error('La fecha final no puede ser futura');
                  return;
                }
                const diffDays = Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000);
                if (diffDays > 365) {
                  toast.error('El rango máximo es de 365 días');
                  return;
                }
                onChange(buildCustomPeriod(format(range.from, 'yyyy-MM-dd'), format(range.to, 'yyyy-MM-dd')));
              }
            }}
            numberOfMonths={2}
            disabled={(date) => date > new Date() || date < subDays(new Date(), 730)}
            initialFocus
            className="rounded-2xl"
          />
          {dateRange?.from && dateRange?.to && (
            <div className="p-2 border-t border-border/30 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {format(dateRange.from, 'dd/MM/yy')} → {format(dateRange.to, 'dd/MM/yy')}
              </span>
              <button
                type="button"
                onClick={() => { setDateRange(undefined); onChange(buildPresetPeriod(30)); }}
                className="text-xs font-black uppercase tracking-wider text-destructive hover:underline"
              >
                Volver a 30d
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Intervalo explícito del período activo y de comparación */}
      <div className="flex flex-col gap-0.5 min-w-0 ml-1" data-testid="executive-period-labels">
        <span className="text-[11px] font-bold text-foreground tabular-nums leading-tight">
          Período: {windowLabel(period.current)}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums leading-tight">
          Comparado con: {windowLabel(period.previous)}
        </span>
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        className="w-10 h-10 ml-auto rounded-xl border border-border/50 bg-card hover:bg-muted transition-colors flex items-center justify-center disabled:opacity-50"
        aria-label="Refrescar datos"
        title="Refrescar"
      >
        {isFetching ? <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
    </div>
  );
}
