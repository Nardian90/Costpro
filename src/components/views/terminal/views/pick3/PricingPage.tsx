'use client';

import React, { useState, useEffect } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, TrendingUp, Brain, Building2, Check, X, Loader2,
  Crown, Zap, ShieldCheck, AlertCircle, Calendar, CreditCard
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import {
  TIERS, TIER_ORDER, SubscriptionTier, TierInfo,
  Subscription, UsageRecord, UsageCheckResult
} from '@/services/pick3/subscription.types';

interface PricingPageProps {
  compact?: boolean;
  onSuccess?: () => void;
}

export function PricingPage({ compact = false, onSuccess }: PricingPageProps) {
  const { user } = useAuthStore();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pick3/subscription', {
        headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
        setUsage(data.usage);
      }
    } catch (err) {
      console.error('Error loading subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (tier: SubscriptionTier) => {
    if (!user) return;
    setActionLoading(tier);
    try {
      const tierInfo = TIERS[tier];
      let endpoint = '/api/pick3/subscription';
      let body: any;

      if (tier === 'free') {
        // Free no requiere action, solo downgrade directo
        body = { action: 'change_tier', tier: 'free', mode: billingCycle };
      } else if (tierInfo.priceMonthly === 0) {
        body = { action: 'change_tier', tier, mode: billingCycle };
      } else {
        // Tier pago: iniciar trial si no ha tenido, sino checkout
        const hadTrial = subscription?.metadata?.had_trial;
        if (!hadTrial) {
          body = { action: 'start_trial', tier };
        } else {
          body = { action: 'change_tier', tier, mode: billingCycle };
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Error al procesar la acción');
        return;
      }

      if (data.session?.url) {
        // Redirect a checkout (demo o Stripe)
        if (data.session.status === 'complete') {
          toast.success(`¡Bienvenido a ${TIERS[tier].name}! Tu suscripción está activa.`);
          await loadData();
          onSuccess?.();
        } else {
          window.location.href = data.session.url;
        }
      } else if (data.subscription) {
        toast.success(`Trial de 14 días iniciado para ${TIERS[tier].name}`);
        await loadData();
        onSuccess?.();
      } else if (data.message) {
        toast.success(data.message);
        await loadData();
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    setActionLoading('cancel');
    try {
      const res = await fetch('/api/pick3/subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Suscripción cancelada');
        await loadData();
      } else {
        toast.error(data.error || 'Error al cancelar');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async () => {
    setActionLoading('reactivate');
    try {
      const res = await fetch('/api/pick3/subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify({ action: 'reactivate' }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Suscripción reactivada');
        await loadData();
      } else {
        toast.error(data.error || 'Error al reactivar');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const currentTier = subscription?.tier || 'free';
  const isTrial = subscription?.status === 'trialing';
  const isCanceled = subscription?.cancel_at_period_end;

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Sparkles': return <Sparkles className="w-5 h-5" />;
      case 'TrendingUp': return <TrendingUp className="w-5 h-5" />;
      case 'Brain': return <Brain className="w-5 h-5" />;
      case 'Building2': return <Building2 className="w-5 h-5" />;
      default: return <Sparkles className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* === Estado actual === */}
      {subscription && (
        <Card className="rounded-[24px] border-2 border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: TIERS[currentTier].color }}
                >
                  {getIcon(TIERS[currentTier].icon)}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase opacity-60">Tu plan actual</p>
                  <p className="text-lg font-black italic uppercase tracking-tight">
                    {TIERS[currentTier].name}
                    {isTrial && (
                      <Badge className="ml-2 bg-amber-500/20 text-amber-600 border-amber-500/30 text-[9px] uppercase">
                        <Calendar className="w-3 h-3 mr-1" /> Trial
                      </Badge>
                    )}
                  </p>
                  {isTrial && subscription.trial_end && (
                    <p className="text-[10px] opacity-70">
                      {Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} días restantes de trial
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {usage && (
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase opacity-60">Consultas IA este mes</p>
                    <p className="text-sm font-black italic">
                      {usage.ai_queries_count} / {TIERS[currentTier].limits.aiQueriesPerMonth === -1 ? '∞' : TIERS[currentTier].limits.aiQueriesPerMonth}
                    </p>
                  </div>
                )}
                {isCanceled ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReactivate}
                    disabled={actionLoading === 'reactivate'}
                    className="rounded-full"
                  >
                    {actionLoading === 'reactivate' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reactivar'}
                  </Button>
                ) : currentTier !== 'free' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={actionLoading === 'cancel'}
                    className="rounded-full text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    {actionLoading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancelar'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* === Toggle mensual/anual === */}
      <div className="flex items-center justify-center gap-2">
        <span className={cn("text-xs font-black uppercase", billingCycle === 'monthly' ? 'text-primary' : 'opacity-50')}>
          Mensual
        </span>
        <button
          onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
          className={cn(
            "relative w-12 h-6 rounded-full transition-colors",
            billingCycle === 'yearly' ? 'bg-primary' : 'bg-muted'
          )}
        >
          <div className={cn(
            "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
            billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-0.5'
          )} />
        </button>
        <span className={cn("text-xs font-black uppercase", billingCycle === 'yearly' ? 'text-primary' : 'opacity-50')}>
          Anual
        </span>
        <Badge className="ml-2 bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-[9px] uppercase">
          -20%
        </Badge>
      </div>

      {/* === Grid de tiers === */}
      <div className={cn(
        "grid gap-4",
        compact ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
      )}>
        {TIER_ORDER.map((tierId) => {
          const tier = TIERS[tierId];
          const isCurrent = currentTier === tierId;
          const isHigher = TIER_ORDER.indexOf(tierId) > TIER_ORDER.indexOf(currentTier);
          const price = billingCycle === 'monthly' ? tier.priceMonthly : Math.round(tier.priceYearly / 12);

          return (
            <Card
              key={tierId}
              className={cn(
                "rounded-[24px] border-2 transition-all relative overflow-hidden",
                tier.highlight && "border-primary shadow-xl scale-105",
                isCurrent && "border-primary bg-primary/5",
                !tier.highlight && !isCurrent && "border-border/50"
              )}
            >
              {tier.highlight && (
                <div className="absolute top-0 left-0 right-0 bg-primary text-primary-foreground text-center py-1">
                  <p className="text-[9px] font-black uppercase tracking-widest">⭐ Más Popular</p>
                </div>
              )}
              <CardHeader className={cn("space-y-2", tier.highlight && "pt-8")}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: tier.color }}
                  >
                    {getIcon(tier.icon)}
                  </div>
                  <div>
                    <CardTitle className="text-base font-black uppercase tracking-tight">{tier.name}</CardTitle>
                    <p className="text-[9px] opacity-60 uppercase">{tier.target}</p>
                  </div>
                </div>
                <CardDescription className="text-[10px] leading-relaxed">{tier.tagline}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Precio */}
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black italic">${price}</span>
                    <span className="text-[10px] opacity-60">/mes</span>
                  </div>
                  {billingCycle === 'yearly' && tier.priceMonthly > 0 && (
                    <p className="text-[9px] text-emerald-600 font-bold mt-0.5">
                      Ahorras ${tier.priceMonthly * 12 - tier.priceYearly}/año
                    </p>
                  )}
                </div>

                {/* CTA */}
                {isCurrent ? (
                  <Button disabled className="w-full rounded-full" variant="outline">
                    <Check className="w-4 h-4 mr-1" /> Plan actual
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleAction(tierId)}
                    disabled={actionLoading === tierId}
                    className={cn(
                      "w-full rounded-full font-black uppercase text-xs",
                      tier.highlight && "shadow-lg"
                    )}
                    variant={tier.highlight ? 'default' : 'outline'}
                  >
                    {actionLoading === tierId ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isHigher ? (
                      tier.id === 'free' ? 'Bajar a Free' : (
                        <>
                          <Zap className="w-4 h-4 mr-1" /> {tier.cta}
                        </>
                      )
                    ) : (
                      tier.cta
                    )}
                  </Button>
                )}

                {/* Features */}
                <ul className="space-y-1.5">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[10px] leading-relaxed">
                      <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="opacity-80">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Límites destacados */}
                <div className="pt-2 border-t border-border/30 space-y-1">
                  <div className="flex justify-between text-[9px]">
                    <span className="opacity-60">Consultas IA/mes</span>
                    <span className="font-black">
                      {tier.limits.aiQueriesPerMonth === -1 ? 'Ilimitadas' : tier.limits.aiQueriesPerMonth}
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="opacity-60">Backtest días</span>
                    <span className="font-black">
                      {tier.limits.backtestMaxDays === -1 ? 'Ilimitado' : tier.limits.backtestMaxDays}
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="opacity-60">Loterías</span>
                    <span className="font-black">
                      {tier.limits.maxLotteries === -1 ? 'Ilimitadas' : tier.limits.maxLotteries}
                    </span>
                  </div>
                  {tier.limits.apiAccess && (
                    <div className="flex justify-between text-[9px]">
                      <span className="opacity-60">API access</span>
                      <span className="font-black text-emerald-500">✓</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* === Trial banner === */}
      {currentTier === 'free' && (
        <Card className="rounded-[24px] border-2 border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <Crown className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-black uppercase tracking-tight">14 días gratis</p>
              <p className="text-[11px] opacity-70 leading-relaxed">
                Prueba Player o Quant sin costo por 14 días. Sin tarjeta de crédito requerida.
                Al final del trial, vuelves automáticamente a Free.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* === FAQ === */}
      {!compact && (
        <Card className="rounded-[24px] border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest">Preguntas frecuentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[11px] leading-relaxed">
            <div>
              <p className="font-black uppercase text-[10px] mb-1">¿Puedo cancelar cuando quiera?</p>
              <p className="opacity-70">Sí. Cancela con un click. Tu suscripción sigue activa hasta el final del período pagado, luego vuelves a Free automáticamente.</p>
            </div>
            <div>
              <p className="font-black uppercase text-[10px] mb-1">¿Qué pasa con mis datos si cancelo?</p>
              <p className="opacity-70">Todos tus datos (histórico, configuraciones, backtests) se conservan. Solo se restringen las funciones premium.</p>
            </div>
            <div>
              <p className="font-black uppercase text-[10px] mb-1">¿El trial requiere tarjeta?</p>
              <p className="opacity-70">No. El trial de 14 días es completamente gratis y sin tarjeta. Al final vuelves a Free automáticamente.</p>
            </div>
            <div>
              <p className="font-black uppercase text-[10px] mb-1">¿Las predicciones garantizan ganancias?</p>
              <p className="opacity-70">No. Las loterías son juegos de azar con expected value negativo. CostPro Gestor de Riesgo proporciona análisis estadístico y gestión de bankroll, NO predicciones garantizadas.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
