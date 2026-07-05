'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Gift, Users, Copy, Check, Share2, TrendingUp, DollarSign,
  Award, Loader2, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';

export function ReferralPage() {
  const { user } = useAuthStore();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralUrl, setReferralUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pick3/referral', {
        headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReferralCode(data.referralCode);
        setReferralUrl(data.referralUrl);
        setStats(data.stats);
        setReferrals(data.referrals || []);
      }
    } catch (err) {
      console.error('Error loading referral data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      toast.success('Enlace copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('No se pudo copiar el enlace');
    }
  };

  const handleShare = async () => {
    if (!referralUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CostPro Pick 3 Intelligence',
          text: 'Únete a CostPro Pick 3 Intelligence — análisis estadístico real, sin promesas falsas.',
          url: referralUrl,
        });
      } catch (err) {
        // User cancelled
      }
    } else {
      handleCopy();
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
      {/* Header */}
      <Card className="rounded-[28px] border-2 border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Gift className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-black italic uppercase tracking-tight">Programa de Referidos</h2>
            <p className="text-xs opacity-70 leading-relaxed mt-1">
              Invita a tus amigos a CostPro Pick 3 Intelligence. Cuando se suscriban a un plan pago,
              ambos reciben <strong className="text-primary">1 mes gratis del plan Player</strong> (valor $19).
            </p>
          </div>
        </div>
      </Card>

      {/* Referral code + URL */}
      <Card className="rounded-[24px] border-border/50 p-6 space-y-4">
        <div>
          <p className="text-[10px] font-black uppercase opacity-60 mb-1">Tu código de referido</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 px-4 py-3 rounded-xl bg-muted/30 border border-border/30">
              <p className="text-2xl font-black italic tracking-wider text-primary">{referralCode || '—'}</p>
            </div>
            <Button
              onClick={handleCopy}
              className="rounded-xl h-12 px-4"
              variant="outline"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase opacity-60 mb-1">Tu enlace de referido</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 px-4 py-3 rounded-xl bg-muted/30 border border-border/30 overflow-hidden">
              <p className="text-xs font-mono truncate">{referralUrl || '—'}</p>
            </div>
            <Button
              onClick={handleShare}
              className="rounded-xl h-12 px-4"
            >
              <Share2 className="w-4 h-4 mr-1" /> Compartir
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="rounded-[20px] p-4 space-y-1">
            <Users className="w-5 h-5 text-primary" />
            <p className="text-[9px] font-black uppercase opacity-60">Total referidos</p>
            <p className="text-2xl font-black italic">{stats.total_referrals}</p>
          </Card>
          <Card className="rounded-[20px] p-4 space-y-1">
            <Check className="w-5 h-5 text-emerald-500" />
            <p className="text-[9px] font-black uppercase opacity-60">Convertidos</p>
            <p className="text-2xl font-black italic">{stats.converted}</p>
          </Card>
          <Card className="rounded-[20px] p-4 space-y-1">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <p className="text-[9px] font-black uppercase opacity-60">Conversión</p>
            <p className="text-2xl font-black italic">{stats.conversion_rate.toFixed(0)}%</p>
          </Card>
          <Card className="rounded-[20px] p-4 space-y-1">
            <DollarSign className="w-5 h-5 text-amber-500" />
            <p className="text-[9px] font-black uppercase opacity-60">Premios ganados</p>
            <p className="text-2xl font-black italic text-amber-500">${stats.total_rewards_value_usd}</p>
          </Card>
        </div>
      )}

      {/* How it works */}
      <Card className="rounded-[24px] border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" /> Cómo funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] font-black text-primary">1</span>
            </div>
            <div>
              <p className="text-xs font-black uppercase">Comparte tu enlace</p>
              <p className="text-[10px] opacity-70 leading-relaxed">Envía tu código a amigos interesados en análisis estadístico de lotería.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] font-black text-primary">2</span>
            </div>
            <div>
              <p className="text-xs font-black uppercase">Tu amigo se registra</p>
              <p className="text-[10px] opacity-70 leading-relaxed">Recibe 30 días extra de trial (44 días en total) al usar tu código.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] font-black text-primary">3</span>
            </div>
            <div>
              <p className="text-xs font-black uppercase">Tu amigo se suscribe</p>
              <p className="text-[10px] opacity-70 leading-relaxed">Cuando pase a un plan pago (Player, Quant o Desk), ambos reciben 1 mes gratis de Player ($19 valor).</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent referrals list */}
      {referrals.length > 0 && (
        <Card className="rounded-[24px] border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest">Tus referidos recientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {referrals.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                  <div>
                    <p className="text-xs font-black">
                      {r.referred_user_id ? 'Usuario registrado' : 'Pendiente de registro'}
                    </p>
                    <p className="text-[9px] opacity-50">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] font-black uppercase",
                      r.status === 'rewarded' && "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
                      r.status === 'converted' && "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
                      r.status === 'registered' && "bg-blue-500/20 text-blue-600 border-blue-500/30",
                      r.status === 'pending' && "bg-amber-500/20 text-amber-600 border-amber-500/30",
                      r.status === 'expired' && "bg-red-500/20 text-red-600 border-red-500/30",
                    )}
                  >
                    {r.status === 'rewarded' && <Gift className="w-3 h-3 mr-1" />}
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
        <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[10px] opacity-70 leading-relaxed">
          Las recompensas se aplican automáticamente. El mes gratis de Player se activa cuando tu referido complete su primer pago. Máximo 12 recompensas por año por usuario.
        </p>
      </div>
    </div>
  );
}
