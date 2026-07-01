'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageCircle, Users, Send, ShieldAlert, ShieldCheck, ShieldX, Phone, Bot, Activity, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Metrics {
  messagesToday: number;
  incomingToday: number;
  outgoingToday: number;
  activeConversations: number;
  invitationsToday: number;
  totalContacts: number;
  riskLevel: string;
  cooldownUntil: string | null;
  connectionStatus: string;
  phoneNumber?: string;
  invitationsByStatus: Record<string, number>;
  dailyStats: Array<{ date: string; incoming: number; outgoing: number }>;
}

export default function WhatsAppDashboardView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [testMessage, setTestMessage] = useState('');
  const [testResponse, setTestResponse] = useState<{ text: string; tokens: number; time: number } | null>(null);
  const [testing, setTesting] = useState(false);

  const loadMetrics = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/whatsapp/metrics?store_id=${storeId}`);
      const json = await res.json();
      if (json.data) setMetrics(json.data);
    } catch {}
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 15000);
    return () => clearInterval(interval);
  }, [loadMetrics]);

  const handleTestBot = async () => {
    if (!testMessage.trim() || !storeId) return;
    setTesting(true);
    setTestResponse(null);
    try {
      const res = await fetch('/api/whatsapp/test-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, message: testMessage }),
      });
      const json = await res.json();
      if (json.data) {
        setTestResponse({
          text: json.data.text,
          tokens: json.data.tokensUsed,
          time: json.data.responseTimeMs,
        });
      } else {
        toast.error('Error en el simulador');
      }
    } catch {
      toast.error('Error al probar bot');
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-green-600" />
      </div>
    );
  }

  const riskIcon = metrics?.riskLevel === 'safe' ? <ShieldCheck className="w-4 h-4 text-green-500" /> :
                   metrics?.riskLevel === 'warning' ? <ShieldAlert className="w-4 h-4 text-amber-500" /> :
                   metrics?.riskLevel === 'danger' ? <ShieldAlert className="w-4 h-4 text-orange-500" /> :
                   <ShieldX className="w-4 h-4 text-red-500" />;

  const isConnected = metrics?.connectionStatus === 'connected';

  return (
    <div className="space-y-4 p-4 max-w-4xl w-full mx-auto overflow-y-auto h-full pb-[env(safe-area-inset-bottom)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight">Dashboard WhatsApp</h2>
            <p className="text-xs text-muted-foreground">Métricas en tiempo real</p>
          </div>
        </div>
        <Badge className={cn('text-xs', isConnected ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground')}>
          {isConnected ? '● Conectado' : '○ Desconectado'}
        </Badge>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <Card>
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Mensajes Hoy</span>
            </div>
            <p className="text-lg sm:text-xl font-black">{metrics?.messagesToday || 0}</p>
            <p className="text-[9px] text-muted-foreground">
              ↓{metrics?.incomingToday || 0} entrantes · ↑{metrics?.outgoingToday || 0} salientes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Conversaciones</span>
            </div>
            <p className="text-lg sm:text-xl font-black">{metrics?.activeConversations || 0}</p>
            <p className="text-[9px] text-muted-foreground">{metrics?.totalContacts || 0} contactos totales</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2 mb-1">
              <Send className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Invitaciones</span>
            </div>
            <p className="text-lg sm:text-xl font-black">{metrics?.invitationsToday || 0}/20</p>
            <p className="text-[9px] text-muted-foreground">hoy</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-2 mb-1">
              {riskIcon}
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Riesgo</span>
            </div>
            <p className="text-lg sm:text-xl font-black capitalize">{metrics?.riskLevel || 'safe'}</p>
            {metrics?.cooldownUntil && (
              <p className="text-[9px] text-amber-600">Pausa hasta {new Date(metrics.cooldownUntil).toLocaleDateString('es-CU')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily chart (simple bars) */}
      {metrics?.dailyStats && metrics.dailyStats.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <h3 className="text-xs font-black uppercase">Mensajes últimos 7 días</h3>
            </div>
            <div className="flex items-end gap-2 h-28 sm:h-32">
              {metrics.dailyStats.map(day => {
                const total = day.incoming + day.outgoing;
                const maxTotal = Math.max(...metrics.dailyStats.map(d => d.incoming + d.outgoing), 1);
                const heightPct = (total / maxTotal) * 100;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                      <div
                        className="w-full bg-green-500/70 rounded-t-sm transition-all"
                        style={{ height: `${(day.outgoing / Math.max(total, 1)) * heightPct}%` }}
                        title={`Salientes: ${day.outgoing}`}
                      />
                      <div
                        className="w-full bg-blue-500/70 rounded-b-sm transition-all"
                        style={{ height: `${(day.incoming / Math.max(total, 1)) * heightPct}%` }}
                        title={`Entrantes: ${day.incoming}`}
                      />
                    </div>
                    <span className="text-[8px] text-muted-foreground">
                      {new Date(day.date).toLocaleDateString('es-CU', { weekday: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-blue-500/70" />
                <span className="text-[9px] text-muted-foreground">Entrantes</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-green-500/70" />
                <span className="text-[9px] text-muted-foreground">Salientes</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bot simulator */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-green-600" />
            <h3 className="text-xs font-black uppercase">Simulador de Bot</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Prueba el bot sin enviar mensajes reales por WhatsApp. Usa la configuración GLM de la tienda.
          </p>
          <div className="flex gap-2">
            <Input
              value={testMessage}
              onChange={e => setTestMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTestBot()}
              placeholder="Escribe un mensaje de prueba…"
              className="text-xs h-11"
              disabled={testing}
            />
            <Button onClick={handleTestBot} disabled={testing || !testMessage.trim()} size="sm" className="bg-green-600 hover:bg-green-700 text-white min-h-[44px]">
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </Button>
          </div>
          {testResponse && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="ml-auto max-w-[75%] rounded-xl px-3 py-2 bg-green-600 text-white text-xs rounded-br-sm">
                {testResponse.text}
              </div>
              <p className="text-[9px] text-muted-foreground text-right">
                {testResponse.tokens} tokens · {testResponse.time}ms
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invitations summary */}
      {metrics?.invitationsByStatus && Object.keys(metrics.invitationsByStatus).length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-xs font-black uppercase mb-2">Invitaciones por estado</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metrics.invitationsByStatus).map(([status, count]) => (
                <Badge key={status} variant="secondary" className="text-[10px]">
                  {status}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
