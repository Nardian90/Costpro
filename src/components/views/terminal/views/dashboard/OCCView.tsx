'use client';

import React, { useMemo } from 'react';
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
  BarChart3
} from 'lucide-react';
import { useUIStore, ViewType } from '@/store';
import { useAuthStore } from '@/store';
import { getActionsForUser, Action } from '@/config/actions';
import { getNavigationRoute } from '@/config/navigation/navigation-map';
import { useDashboardView } from './useDashboardView';
import { useProducts } from '@/hooks/api/useProducts';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function OCCView() {
  const { setCurrentView, setActiveCostSection, setIpvActiveTab } = useUIStore();
  const { user } = useAuthStore();
  const { kpis, isLoading } = useDashboardView();
  const { data: products = [] } = useProducts(user?.activeStoreId);

  const userActions = useMemo(() =>
    getActionsForUser(user?.role || 'user'),
  [user?.role]);

  const quickActions = useMemo(() => userActions.slice(0, 8), [userActions]);

  // Recent actions simulation (would come from localStorage in a real effect)
  const [recentActions, setRecentActions] = React.useState<Action[]>([]);

  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('recent_actions') || '[]');
      const actions = saved
        .map((id: string) => userActions.find(a => a.id === id))
        .filter(Boolean)
        .slice(0, 3);
      setRecentActions(actions);
    } catch {
      // localStorage may be unavailable in some environments
    }
  }, [userActions]);

  const criticalAlerts = useMemo(() =>
    products.filter(p => (p.stock_current ?? 0) <= (p.min_stock ?? 0)).length,
  [products]);

  const stats = useMemo(() => {
    const sales = kpis?.gross_sales || 0;
    const profit = kpis?.profit || 0;
    const margin = sales > 0 ? (profit / sales) * 100 : 0;

    return [
      {
        label: 'Ingresos Totales',
        value: formatCurrency(sales),
        trend: '+12.5%',
        up: true,
        icon: TrendingUp,
        color: 'text-primary'
      },
      {
        label: 'Margen Operativo',
        value: `${margin.toFixed(1)}%`,
        trend: '-0.4%',
        up: false,
        icon: TrendingDown,
        color: 'text-primary'
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

    // Update recents
    try {
      const recent = JSON.parse(localStorage.getItem('recent_actions') || '[]');
      const updated = [action.id, ...recent.filter((id: string) => id !== action.id)].slice(0, 5);
      localStorage.setItem('recent_actions', JSON.stringify(updated));
    } catch {
      // localStorage may be unavailable in some environments
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
            <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-foreground">Centro de Comando Operativo</h1>
        </div>
        <p className="text-sm font-medium text-muted-foreground max-w-2xl">
            Bienvenido, <span className="text-foreground font-semibold">{user?.fullName}</span>. Tienes <span className="text-destructive font-semibold">{criticalAlerts}</span> alertas activas que requieren tu atención inmediata.
        </p>
      </header>

      {/* Command Layer - Clean Search Card */}
      <section>
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="w-full flex items-center px-6 py-4 bg-card border border-border/50 rounded-2xl text-left hover:border-primary/30 hover:bg-muted/50 transition-all active:scale-[0.99]"
        >
          <Search className="w-5 h-5 text-muted-foreground mr-4" />
          <span className="flex-1 text-base font-medium text-muted-foreground/50">Buscar o ejecutar acción...</span>
          <kbd className="hidden sm:flex px-3 py-1.5 bg-muted rounded-xl text-xs font-semibold border border-border/50 items-center gap-2 text-muted-foreground uppercase tracking-wider">
            <Command className="w-3.5 h-3.5" /> K
          </kbd>
        </button>
      </section>

      {/* Quick Actions Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                Acciones Principales
            </h2>
            <div className="h-px flex-1 bg-border/50 mx-6" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              className="group flex flex-col items-center justify-center p-6 bg-card border border-border/50 rounded-2xl shadow-sm hover:border-primary/30 hover:bg-muted/50 transition-all active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-xl bg-muted group-hover:bg-primary group-hover:text-primary-foreground flex items-center justify-center mb-3 transition-colors">
                <action.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-center">{action.label}</span>
            </button>
          ))}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="flex flex-col items-center justify-center p-6 bg-muted/30 border border-dashed border-border/50 rounded-2xl hover:bg-muted/50 transition-all opacity-60 hover:opacity-100"
          >
            <div className="w-12 h-12 rounded-xl border-2 border-dashed border-border flex items-center justify-center mb-3">
              <Plus className="w-5 h-5 text-muted-foreground" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Más...</span>
          </button>
        </div>
      </section>

      {/* Two Column Layout: Recents & Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Actions */}
        <section className="lg:col-span-1 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 px-2">
                <History className="w-3.5 h-3.5" /> Recientes
            </h2>
            <div className="bg-card border border-border/50 rounded-2xl shadow-sm p-4 space-y-2">
              {recentActions.length > 0 ? recentActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleAction(action)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <action.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{action.label}</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Hace un momento</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
                </button>
              )) : (
                <div className="py-12 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground opacity-40">Sin actividad reciente</p>
                </div>
              )}
            </div>
        </section>

        {/* Resumen Ejecutivo */}
        <section className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between px-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                   Resumen Ejecutivo
                </h2>
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline flex items-center gap-1.5"
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
                                "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider",
                                stat.up ? "text-primary" : "text-destructive"
                            )}>
                                {stat.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {stat.trend}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</div>
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
