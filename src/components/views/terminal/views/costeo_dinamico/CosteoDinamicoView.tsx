'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';
import { getRiskColor, getRiskLabel } from '@/lib/costeo-dinamico/risk.classifier';
import type { ProductCostResult, DashboardSummary, CurrentRate, CostEngineConfig, RateSource } from '@/lib/costeo-dinamico/types';
import {
  TrendingUp, TrendingDown, AlertTriangle, DollarSign, Package,
  Loader2, RefreshCw, Sliders, CheckCircle2, ArrowLeftRight, Search, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useUserPreferences } from '@/hooks/useUserPreferences';

// ─── F-02 / F-02b: Selector cross-módulo de fuente de tasa ──────────────────
// Persiste la preferencia del usuario cross-device (Supabase + localStorage
// fallback) vía `useUserPreferences`, para que el motor de costeo use la
// misma fuente que se muestra en Inteligencia Cambiaria, en vez de
// hardcodear siempre BCC_seg3. Los valores deben coincidir con `RateSource`
// en `src/lib/costeo-dinamico/types.ts` (excluyendo 'Manual' que es solo para
// simulación manual).
// IMPORTANTE: 'elToque' se mapea en el backend (route.ts línea 102) a
// `source='elToque', segment='3'` en la tabla `exchange_rates`, que es donde
// se persiste la estimación informal (BCC seg3 × 1.15). Ver worklog
// IC-F01-RENAME-ELTOQUE-INFORMAL para el contexto del renombramiento UI.
// F-02b: la preferencia ahora se sincroniza móvil ↔ desktop vía la tabla
// `user_preferences` (Supabase). localStorage sigue siendo la capa de
// fallback offline. Ver worklog IC-F02B-PREFERENCES-SUPABASE.
const RATE_SOURCE_PREFERENCE_KEY = 'costeo-dinamico:rate-source';
const RATE_SOURCE_OPTIONS: { value: RateSource; shortLabel: string; description: string }[] = [
  { value: 'BCC_seg1', shortLabel: 'BCC seg1', description: 'BCC segmento 1 — Estatal (empresas estatales).' },
  { value: 'BCC_seg2', shortLabel: 'BCC seg2', description: 'BCC segmento 2 — CADECA (cajero minorista).' },
  { value: 'BCC_seg3', shortLabel: 'BCC seg3', description: 'BCC segmento 3 — MIPYMES (por defecto).' },
  { value: 'elToque', shortLabel: 'Informal', description: 'Informal estimada — BCC seg3 × 1.15. Aproxima el mercado paralelo; no es captura de eltoque.com.' },
];

function getRateSourceLabel(value: RateSource): string {
  switch (value) {
    case 'BCC_seg1': return 'BCC Estatal';
    case 'BCC_seg2': return 'BCC CADECA';
    case 'BCC_seg3': return 'BCC MIPYMES';
    case 'elToque':  return 'Informal estimada';
    case 'Manual':   return 'Manual';
  }
}

function isValidRateSource(value: string | null): value is RateSource {
  return value === 'BCC_seg1' || value === 'BCC_seg2' || value === 'BCC_seg3' || value === 'elToque' || value === 'Manual';
}

