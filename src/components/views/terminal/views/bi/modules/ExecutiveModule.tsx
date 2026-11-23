'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ExecutiveModule — Resumen Ejecutivo del Centro de Inteligencia (misión §3)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rediseño PROFUNDO del dashboard «ENERVIDA-VITALLCONS» (antes Inicio →
 * OPERACIÓN → Dashboard). Estructura por lógica de decisión:
 *
 *   1. Período con intervalos explícitos (actual + ventana de comparación).
 *   2. KPIs con contexto: valor, variación real vs período equivalente
 *      anterior, y tooltip con el valor anterior (misión §3A: ninguna cifra
 *      aislada).
 *   3. Evolución diaria con el período anterior como referencia.
 *   4. Señales y puntos de atención: reglas verificables, magnitud y lectura
 *      sugerida (misión §3C).
 *   5. Productos que sostienen el negocio: tabla fusionada (ingreso, uds,
 *      margen, participación) + margen por categoría (misión §4: sin
 *      duplicación de indicadores).
 *   6. Cuándo y cómo se vende (días + métodos de pago).
 *   7. Observaciones ejecutivas: hecho → evidencia → lectura (misión §3D).
 *
 * Integridad: SOLO consume el RPC existente get_store_analytics_advanced dos
 * veces (período actual + período equivalente anterior) vía useStoreAnalytics
 * — sin SQL nuevo, sin fórmulas alteradas, tienda activa como fuente.
 */

import React, { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { StateRenderer } from '@/components/ui/StateRenderer';
import type { BiModuleProps } from '../../bi-module-registry';
import { useStoreAnalytics, type StoreAnalytics } from '@/hooks/api/useStoreAnalytics';
import {
  useExecutiveData, useExecutiveSignals, useExecutiveObservations,
  buildPresetPeriod, type ExecutivePeriod,
} from './useExecutiveData';
import { ExecutivePeriodBar } from './ExecutivePeriodBar';
import { ExecutiveKpiRow } from './ExecutiveKpiRow';
import { ExecutiveEvolutionChart } from './ExecutiveEvolutionChart';
import { SignalsPanel } from './SignalsPanel';
import { ProductsPanel } from './ProductsPanel';
import { BehaviorPanel } from './BehaviorPanel';
import { ObservationsPanel } from './ObservationsPanel';
import { SmartPurchaseOrder } from '../../shared/SmartPurchaseOrder';

export default function ExecutiveModule({ storeId, storeName }: BiModuleProps) {
  const [period, setPeriod] = useState<ExecutivePeriod>(() => buildPresetPeriod(30));
  const data = useExecutiveData(storeId, period);
  const signals = useExecutiveSignals(data);
  const observations = useExecutiveObservations(data);

  const cur: StoreAnalytics | undefined = data.current;

  const resumenContexto = useMemo(() => {
    if (!cur) return null;
    const hoy = cur.kpis?.today_sales ?? 0;
    const hoyTx = cur.kpis?.today_transactions ?? 0;
    const uds = cur.kpis?.period_items_sold ?? 0;
    return { hoy, hoyTx, uds };
  }, [cur]);

  return (
    <div className="space-y-5" data-testid="executive-module">
      {/* 1 · Período con intervalos explícitos */}
      <ExecutivePeriodBar
        period={period}
        onChange={setPeriod}
        isFetching={data.isFetching}
        onRefresh={data.refetch}
      />

      <StateRenderer
        isLoading={data.isLoading}
        error={data.error}
        onRetry={data.error ? data.refetch : undefined}
        data={cur ? [cur] : []}
        loadingComponent={<ExecutiveSkeleton />}
        emptyComponent={
          <div className="p-8 rounded-xl border border-border/50 bg-card text-center text-sm text-muted-foreground">
            Sin datos para este período.
          </div>
        }
      >
        {() =>
          cur && (
            <>
              {/* 2 · KPIs con contexto y variación real */}
              <ExecutiveKpiRow data={data} />

              {/* Contexto operativo mínimo (sin duplicar KPIs): hoy + unidades del período */}
              <p className="text-[11px] text-muted-foreground px-1" data-testid="executive-context-line">
                Hoy: {resumenContexto?.hoyTx ?? 0} transacciones · unidades vendidas en el período: {resumenContexto?.uds ?? 0}
                {!data.hasPreviousBase && ' · el período anterior no registra ventas: comparación sin base'}
              </p>

              {/* 3 · Evolución del período vs anterior */}
              <section aria-label="Evolución de las ventas" data-testid="executive-evolution">
                <div className="rounded-xl border border-border/50 bg-card p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      Evolución de las ventas
                    </h2>
                    <span className="text-[10px] text-muted-foreground">
                      ventas diarias · CUP · barras: período actual · línea: período anterior equivalente
                    </span>
                  </div>
                  <ExecutiveEvolutionChart
                    current={cur}
                    previous={data.previous}
                    hasPreviousBase={data.hasPreviousBase}
                  />
                </div>
              </section>

              {/* 4 · Señales y puntos de atención (misión §3C) */}
              <SignalsPanel signals={signals} />

              {/* Reposición sugerida (funcionalidad preservada del dashboard anterior) */}
              <SmartPurchaseOrder analytics={cur} />

              {/* 5 · Productos que sostienen el negocio (fusionado, sin duplicar) */}
              <ProductsPanel analytics={cur} />

              {/* 6 · Cuándo y cómo se vende */}
              <BehaviorPanel analytics={cur} />

              {/* 7 · Observaciones ejecutivas (hecho → evidencia → lectura) */}
              <ObservationsPanel observations={observations} />
            </>
          )
        }
      </StateRenderer>
    </div>
  );
}

function ExecutiveSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
