'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Send, Loader2, Sparkles, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { AdvancedAnalysis, IntelligencePlay, BettingConfig, Pick3Result } from '@/types/pick3';
import { ModelValidationResult } from '@/services/pick3/backtest.engine';

interface Pick3AIAdvisorProps {
  history: Pick3Result[];
  analysis: AdvancedAnalysis | null;
  plays: IntelligencePlay[];
  config: BettingConfig;
  simResult: ModelValidationResult | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function Pick3AIAdvisor({ history, analysis, plays, config, simResult }: Pick3AIAdvisorProps) {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Contexto que se envía al modelo de IA
  const buildContext = () => {
    const recentResults = history.slice(0, 20).map(r => ({
      date: r.date,
      time: r.draw_time,
      result: r.result.join('-'),
    }));

    const topPlays = plays.slice(0, 5).map(p => ({
      combination: p.combination.join(''),
      score: p.score?.toFixed(1),
      strategy: p.strategyLabel,
    }));

    const sim = simResult ? {
      roi: simResult.roi.toFixed(1) + '%',
      hitRate: simResult.hitRate.toFixed(1) + '%',
      finalCapital: '$' + simResult.finalCapital.toFixed(0),
      maxDrawdown: simResult.maxDrawdown.toFixed(1) + '%',
      totalWins: simResult.totalWins,
      totalBets: simResult.totalBets,
    } : null;

    return {
      totalSorteos: history.length,
      ultimos20Sorteos: recentResults,
      topPredicciones: topPlays,
      configuracion: {
        modo: config.mode,
        payout: config.payout,
        riesgo: config.riskFactor + '%',
        maxCombinaciones: config.maxCombinations,
      },
      simulacion: sim,
    };
  };

  const sendInitialContext = async () => {
    setLoading(true);
    try {
      const context = buildContext();
      const systemPrompt = `Eres un asesor experto en lotería Pick 3 de Florida, especializado en análisis estadístico y gestión de bankroll. Tienes acceso a los datos del módulo Pick 3 Intelligence de CostPro. Tu rol es:

1. Analizar los datos estadísticos del histórico de sorteos
2. Explicar las predicciones generadas por el motor estadístico
3. Dar consejos sobre gestión de bankroll y riesgo
4. Responder preguntas sobre patrones, frecuencias y estrategias
5. Aclarar que las loterías son juegos de azar y NADA garantiza ganancias

Datos del módulo:
${JSON.stringify(context, null, 2)}

Responde en español, de forma clara y concisa. Usa formato markdown cuando sea útil. Sé honesto sobre las limitaciones estadísticas de predecir loterías.`;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Hola, dame un análisis general del estado actual de los datos y qué significan las predicciones.' }
          ],
          storeId: user?.activeStoreId,
        }),
      });

      if (!res.ok) throw new Error('Error en el asesor IA');
      const data = await res.json();
      const assistantMsg = data.response || data.message || data.choices?.[0]?.message?.content || 'Lo siento, no pude generar un análisis en este momento.';

      setMessages([
        { role: 'assistant', content: assistantMsg },
      ]);
    } catch (err) {
      setMessages([
        { role: 'assistant', content: '⚠️ El asesor IA no está disponible en este momento. Verifica que el servicio de IA esté configurado correctamente.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    sendInitialContext();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const context = buildContext();
      const systemPrompt = `Eres un asesor experto en lotería Pick 3 de Florida. Datos del módulo: ${JSON.stringify(context)}. Responde en español, claro y conciso. Sé honesto sobre las limitaciones de predecir loterías.`;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMsg },
          ],
          storeId: user?.activeStoreId,
        }),
      });

      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      const assistantMsg = data.response || data.message || data.choices?.[0]?.message?.content || 'Lo siento, no pude procesar tu mensaje.';

      setMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Error al conectar con el asesor. Intenta de nuevo.' }]);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    '¿Qué significan las predicciones del Top 3?',
    '¿Cuál es la mejor estrategia de bankroll?',
    'Analiza los patrones de los últimos 20 sorteos',
    '¿Qué tan confiable es el ROI simulado?',
  ];

  return (
    <div className="space-y-4">
      <Card className="rounded-[28px] border-border/50 overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            Asesor IA — Pick 3 Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Chat messages */}
          <div ref={scrollRef} className="h-[400px] sm:h-[500px] overflow-y-auto p-4 space-y-4">
            {loading && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Analizando datos...</p>
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
                    msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  )}>
                    {msg.role === 'user' ? (
                      <span className="text-[10px] font-black">{user?.fullName?.[0] || 'U'}</span>
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div className={cn(
                    'flex-1 min-w-0 rounded-2xl p-3 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary/10 text-foreground'
                      : 'bg-muted/50 text-foreground'
                  )}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            {loading && messages.length > 0 && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-muted/50 rounded-2xl p-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs text-muted-foreground">Pensando...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick questions */}
          {messages.length > 0 && (
            <div className="px-4 py-2 border-t border-border/30 flex flex-wrap gap-2">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(q); }}
                  className="px-3 py-1.5 rounded-full text-[10px] font-bold bg-muted/40 hover:bg-primary/10 hover:text-primary border border-border/40 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-border/50 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Pregunta al asesor sobre Pick 3..."
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

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">
          El asesor IA proporciona análisis educativo basado en datos estadísticos. Las loterías son juegos de azar y ningún método garantiza ganancias. Juega responsablemente.
        </p>
      </div>
    </div>
  );
}