export default function CosteoDinamicoView() {
  const user = useAuthStore((s) => s.user);
  const storeId = (user as any)?.activeStoreId;

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ProductCostResult[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [currentRate, setCurrentRate] = useState<CurrentRate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('risk');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // F-02b: Preferencia de fuente de tasa persistida cross-device vía el hook
  // `useUserPreferences` (Supabase + localStorage fallback). El usuario puede
  // elegir entre las 4 fuentes que muestra Inteligencia Cambiaria (BCC seg1/2/3
  // + Informal estimada) para que el motor de costeo use la misma tasa que ve
  // en el otro módulo.
  //
  // El hook devuelve `value` (raw, podría ser string inválido si la BD o
  // localStorage están corruptos), `update` (async, guarda en ambos lados) y
  // `loading` (true mientras carga desde Supabase/localStorage).
  //
  // Defense-in-depth: `isValidRateSource` valida el valor antes de usarlo. Si
  // el valor persistido es inválido, cae a `'BCC_seg3'` (default). El valor
  // corrupto permanece en el almacenamiento hasta que el usuario cambie el
  // selector, momento en el que se sobreescribe con un valor válido.
  const {
    value: storedRateSource,
    update: updateRateSource,
    loading: prefLoading,
  } = useUserPreferences<RateSource>(RATE_SOURCE_PREFERENCE_KEY, 'BCC_seg3');

  const rateSource: RateSource = isValidRateSource(storedRateSource)
    ? storedRateSource
    : 'BCC_seg3';

  // Wrapper sync sobre `updateRateSource` (async) para mantener la firma
  // `setRateSource(value: RateSource): void` que usan los onClick del selector.
  // No se hace `await` porque el update es optimista (estado local se actualiza
  // inmediatamente dentro del hook) y la persistencia en Supabase es
  // fire-and-forget. Si Supabase falla, localStorage ya tiene el valor.
  const setRateSource = useCallback(
    (v: RateSource) => { void updateRateSource(v); },
    [updateRateSource],
  );

  // Simulación
  const [simulating, setSimulating] = useState(false);
  const [simRate, setSimRate] = useState('');
  const [showSimPanel, setShowSimPanel] = useState(false);

  // Commit
  const [committing, setCommitting] = useState(false);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());

  // Config — `rate_source` se inicializa con el default `'BCC_seg3'` y se
  // sincroniza con la preferencia persistida vía el efecto de abajo. El
  // primer render usa el default; el efecto lo corrige una vez que el hook
  // termina de cargar. El `useEffect[fetchData]` no dispara fetch mientras
  // `prefLoading` sea true (ver abajo), evitando un fetch inicial con el
  // valor default incorrecto.
  const [config, setConfig] = useState<CostEngineConfig>(() => ({
    min_margin: 0.15,
    target_margin: 0.30,
    rounding_rule: 'multiple_10',
    rounding_direction: 'nearest',
    rate_source: 'BCC_seg3',
    manual_rate: null,
  }));

  // F-02: mantener config.rate_source sincronizado con la preferencia del
  // selector para que cualquier consumidor futuro de `config` vea el valor
  // correcto. El fetch usa `rateSource` directamente para evitar el ciclo
  // extra de render que introduciría depender de `config.rate_source`.
  useEffect(() => {
    setConfig(prev => prev.rate_source === rateSource ? prev : { ...prev, rate_source: rateSource });
  }, [rateSource]);

  const fetchData = useCallback(async () => {
    if (!storeId) {
      toast.error('No hay tienda activa');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        store_id: storeId,
        source: rateSource,
        min_margin: String(config.min_margin),
        target_margin: String(config.target_margin),
        rounding: config.rounding_rule,
      });
      const data = await apiFetch(`/api/inventory/costeo-dinamico?${params}`);
      setResults(data.data || []);
      setDashboard(data.dashboard || null);
      setCurrentRate(data.currentRate || null);
    } catch (e: any) {
      toast.error('Error al cargar costeo: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [storeId, config.min_margin, config.target_margin, config.rounding_rule, rateSource]);

  // F-02b: no disparar fetch hasta que la preferencia esté cargada. Sin este
  // guard, el primer render usaría el default `'BCC_seg3'` incluso si el
  // usuario tiene `'elToque'` persistido, causando un fetch incorrecto seguido
  // del fetch correcto cuando la preferencia cargue. Con el guard, solo se
  // hace un fetch (con el valor correcto) una vez que `prefLoading` sea false.
  useEffect(() => {
    if (prefLoading) return;
    fetchData();
  }, [fetchData, prefLoading]);

  const handleSimulate = async () => {
    if (!simRate || !storeId) return;
    setSimulating(true);
    try {
      const data = await apiFetch('/api/inventory/costeo-dinamico/simulate', {
        method: 'POST',
        body: JSON.stringify({
          store_id: storeId,
          currency: 'USD',
          simulated_rate: parseFloat(simRate),
          source: 'Manual',
          min_margin: config.min_margin,
          target_margin: config.target_margin,
          rounding: config.rounding_rule,
        }),
      });
      setResults(data.data || []);
      setDashboard(data.dashboard || null);
      setCurrentRate(data.currentRate || null);
      toast.success(`Simulación con tasa ${simRate} CUP/USD aplicada`);
    } catch (e: any) {
      toast.error('Error en simulación: ' + e.message);
    } finally {
      setSimulating(false);
    }
  };

  const handleCommit = async () => {
    if (selectedProducts.size === 0 || !storeId || !currentRate) return;
    setCommitting(true);
    try {
      const priceUpdates = results
        .filter(r => selectedProducts.has(r.product_id))
        .map(r => ({ product_id: r.product_id, new_price: r.suggested_price }));

      const data = await apiFetch('/api/inventory/costeo-dinamico/commit', {
        method: 'POST',
        body: JSON.stringify({
          store_id: storeId,
          product_ids: Array.from(selectedProducts),
          price_updates: priceUpdates,
          tasa_usada: currentRate.rate,
          fuente_tasa: currentRate.source,
          motivo: 'Actualización por costeo dinámico',
        }),
      });
      toast.success(`${data.committed} precios actualizados`);
      setShowCommitModal(false);
      setSelectedProducts(new Set());
      fetchData();
    } catch (e: any) {
      toast.error('Error al actualizar precios: ' + e.message);
    } finally {
      setCommitting(false);
    }
  };

  // Filtrar y ordenar
  const filtered = results
    .filter(r => !searchTerm || r.product_name.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(r => riskFilter === 'all' || r.risk === riskFilter)
    .sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name': cmp = a.product_name.localeCompare(b.product_name); break;
        case 'risk': cmp = ['muy_bajo','bajo','medio','alto','critico'].indexOf(a.risk) - ['muy_bajo','bajo','medio','alto','critico'].indexOf(b.risk); break;
        case 'cost': cmp = a.breakdown.total_real_cost - b.breakdown.total_real_cost; break;
        case 'margin': cmp = a.current_margin_pct - b.current_margin_pct; break;
        case 'fpr': cmp = a.fpr - b.fpr; break;
        case 'price': cmp = a.suggested_price - b.suggested_price; break;
        default: cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const toggleSelect = (id: string) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // F4.5: Export to CSV
  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.warning('No hay datos para exportar');
      return;
    }
    const headers = [
      'Producto', 'Existencia', 'Costo Base', '+Transporte', '+Manipulación',
      '+Otros Servicios', '+Comisiones', '+Impacto Cambiario', 'Costo Real Total',
      'Costo Histórico', 'Costo Reposición', 'Precio Actual', 'Margen %',
      'Precio Sugerido', 'FPR', 'Riesgo', 'Pérdida Potencial',
    ];
    const rows = filtered.map(r => [
      `"${r.product_name}"`,
      r.stock_current,
      r.breakdown.base_cost.toFixed(2),
      r.breakdown.transport_cost.toFixed(2),
      r.breakdown.manipulation_cost.toFixed(2),
      r.breakdown.other_services_cost.toFixed(2),
      r.breakdown.commission_cost.toFixed(2),
      r.breakdown.exchange_rate_impact.toFixed(2),
      r.breakdown.total_real_cost.toFixed(2),
      r.historical_cost.toFixed(2),
      r.replacement_cost.toFixed(2),
      r.current_price.toFixed(2),
      (r.current_margin_pct * 100).toFixed(1) + '%',
      r.suggested_price.toFixed(2),
      r.fpr.toFixed(4),
      getRiskLabel(r.risk),
      r.potential_loss.toFixed(2),
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `costeo-dinamico-${storeId}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exportados ${filtered.length} productos a CSV`);
  };

  if (!storeId) {
    return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Selecciona una tienda para ver el costeo dinámico</p></div>;
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight">Costeo Dinámico</h1>
            <p className="text-xs text-muted-foreground">
              Tasa actual: {currentRate ? `${currentRate.rate} CUP/${currentRate.currency} (${currentRate.source})` : 'N/A'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSimPanel(!showSimPanel)} className="flex items-center gap-2">
            <Sliders className="w-4 h-4" /> Simular
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="flex items-center gap-2">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Actualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0} className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Exportar
          </Button>
          {selectedProducts.size > 0 && (
            <Button size="sm" onClick={() => setShowCommitModal(true)} className="flex items-center gap-2 bg-primary">
              <CheckCircle2 className="w-4 h-4" /> Actualizar {selectedProducts.size} precios
            </Button>
          )}
        </div>
      </div>

      {/* F-02: Selector cross-módulo de fuente de tasa + badge visible */}
      <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-xl border border-border bg-card/50">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Tasa aplicada al costeo
            </Label>
            <div
              className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5 gap-0.5"
              role="radiogroup"
              aria-label="Fuente de tasa"
            >
              {RATE_SOURCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={rateSource === opt.value}
                  onClick={() => setRateSource(opt.value)}
                  title={opt.description}
                  className={cn(
                    'min-h-[44px] px-3 rounded-md text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    rateSource === opt.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                >
                  {opt.shortLabel}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground max-w-xs hidden sm:block">
            Selecciona qué tasa aplica al costeo. Por defecto BCC seg3 (MIPYMES).
            «Informal» = BCC seg3 × 1.15.
          </p>
        </div>
        <div
          className="text-xs px-3 py-1.5 rounded-md bg-primary/10 border border-primary/30 text-primary font-mono font-bold"
          title="Fuente de tasa utilizada en el cálculo del costeo. Coincide con la tabla Inteligencia Cambiaria."
        >
          Tasa usada: {getRateSourceLabel(rateSource)}
        </div>
      </div>

      {/* Dashboard KPIs */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard
            label="Valor Histórico"
            value={fmtMoneyCompact(dashboard.total_historical_value)}
            subtitle={fmtMoney(dashboard.total_historical_value) + ' CUP'}
            icon={<Package className="w-4 h-4" />}
            size="md"
          />
          <KPICard
            label="Valor Reposición"
            value={fmtMoneyCompact(dashboard.total_replacement_value)}
            subtitle={fmtMoney(dashboard.total_replacement_value) + ' CUP'}
            icon={<TrendingUp className="w-4 h-4" />}
            highlight={dashboard.total_replacement_value > dashboard.total_historical_value ? 'warn' : 'none'}
            size="md"
          />
          <KPICard
            label="Capital Adicional"
            value={fmtMoneyCompact(dashboard.capital_additional_needed)}
            subtitle="Para reponer inventario"
            icon={<DollarSign className="w-4 h-4" />}
            highlight={dashboard.capital_additional_needed > 0 ? 'warn' : 'none'}
            size="md"
          />
          <KPICard
            label="Incremento %"
            value={`${(dashboard.increase_pct * 100).toFixed(1)}%`}
            subtitle={fmtMoneyCompact(dashboard.increase_absolute) + ' CUP'}
            icon={<TrendingUp className="w-4 h-4" />}
            highlight={dashboard.increase_pct > 0.3 ? 'danger' : dashboard.increase_pct > 0.1 ? 'warn' : 'none'}
            size="md"
          />
          <KPICard
            label="Margen Negativo"
            value={String(dashboard.products_negative_margin)}
            subtitle={dashboard.products_negative_margin === 1 ? '1 producto' : `${dashboard.products_negative_margin} productos`}
            icon={<AlertTriangle className="w-4 h-4" />}
            highlight={dashboard.products_negative_margin > 0 ? 'danger' : 'success'}
            size="md"
          />
          <KPICard
            label="Pérdida Potencial"
            value={fmtMoneyCompact(dashboard.total_potential_loss)}
            subtitle={fmtMoney(dashboard.total_potential_loss) + ' CUP'}
            icon={<TrendingDown className="w-4 h-4" />}
            highlight={dashboard.total_potential_loss > 0 ? 'danger' : 'success'}
            size="lg"
          />
        </div>
      )}

      {/* Risk breakdown */}
      {dashboard && (
        <div className="flex items-center gap-2 flex-wrap">
          {(['muy_bajo','bajo','medio','alto','critico'] as const).map(level => (
            <button key={level} onClick={() => setRiskFilter(riskFilter === level ? 'all' : level)}
              className={cn('px-3 py-1 rounded-full text-xs font-bold border transition-all',
                riskFilter === level ? getRiskColor(level) : 'border-border text-muted-foreground hover:bg-muted/50')}>
              {getRiskLabel(level)}: {dashboard.products_by_risk[level]}
            </button>
          ))}
          {riskFilter !== 'all' && (
            <button onClick={() => setRiskFilter('all')} className="text-xs text-primary underline">Limpiar filtro</button>
          )}
        </div>
      )}

      {/* Simulación panel */}
      <AnimatePresence>
        {showSimPanel && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase">Tasa a simular (CUP/USD)</Label>
                <Input type="number" value={simRate} onChange={e => setSimRate(e.target.value)} placeholder="600" className="w-32 h-10" />
              </div>
              <Button onClick={handleSimulate} disabled={simulating || !simRate} className="h-10">
                {simulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
                Aplicar simulación
              </Button>
              <Button variant="outline" onClick={fetchData} className="h-10">Restablecer</Button>
              <p className="text-xs text-muted-foreground ml-2">La simulación no modifica datos reales</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold">No hay productos para mostrar</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="p-2 w-8"><input type="checkbox" checked={selectedProducts.size === filtered.length} onChange={e => setSelectedProducts(e.target.checked ? new Set(filtered.map(r => r.product_id)) : new Set())} /></th>
                <Th label="Producto" col="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Exist." col="stock" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="Costo Base" col="cost" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="+Servicios" col="services" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="+Comisiones" col="commissions" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="+Impacto Camb." col="impact" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="Costo Real" col="cost" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right font-bold" />
                <Th label="Precio Act." col="price" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="Margen %" col="margin" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="P. Sugerido" col="price" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="FPR" col="fpr" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <Th label="Riesgo" col="risk" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-center" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.product_id} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="p-2"><input type="checkbox" checked={selectedProducts.has(r.product_id)} onChange={() => toggleSelect(r.product_id)} /></td>
                  <td className="p-2 font-medium truncate max-w-[200px]">{r.product_name}</td>
                  <td className="p-2 text-right tabular-nums">{r.stock_current}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMoney(r.breakdown.base_cost)}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMoney(r.breakdown.transport_cost + r.breakdown.manipulation_cost + r.breakdown.other_services_cost)}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMoney(r.breakdown.commission_cost)}</td>
                  <td className={cn('p-2 text-right tabular-nums', r.breakdown.exchange_rate_impact > 0 ? 'text-orange-600' : 'text-muted-foreground')}>
                    {r.breakdown.exchange_rate_impact > 0 ? `+${fmtMoney(r.breakdown.exchange_rate_impact)}` : '—'}
                  </td>
                  <td className="p-2 text-right tabular-nums font-bold">{fmtMoney(r.breakdown.total_real_cost)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(r.current_price)}</td>
                  <td className={cn('p-2 text-right tabular-nums font-bold', r.current_margin_pct < 0 ? 'text-red-600' : r.current_margin_pct < config.min_margin ? 'text-amber-600' : 'text-emerald-600')}>
                    {(r.current_margin_pct * 100).toFixed(1)}%
                  </td>
                  <td className="p-2 text-right tabular-nums font-bold text-primary">{fmtMoney(r.suggested_price)}</td>
                  <td className="p-2 text-right tabular-nums">{r.fpr.toFixed(2)}</td>
                  <td className="p-2 text-center">
                    <span className={cn('inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border', getRiskColor(r.risk))}>
                      {getRiskLabel(r.risk)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Commit Modal */}
      <AnimatePresence>
        {showCommitModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCommitModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-background rounded-2xl border border-border p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-black uppercase">Confirmar actualización</h2>
              <p className="text-sm text-muted-foreground">
                Se actualizarán <strong className="text-foreground">{selectedProducts.size}</strong> productos con los precios sugeridos.
                Tasa usada: <strong>{currentRate?.rate} CUP/{currentRate?.currency}</strong> ({currentRate?.source}).
              </p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
                {results.filter(r => selectedProducts.has(r.product_id)).map(r => (
                  <div key={r.product_id} className="flex items-center justify-between text-xs">
                    <span className="truncate">{r.product_name}</span>
                    <span className="tabular-nums text-muted-foreground">{fmtMoney(r.current_price)} → <strong className="text-foreground">{fmtMoney(r.suggested_price)}</strong></span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCommitModal(false)}>Cancelar</Button>
                <Button onClick={handleCommit} disabled={committing} className="bg-primary">
                  {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Formato compacto: 189,440,631 → $189.4M | 1,234,567 → $1.2M | 12,345 → $12.3K */
function fmtMoneyCompact(n: number): string {
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/** Formato completo con separadores: 189,440,631 → $189,440,631 */
function fmtMoney(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP', maximumFractionDigits: 0 }).format(n);
}

interface KPICardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  highlight?: 'none' | 'warn' | 'danger' | 'success';
  /** Tamaño del número principal */
  size?: 'sm' | 'md' | 'lg';
}

function KPICard({ label, value, subtitle, icon, highlight = 'none', size = 'md' }: KPICardProps) {
  const borderColor = highlight === 'danger' ? 'border-l-4 border-l-red-500' : highlight === 'warn' ? 'border-l-4 border-l-amber-500' : highlight === 'success' ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent';
  const bgColor = highlight === 'danger' ? 'bg-red-50/60 dark:bg-red-950/20' : highlight === 'warn' ? 'bg-amber-50/60 dark:bg-amber-950/20' : highlight === 'success' ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : 'bg-card';
  const valueColor = highlight === 'danger' ? 'text-red-600 dark:text-red-400' : highlight === 'warn' ? 'text-amber-600 dark:text-amber-400' : highlight === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground';
  const iconColor = highlight === 'danger' ? 'text-red-500' : highlight === 'warn' ? 'text-amber-500' : highlight === 'success' ? 'text-emerald-500' : 'text-muted-foreground';
  const valueSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-xl';

  return (
    <div className={cn('p-4 rounded-xl border border-border', borderColor, bgColor, 'transition-all hover:shadow-md')}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className={cn('shrink-0', iconColor)}>{icon}</span>
      </div>
      <p className={cn('font-black tabular-nums leading-tight', valueSize, valueColor)}>
        {value}
      </p>
      {subtitle && (
        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">{subtitle}</p>
      )}
    </div>
  );
}

function Th({ label, col, sortBy, sortDir, onSort, className }: { label: string; col: string; sortBy: string; sortDir: string; onSort: (c: string) => void; className?: string }) {
  return (
    <th className={cn('p-2 cursor-pointer hover:bg-muted/70 select-none', className)} onClick={() => onSort(col)}>
      {label} {sortBy === col && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );
}
