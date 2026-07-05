'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot, Send, Loader2, AlertTriangle, ShieldCheck, ShieldAlert,
  TrendingUp, Activity, Brain, Zap, Scale, Sparkles, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { AdvancedAnalysis, IntelligencePlay, BettingConfig, Pick3Result } from '@/types/pick3';
import { ModelValidationResult } from '@/services/pick3/backtest.engine';
import { Pick3Profile } from '@/types/pick3';

interface Pick3AIAdvisorProps {
  history: Pick3Result[];
  analysis: AdvancedAnalysis | null;
  plays: IntelligencePlay[];
  config: BettingConfig;
  simResult: ModelValidationResult | null;
  profile?: Pick3Profile | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    riskMode?: string;
    riskLevel?: string;
    shouldStop?: boolean;
    ensembleConfidence?: number;
    isRandom?: boolean;
    driftDetected?: boolean;
    isOverfitting?: boolean;
    modelsUsed?: number;
    regimeAlert?: string;
  };
}

type RiskMode = 'defensive' | 'balanced' | 'aggressive';

export default function Pick3AIAdvisor({
  history, analysis, plays, config, simResult, profile
}: Pick3AIAdvisorProps) {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [riskMode, setRiskMode] = useState<RiskMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('pick3-risk-mode') as RiskMode) || 'balanced';
    }
    return 'balanced';
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persistir riskMode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pick3-risk-mode', riskMode);
    }
  }, [riskMode]);

  // Contexto simple para mostrar badges
  const backtest = simResult;
  const ensembleConfidence = plays[0]?.confidence || 0;
  const isRandom = backtest?.statisticalTests?.isRandom ?? false;
  const driftDetected = backtest?.regimeChange?.driftDetected ?? false;
  const isOverfitting = backtest?.isOverfitting ?? false;
  const bankroll = profile ? profile.current_bankroll / 100 : 1000;

  const sendInitialContext = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pick3/advisor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Hola Darian-Quant. Dame un análisis general del estado actual: ¿hay edge estadístico?, ¿detectaste drift?, ¿qué modo de riesgo recomiendas para mi bankroll actual? Sé conciso.' }
          ],
          riskMode,
          bankroll,
          config,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error en el asesor');
      }
      const data = await res.json();
      const assistantMsg = data.text || 'Lo siento, no pude generar un análisis en este momento.';

      setMessages([{
        role: 'assistant',
        content: assistantMsg,
        metadata: data.metadata,
      }]);
    } catch (err) {
      setMessages([{
        role: 'assistant',
        content: `⚠️ **Error:** ${err instanceof Error ? err.message : 'No se pudo conectar con el asesor.'}\n\nVerifica que:\n- Hay al menos 30 sorteos en el histórico\n- El servidor tiene API Key de Gemini configurada\n- Tu sesión está activa`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    sendInitialContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskMode]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/pick3/advisor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify({
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMsg },
          ],
          riskMode,
          bankroll,
          config,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error');
      }
      const data = await res.json();
      const assistantMsg = data.text || 'Lo siento, no pude procesar tu mensaje.';

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: assistantMsg,
        metadata: data.metadata,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ **Error:** ${err instanceof Error ? err.message : 'No se pudo conectar con el asesor.'}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    '¿Hay edge estadístico real o es ruido?',
    '¿Qué combinaciones jugar hoy y por qué?',
    'Analiza las rachas (win/loss streak)',
    '¿Detectaste drift en el régimen?',
    '¿Cuánto debería apostar según Kelly?',
    'Explica el Profit Factor y Recovery Factor',
  ];

  // === Status badges ===
  const renderStatusBadges = (metadata?: ChatMessage['metadata']) => {
    if (!metadata) return null;
    const badges: React.ReactNode[] = [];

    if (metadata.isRandom) {
      badges.push(
        <Badge key="random" variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-[9px] font-black uppercase">
          <ShieldCheck className="w-3 h-3 mr-1" /> Azar confirmado
        </Badge>
      );
    } else {
      badges.push(
        <Badge key="edge" variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[9px] font-black uppercase">
          <ShieldAlert className="w-3 h-3 mr-1" /> Edge potencial
        </Badge>
      );
    }

    if (metadata.driftDetected) {
      badges.push(
        <Badge key="drift" variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30 text-[9px] font-black uppercase">
          <Activity className="w-3 h-3 mr-1" /> Drift detectado
        </Badge>
      );
    }

    if (metadata.isOverfitting) {
      badges.push(
        <Badge key="overfit" variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 text-[9px] font-black uppercase">
          <AlertTriangle className="w-3 h-3 mr-1" /> Overfitting
        </Badge>
      );
    }

    if (metadata.shouldStop) {
      badges.push(
        <Badge key="stop" variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 text-[9px] font-black uppercase">
          <AlertTriangle className="w-3 h-3 mr-1" /> Stop-loss
        </Badge>
      );
    }

    if (metadata.riskLevel) {
      const colors: Record<string, string> = {
        low: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
        medium: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
        high: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
        critical: 'bg-red-500/10 text-red-600 border-red-500/30',
      };
      badges.push(
        <Badge key="risk" variant="outline" className={cn("text-[9px] font-black uppercase", colors[metadata.riskLevel])}>
          <ShieldAlert className="w-3 h-3 mr-1" /> Riesgo: {metadata.riskLevel}
        </Badge>
      );
    }

    if (metadata.modelsUsed !== undefined) {
      badges.push(
        <Badge key="models" variant="outline" className="bg-muted/30 text-foreground border-border/30 text-[9px] font-black uppercase">
          <Brain className="w-3 h-3 mr-1" /> {metadata.modelsUsed}/4 modelos
        </Badge>
      );
    }

    return badges.length > 0 ? (
      <div className="flex flex-wrap gap-1 mt-2">{badges}</div>
    ) : null;
  };

  const renderMarkdown = (content: string) => {
    // Renderizado simple de markdown: headings, bold, listas
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('### ')) {
        return <p key={i} className="text-xs font-black uppercase tracking-widest text-primary mt-3 mb-1">{line.replace('### ', '')}</p>;
      }
      if (line.startsWith('## ')) {
        return <p key={i} className="text-sm font-black uppercase tracking-wider mt-3 mb-1">{line.replace('## ', '')}</p>;
      }
      if (line.startsWith('- ')) {
        return <p key={i} className="text-sm pl-3 mb-0.5 opacity-90">• {line.replace('- ', '')}</p>;
      }
      if (line.startsWith('❌') || line.startsWith('✅') || line.startsWith('⚠️') || line.startsWith('📊') || line.startsWith('🎯') || line.startsWith('💡')) {
        return <p key={i} className="text-sm mt-1.5 opacity-90">{line}</p>;
      }
      // Bold inline
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className="text-sm mb-1 opacity-90 leading-relaxed">
          {parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={j} className="font-black">{part.slice(2, -2)}</strong>;
            }
            return part;
          })}
        </p>
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* === Header con selector de modo === */}
      <Card className="rounded-[28px] border-border/50 overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Darian-Quant — Senior Quant Analyst
            </CardTitle>
            <div className="flex items-center gap-1.5 bg-background/50 p-1 rounded-full border border-border/30">
              {(['defensive', 'balanced', 'aggressive'] as RiskMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setRiskMode(mode)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all",
                    riskMode === mode
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {mode === 'defensive' && <ShieldCheck className="w-3 h-3 inline mr-1" />}
                  {mode === 'balanced' && <Scale className="w-3 h-3 inline mr-1" />}
                  {mode === 'aggressive' && <Zap className="w-3 h-3 inline mr-1" />}
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        {/* === Contexto rápido === */}
        <div className="px-4 py-2.5 border-b border-border/30 flex flex-wrap items-center gap-2 bg-muted/5">
          <span className="text-[9px] font-black uppercase opacity-60">Estado actual:</span>
          <Badge variant="outline" className={cn(
            "text-[9px] font-black uppercase",
            isRandom
              ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
              : "bg-amber-500/10 text-amber-600 border-amber-500/30"
          )}>
            {isRandom ? <ShieldCheck className="w-3 h-3 mr-1" /> : <ShieldAlert className="w-3 h-3 mr-1" />}
            {isRandom ? 'Azar' : 'Edge'}
          </Badge>
          {driftDetected && (
            <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30 text-[9px] font-black uppercase">
              <Activity className="w-3 h-3 mr-1" /> Drift
            </Badge>
          )}
          {isOverfitting && (
            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 text-[9px] font-black uppercase">
              <AlertTriangle className="w-3 h-3 mr-1" /> Overfit
            </Badge>
          )}
          <Badge variant="outline" className="bg-muted/30 text-foreground border-border/30 text-[9px] font-black uppercase">
            <Brain className="w-3 h-3 mr-1" /> Conf: {ensembleConfidence.toFixed(0)}%
          </Badge>
          <Badge variant="outline" className="bg-muted/30 text-foreground border-border/30 text-[9px] font-black uppercase">
            <TrendingUp className="w-3 h-3 mr-1" /> {history.length} sorteos
          </Badge>
        </div>

        <CardContent className="p-0">
          {/* === Chat messages === */}
          <div ref={scrollRef} className="h-[450px] sm:h-[520px] overflow-y-auto p-4 space-y-4">
            {loading && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Ejecutando análisis cuantitativo...
                </p>
                <p className="text-[10px] text-muted-foreground/70 max-w-xs text-center">
                  Calculando 4 tests estadísticos, ensemble de 4 modelos, backtest y recomendación de riesgo
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex gap-3',
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  )}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                    msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-gradient-to-br from-primary/80 to-primary/60 text-primary-foreground'
                  )}>
                    {msg.role === 'user' ? (
                      <span className="text-[10px] font-black">{user?.fullName?.[0] || 'U'}</span>
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div className={cn(
                    'flex-1 min-w-0 rounded-2xl p-3',
                    msg.role === 'user'
                      ? 'bg-primary/10 text-foreground'
                      : 'bg-muted/50 text-foreground'
                  )}>
                    {msg.role === 'assistant' ? (
                      <div className="space-y-0.5">
                        {renderMarkdown(msg.content)}
                        {renderStatusBadges(msg.metadata)}
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && messages.length > 0 && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/80 to-primary/60 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-muted/50 rounded-2xl p-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs text-muted-foreground">Analizando datos cuantitativos...</span>
                </div>
              </div>
            )}
          </div>

          {/* === Quick questions === */}
          {messages.length > 0 && (
            <div className="px-4 py-2 border-t border-border/30 flex flex-wrap gap-1.5">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(q); }}
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-muted/40 hover:bg-primary/10 hover:text-primary border border-border/40 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* === Input === */}
          <div className="p-4 border-t border-border/50 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Pregunta a Darian-Quant sobre tu estrategia..."
              className="flex-1 h-11 px-4 rounded-xl bg-muted/30 border border-border/40 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary/30 outline-none"
              disabled={loading}
            />
            <Button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="h-11 px-4 rounded-xl shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* === Disclaimer === */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">
          <strong className="text-amber-600">Darian-Quant</strong> es un sistema de análisis estadístico educativo basado en datos reales del módulo. Las loterías son juegos de azar con expected value negativo: ningún método garantiza ganancias. El asesor recomienda prudencia estadística y gestión de bankroll, no predicciones. Juega responsablemente.
        </p>
      </div>
    </div>
  );
}
