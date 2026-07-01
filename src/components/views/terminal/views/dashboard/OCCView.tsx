'use client';

import React, { useMemo, useEffect, useState } from 'react';
import {
  Search,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ArrowUpRight,
  History,
  Sparkles,
  Command,
  Plus,
  BarChart3,
  ShoppingCart,
  DollarSign,
  Percent,
} from 'lucide-react';
import { useUIStore, ViewType } from '@/store';
import { useAuthStore } from '@/store';
import { getActionsForUser, Action } from '@/config/actions';
import { getNavigationRoute } from '@/config/navigation/navigation-map';
import { useDashboardView } from './useDashboardView';
import { useProducts } from '@/hooks/api/useProducts';
import { formatCurrency, cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

/** Format a timestamp to relative time in Spanish */
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Justo ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

export default function OCCView() {
  const t = useTranslations('dashboard.storeDashboard');
  const { setCurrentView, setActiveCostSection, setIpvActiveTab } = useUIStore();
  const { user } = useAuthStore();
  const { kpis, isLoading } = useDashboardView();
  const { data: products = [] } = useProducts(user?.activeStoreId);

  const userActions = useMemo(() =>
    getActionsForUser(user?.role || 'user'),
  [user?.role]);

  const quickActions = useMemo(() => userActions.slice(0, 8), [userActions]);

  // Recent actions with real timestamps from localStorage
  const [recentActions, setRecentActions] = React.useState<{ action: Action; timestamp: number }[]>([]);

  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('recent_actions') || '[]');
      // saved format: [{ id: string, ts: number }, ...]
      const entries = (saved as Array<{ id: string; ts?: number }>)
        .map((entry) => {
          const action = userActions.find(a => a.id === entry.id);
          if (!action) return null;
          return { action, timestamp: entry.ts || Date.now() };
        })
        .filter((e): e is { action: Action; timestamp: number } => e !== null)
        .slice(0, 3);
      setRecentActions(entries);
    } catch {
      // localStorage may be unavailable in some environments
    }
  }, [userActions]);

  const criticalAlerts = useMemo(() =>
    products.filter(p => (p.stock_current ?? 0) <= (p.min_stock ?? 0)).length,
  [products]);

  const stats = useMemo(() => {
    const sales = kpis?.gross_sales || 0;
    const costs = kpis?.cost_of_goods || 0;
    const profit = kpis?.profit || 0;
    const margin = sales > 0 ? (profit / sales) * 100 : 0;

    // FIX UX-006: Trends now show "Sin datos previos" instead of fake hardcoded percentages
    return [
      {
        label: 'Ingresos Totales',
        value: formatCurrency(sales),
        trend: sales > 0 ? 'Operativo' : 'Sin actividad',
        up: sales > 0,
        icon: TrendingUp,
        color: 'text-primary'
      },
      {
        label: 'Margen Operativo',
        value: `${margin.toFixed(1)}%`,
        trend: margin > 20 ? 'Saludable' : margin > 0 ? 'Bajo' : 'Sin margen',
        up: margin > 20,
        icon: Percent,
        color: margin > 20 ? 'text-primary' : margin > 0 ? 'text-warning' : 'text-destructive'
      },
      {
        label: 'Alertas Críticas',
        value: criticalAlerts.toString(),
        trend: criticalAlerts > 5 ? 'Requiere Acción' : 'Estable',
        up: criticalAlerts <= 5,
        icon: AlertTriangle,
        color: criticalAlerts > 0 ? 'text-destructive' : 'text-muted-foreground'
      }
    ];
  }, [kpis, criticalAlerts]);

  const handleAction = (action: Action) => {
    const route = getNavigationRoute(action.route);

    if (route && route.type === 'module') {
      setCurrentView(route.view as ViewType);
      if (route.view === 'ipv') {
        setIpvActiveTab(route.tab);
      } else if (route.view === 'cost-sheets') {
        setActiveCostSection(route.tab);
      }
    } else {
      setCurrentView(action.route as ViewType);
    }

    // Update recents with real timestamp
    try {
      const recent = JSON.parse(localStorage.getItem('recent_actions') || '[]');
      const updated = [{ id: action.id, ts: Date.now() }, ...recent.filter((e: { id: string }) => e.id !== action.id)].slice(0, 5);
      localStorage.setItem('recent_actions', JSON.stringify(updated));
    } catch {
      // localStorage may be unavailable
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      {/* Header Section */}
      <header className="space-y-2">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-foreground">{t('occ.title')}</h1>
        </div>
        <p className="text-sm font-medium text-muted-foreground max-w-2xl">
            Bienvenido, <span className="text-foreground font-semibold">{user?.fullName}</span>. Tienes <span className={cn('font-semibold', criticalAlerts > 0 ? 'text-destructive' : 'text-muted-foreground')}>{criticalAlerts}</span> alertas activas que requieren tu atención inmediata.
        </p>
      </header>

      {/* Command Layer */}
      <section>
        <button type="button"
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="w-full flex items-center px-6 py-4 bg-card border border-border/50 rounded-2xl text-left hover:border-primary/30 hover:bg-muted/50 transition-all active:scale-[0.99]"
          aria-label="Abrir búsqueda rápida"
        >
          <Search className="w-5 h-5 text-muted-foreground mr-4" />
          <span className="flex-1 text-base font-medium text-muted-foreground/70">Buscar o ejecutar acción...</span>
          <kbd className="hidden sm:flex px-3 py-1.5 bg-muted rounded-xl text-sm font-semibold border border-border/50 items-center gap-2 text-muted-foreground uppercase tracking-wider">
            <Command className="w-3.5 h-3.5" /> K
          </kbd>
        </button>
      </section>

      {/* Quick Actions Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                Acciones Principales
            </h2>
            <div className="h-px flex-1 bg-border/50 mx-6" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <button type="button"
              key={action.id}
              onClick={() => handleAction(action)}
              className="group flex flex-col items-center justify-center p-6 bg-card border border-border/50 rounded-2xl shadow-sm hover:border-primary/30 hover:bg-muted/50 transition-all active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-xl bg-muted group-hover:bg-primary group-hover:text-primary-foreground flex items-center justify-center mb-3 transition-colors">
                <action.icon className="w-5 h-5" />
              </div>
              <span className="text-sm font-semibold uppercase tracking-wider text-center">{action.label}</span>
            </button>
          ))}
          <button type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="flex flex-col items-center justify-center p-6 bg-muted/30 border border-dashed border-border/50 rounded-2xl hover:bg-muted/50 transition-all opacity-60 hover:opacity-100"
            aria-label="Buscar más acciones"
          >
            <div className="w-12 h-12 rounded-xl border-2 border-dashed border-border flex items-center justify-center mb-3">
              <Plus className="w-5 h-5 text-muted-foreground" />
            </div>
            <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Más...</span>
          </button>
        </div>
      </section>

      {/* Two Column Layout: Recents & Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Actions */}
        <section className="lg:col-span-1 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 px-2">
                <History className="w-3.5 h-3.5" /> Recientes
            </h2>
            <div className="bg-card border border-border/50 rounded-2xl shadow-sm p-4 space-y-2">
              {recentActions.length > 0 ? recentActions.map(({ action, timestamp }) => (
                <button type="button"
                  key={action.id}
                  onClick={() => handleAction(action)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <action.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{action.label}</div>
                    {/* FIX UX-008: Real relative time instead of hardcoded "Hace un momento" */}
                    <div className="text-sm text-muted-foreground uppercase font-semibold tracking-wider">{formatRelativeTime(timestamp)}</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
                </button>
              )) : (
                <div className="py-12 text-center">
                    <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground opacity-70">{t('occ.noActivity')}</p>
                </div>
              )}
            </div>
        </section>

        {/* Resumen Ejecutivo */}
        <section className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between px-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                   Resumen Ejecutivo
                </h2>
                <button type="button"
                  onClick={() => setCurrentView('dashboard')}
                  className="text-sm font-semibold uppercase tracking-wider text-primary hover:underline flex items-center gap-1.5"
                >
                  Ver Análisis <BarChart3 className="w-3 h-3" />
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stats.map((stat, idx) => (
                    <div key={idx} className="bg-card border border-border/50 rounded-2xl shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className={cn("p-2.5 rounded-xl bg-muted", stat.color)}>
                                <stat.icon className="w-4 h-4" />
                            </div>
                            <div className={cn(
                                "flex items-center gap-1 text-xs font-semibold uppercase tracking-wider",
                                stat.up ? "text-primary" : stat.up === false && stat.label === 'Margen Operativo' ? "text-warning" : "text-destructive"
                            )}>
                                {stat.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {stat.trend}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</div>
                            {/* FIX UX-009: tabular-nums for financial figures */}
                            <div className="text-2xl font-bold font-display tracking-tight tabular-nums">{isLoading ? '...' : stat.value}</div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
      </div>
    </div>
  );
}
