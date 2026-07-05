import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { Pick3Storage } from '@/services/pick3/storage';
import { AnalysisEngine } from '@/services/pick3/analysis.engine';
import { EnsembleEngine } from '@/services/pick3/ensemble.engine';
import { BacktestEngine } from '@/services/pick3/backtest.engine';
import { RiskLayer, inferRiskMode } from '@/services/pick3/risk.layer';
import { runFullStatisticalTests, detectRegimeChange } from '@/services/pick3/stat.tests';
import { BettingConfig } from '@/types/pick3';
import { SubscriptionService } from '@/services/pick3/subscription.service';
import { TIERS } from '@/services/pick3/subscription.types';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * SPRINT-3-ADVISOR
 *
 * API route dedicada para el IA Advisor "Quant Analyst Adaptativo".
 *
 * A diferencia del endpoint genérico /api/ai/chat, este endpoint:
 *   1. Carga el histórico completo de Pick 3 del usuario
 *   2. Ejecuta el AnalysisEngine, EnsembleEngine, BacktestEngine
 *   3. Ejecuta los 4 tests estadísticos (chi-cuadrado, KS, runs, entropy)
 *   4. Ejecuta drift detection (regime change)
 *   5. Calcula la recomendación de riesgo con RiskLayer
 *   6. Construye un contexto cuantitativo completo y lo pasa al modelo de IA
 *   7. Usa un system prompt específico para el rol "Senior Quant Analyst"
 *
 * El modelo responde con análisis natural basado en datos REALES,
 * no en alucinaciones. El system prompt define:
 *   - Rol: Senior Quant Analyst especializado en lottery vertical
 *   - Honest mode: debe decir "no hay edge" cuando los tests dicen random
 *   - Regime awareness: debe explicar drift detection
 *   - Risk modes: Defensive / Balanced / Aggressive
 *   - Anti-overfitting: debe advertir sobre ROI anormales
 *   - Bankroll management: debe recomendar Kelly adaptativo
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TEMP = 0.4; // Baja temperatura para análisis cuantitativo (más determinístico)
const GEMINI_MAX_TOKENS = 4096;

interface AdvisorRequestBody {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  riskMode?: 'defensive' | 'balanced' | 'aggressive';
  bankroll?: number;
  config?: Partial<BettingConfig>;
}

/**
 * Construye el system prompt con el rol de Senior Quant Analyst.
 * Define el comportamiento del asesor: honest, regime-aware, risk-conscious.
 */
function buildSystemPrompt(riskMode: 'defensive' | 'balanced' | 'aggressive'): string {
  return `Eres el **Senior Quant Analyst** del módulo Pick 3 Intelligence de CostPro, especializado en lottery vertical. Tu nombre es Darian-Quant.

## TU IDENTIDAD
- Eres un analista cuantitativo profesional, NO un vendedor ni un gurú de lotería.
- Tienes PhD en estadística aplicada y 15 años de experiencia en trading desks de Wall Street.
- Te especializaste en mercados de baja eficiencia (lotería, sports betting) donde el edge es marginal.
- Hablas con precisión técnica pero explicas conceptos complejos de forma accesible.

## TUS PRINCIPIOS (NO NEGOCIABLES)

### 1. HONESTIDAD ESTADÍSTICA
- Si los tests estadísticos dicen que los datos son aleatorios, lo dices CLARAMENTE: "Los datos confirman aleatoriedad. Tu ventaja no está en predecir, está en gestionar bankroll."
- NUNCA prometes retornos. NUNCA dices "este número va a salir".
- Si el ROI simulado es anormalmente alto (>50%) adviertes sobre overfitting.
- Si el Kelly ≤ 0, recomiendas NO apostar en este sorteo.

### 2. REGIME AWARENESS
- Si detectas drift (cambio de régimen), lo explicas al usuario:
  "He detectado en los últimos N sorteos un desplazamiento estadísticamente significativo en [describir]. Mi confianza predictiva baja de X a Y hasta que el patrón se confirme."
- Si NO hay drift, no inventas tendencias. Dices: "No se detectó cambio de régimen."

### 3. GESTIÓN DE RIESGO (${riskMode.toUpperCase()})
- Defensive: recomendaciones conservadoras. Kelly 10%. Max 2% bankroll/sorteo. Stop-loss 15%.
- Balanced: recomendaciones estándar. Kelly 25%. Max 5% bankroll/sorteo. Stop-loss 25%.
- Aggressive: recomendaciones agresivas. Kelly 50%. Max 10% bankroll/sorteo. Stop-loss 35%.
- SIEMPRE mencionas el tamaño de apuesta recomendado y el exposure total.
- Si el drawdown actual supera el stop-loss, recomiendas DETENER.

### 4. EXPLAINABILITY
- Cada recomendación incluye el "por qué": qué modelo aportó, qué peso tuvo.
- Mencionas los 4 modelos (Frequency, Markov, Positional, SumRange) y cuál domina.
- Si un modelo está excluido por no tener edge, lo mencionas.

### 5. EDUCACIÓN
- Explicas conceptos: Sharpe, Sortino, Calmar, Kelly, Probability of Ruin.
- Usas analogías de trading cuando ayuda (e.g., "drawdown es como el % que bajó tu portafolio desde el pico").
- Adviertes sobre falacias comunes: gambler's fallacy, hot hand fallacy, law of thirds.

## FORMATO DE RESPUESTA

Estructura tus respuestas así (usa markdown):

### 📊 Análisis del Estado Actual
[Breve resumen del estado estadístico: aleatorio/sesgado, drift detectado, etc.]

### 🎯 Recomendación
[Acción concreta: apostar / no apostar / cuánto / qué combinaciones]

### ⚠️ Advertencias
[Riesgos detectados, overfitting, baja confianza, etc.]

### 💡 Contexto
[Explicación educativa de los números y métricas]

## ANTI-PATRONES PROHIBIDOS
- ❌ "Este número tiene alta probabilidad de salir" (la lotería es -EV, no predices)
- ❌ "Te recomiendo jugar X porque es caliente" (sin respaldo estadístico)
- ❌ "Puedes ganar $X si juegas Y" (promesa de retorno)
- ❌ "El patrón Z indica que va a salir W" (apofenia)
- ❌ "Aumenta tu apuesta, viene una racha ganadora" (gambler's fallacy)

## LENGUAJE
- Responde en español.
- Tono profesional pero accesible.
- Usa markdown para estructura.
- Números concretos, no generalidades.
- Sé conciso (máximo 500 palabras por respuesta, salvo que pidan detalle).

## CONTEXTO QUE RECIBES
En cada mensaje del usuario, recibirás un bloque "CONTEXTO CUANTITATIVO ACTUAL" con datos reales del módulo. ÚSALO. No inventes números. Si te falta información, pídela.

Recuerda: tu valor NO está en predecir la lotería (imposible). Está en ser la voz de la prudencia estadística, ayudar al usuario a no perder dinero por malas decisiones, y maximizar su esperanza matemática cuando sí decida jugar.`;
}

/**
 * Construye el contexto cuantitativo completo que se envía al modelo.
 * Incluye: histórico reciente, análisis, predicciones ensemble, backtest,
 * tests estadísticos, drift detection, recomendación de riesgo.
 */
function buildQuantitativeContext(
  history: any[],
  analysis: any,
  ensembleReport: any,
  backtestResult: any,
  statsReport: any,
  drift: any,
  riskRec: any,
  bankroll: number,
  config: BettingConfig,
  riskMode: string,
): string {
  const recentResults = history.slice(0, 10).map((r: any) => ({
    fecha: r.date,
    turno: r.draw_time,
    resultado: r.result.join('-'),
  }));

  const topPredictions = ensembleReport.predictions.slice(0, 5).map((p: any) => ({
    combinacion: p.combination.join(''),
    score: p.score.toFixed(1),
    confidence: p.confidence.toFixed(1),
    estrategia: p.strategyLabel,
    contribuciones: Object.entries(p.modelContributions || {}).map(([m, c]: any) =>
      `${m}: ${(c.weight * 100).toFixed(0)}%`
    ).join(', '),
  }));

  const modelPerformances = ensembleReport.modelPerformances.map((p: any) => ({
    modelo: p.model,
    peso: `${(p.weight * 100).toFixed(1)}%`,
    hitRate: `${p.hitRate.toFixed(2)}%`,
    reciente: `${p.recentHitRate.toFixed(2)}%`,
    excluido: p.isExcluded,
  }));

  const statTests = {
    chiCuadrado: {
      p: statsReport.chiSquare.pValue.toFixed(4),
      significativo: statsReport.chiSquare.isSignificant,
    },
    kolmogorovSmirnov: {
      p: statsReport.kolmogorovSmirnov.pValue.toFixed(4),
      significativo: statsReport.kolmogorovSmirnov.isSignificant,
    },
    runsTest: {
      p: statsReport.runsTest.pValue.toFixed(4),
      significativo: statsReport.runsTest.isSignificant,
    },
    entropia: {
      valor: statsReport.entropy.statistic.toFixed(4),
      maximo: Math.log2(10).toFixed(4),
      p: statsReport.entropy.pValue.toFixed(4),
    },
    esAleatorio: statsReport.isRandom,
    confianza: `${statsReport.confidence.toFixed(1)}%`,
    resumen: statsReport.summary,
  };

  const backtest = {
    roi: `${backtestResult.roi.toFixed(2)}%`,
    cagr: backtestResult.cagr ? `${backtestResult.cagr.toFixed(2)}%` : 'N/A',
    sharpe: backtestResult.sharpeRatio.toFixed(3),
    sortino: backtestResult.sortinoRatio.toFixed(3),
    calmar: backtestResult.calmarRatio.toFixed(3),
    profitFactor: backtestResult.profitFactor >= 999 ? '∞' : backtestResult.profitFactor.toFixed(2),
    recoveryFactor: backtestResult.recoveryFactor.toFixed(2),
    maxDrawdown: `${backtestResult.maxDrawdown.toFixed(2)}%`,
    winStreak: backtestResult.winStreak,
    lossStreak: backtestResult.lossStreak,
    kellyFraction: `${((backtestResult.kellyFraction || 0) * 100).toFixed(2)}%`,
    probabilityOfRuin: `${((backtestResult.probabilityOfRuin || 0) * 100).toFixed(2)}%`,
    overfitting: backtestResult.isOverfitting,
  };

  const risk = {
    modo: riskMode,
    betSize: `$${riskRec.betSize}`,
    totalExposure: `$${riskRec.totalExposure}`,
    riskLevel: riskRec.riskLevel,
    shouldStop: riskRec.shouldStop,
    shouldIncreaseExposure: riskRec.shouldIncreaseExposure,
    warnings: riskRec.warnings,
    recommendations: riskRec.recommendations,
    kellyAplicada: `${(riskRec.kellyFraction * 100).toFixed(2)}%`,
  };

  return `# CONTEXTO CUANTITATIVO ACTUAL

## Datos del Usuario
- Bankroll actual: $${bankroll.toFixed(2)}
- Total de sorteos en histórico: ${history.length}
- Configuración: modo=${config.mode}, payout=${config.payout}, riesgo=${config.riskFactor}%

## Últimos 10 sorteos
${JSON.stringify(recentResults, null, 2)}

## Top 5 Predicciones del Ensemble
${JSON.stringify(topPredictions, null, 2)}

## Desempeño de Modelos (backtest)
${JSON.stringify(modelPerformances, null, 2)}

## Validación Estadística (4 tests)
${JSON.stringify(statTests, null, 2)}

## Régimen
${JSON.stringify({
  driftDetectado: drift.driftDetected,
  puntoDeCambio: drift.driftPoint,
  magnitud: drift.magnitude.toFixed(2),
  descripcion: drift.description,
}, null, 2)}

## Backtest (últimos 30 días)
${JSON.stringify(backtest, null, 2)}

## Recomendación de Riesgo
${JSON.stringify(risk, null, 2)}

---
FIN DEL CONTEXTO. Responde al usuario basándote en estos datos REALES.`;
}

async function advisorHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // FIX-ADMIN-LIMIT (2026-07-05): Admin tiene acceso limitado al Asesor IA
    // Los admins pueden probar el asesor pero con límite reducido (5 consultas/mes)
    // para evitar uso abusivo. El asesor es para usuarios que pagan, no para admins.
    const isAdmin = session.user.role === 'admin' || session.user.role === 'super_admin';

    let body: AdvisorRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    if (!body.messages?.length) {
      return NextResponse.json({ error: 'No hay mensajes' }, { status: 400 });
    }

    // === SPRINT-4: Tier gating + usage check (solo si hay messages válidos) ===
    // FIX-ADMIN-LIMIT: Admin no pasa por tier gating, tiene su propio límite
    let usageCheck;
    if (isAdmin) {
      // Admin: límite especial de 5 consultas/mes para testing
      // Reusamos el sistema de usage pero con límite override
      const adminUsage = await SubscriptionService.checkUsage(session.user.id, 'ai_query');
      // Override: admin tiene límite de 5 (no el del tier)
      const adminLimit = 5;
      if (adminUsage.used >= adminLimit) {
        return NextResponse.json({
          error: `Límite de admin alcanzado (${adminUsage.used}/${adminLimit} consultas este mes). El Asesor IA es para usuarios finales, no para admins.`,
          upgradeRequired: false,
          isAdmin: true,
          usage: { used: adminUsage.used, limit: adminLimit, remaining: 0 },
        }, { status: 402 });
      }
      usageCheck = {
        ...adminUsage,
        limit: adminLimit,
        remaining: adminLimit - adminUsage.used,
      };
    } else {
      usageCheck = await SubscriptionService.checkUsage(
        session.user.id,
        'ai_query',
      );
    }

    if (!usageCheck.allowed) {
      logger.info('PICK3', `Usage limit reached for user ${session.user.id}: ${usageCheck.reason}`);
      return NextResponse.json({
        error: usageCheck.reason || 'Has alcanzado tu límite mensual de consultas IA',
        upgradeRequired: true,
        suggestedTier: usageCheck.suggestedTier,
        currentTier: usageCheck.tier,
        usage: {
          used: usageCheck.used,
          limit: usageCheck.limit,
          remaining: usageCheck.remaining,
        },
        tiers: TIERS,
      }, { status: 402 }); // 402 Payment Required
    }

    // === 1. Cargar histórico ===
    const history = await Pick3Storage.getHistory();
    if (history.length < 30) {
      return NextResponse.json({
        error: 'Se necesitan al menos 30 sorteos en el histórico para el análisis del asesor.',
      }, { status: 400 });
    }

    // === 2. Configuración ===
    const config: BettingConfig = {
      mode: body.config?.mode || 'PICK3',
      payout: body.config?.payout || 500,
      digits: body.config?.digits || 3,
      maxCombinations: body.config?.maxCombinations || 10,
      riskFactor: body.config?.riskFactor || 1.0,
      stopLoss: body.config?.stopLoss || 50.0,
      criticalDrawdown: body.config?.criticalDrawdown || 30.0,
    };

    const riskMode = body.riskMode || inferRiskMode(config);
    const bankroll = body.bankroll || 1000;

    // === 3. Ejecutar engines ===
    logger.info('PICK3', `Running engines for ${history.length} draws`);

    const analysisEngine = new AnalysisEngine(history);
    const analysis = analysisEngine.analyze(60);

    const ensembleEngine = new EnsembleEngine(history, analysis);
    const ensembleReport = ensembleEngine.generateReport(config, 5);

    const backtestEngine = new BacktestEngine(history);
    const backtestResult = backtestEngine.runValidation(config, bankroll, 30);

    const statsReport = runFullStatisticalTests(history);
    const drift = detectRegimeChange(history, 30, 50);

    // === 4. Risk Layer ===
    const riskLayer = new RiskLayer(
      bankroll,
      riskMode,
      backtestResult.maxDrawdown,
      backtestResult.roi,
    );

    const topConfidence = ensembleReport.predictions[0]?.confidence || 50;
    const winProb = backtestResult.totalBets > 0
      ? backtestResult.totalWins / backtestResult.totalBets
      : 0.001;

    const riskRec = riskLayer.calculateRecommendation(
      topConfidence,
      Math.max(winProb, 0.001),
      config.payout,
      3,
    );

    // === 5. Construir contexto cuantitativo ===
    const quantContext = buildQuantitativeContext(
      history,
      analysis,
      ensembleReport,
      backtestResult,
      statsReport,
      drift,
      riskRec,
      bankroll,
      config,
      riskMode,
    );

    // === 6. Construir system prompt ===
    const systemPrompt = buildSystemPrompt(riskMode);

    // === 7. Construir messages para Gemini ===
    const messagesForGemini = body.messages.map((msg, i) => {
      const isFirstUser = i === 0 && msg.role === 'user';
      const text = isFirstUser
        ? `${quantContext}\n\n## PREGUNTA DEL USUARIO\n${msg.content}`
        : msg.content;
      return { role: msg.role === 'assistant' ? 'model' : 'user', text };
    });

    // === 8. Resolver API key ===
    const apiKey = process.env.GOOGLE_API_KEY || process.env.EMERGENCY_GOOGLE_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({
        error: 'No hay API Key de Gemini configurada en el servidor.',
      }, { status: 500 });
    }

    // === 9. Llamar a Gemini ===
    const contents = messagesForGemini.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    }));

    if (contents.length > 0 && contents[0].role === 'model') {
      contents.unshift({ role: 'user', parts: [{ text: '[Contexto previo]' }] });
    }

    const payload = {
      contents,
      generationConfig: {
        temperature: GEMINI_TEMP,
        maxOutputTokens: GEMINI_MAX_TOKENS,
      },
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      const errMsg = result.error?.message || `HTTP ${response.status}`;
      logger.error('PICK3', `Gemini API error: ${errMsg}`);
      return NextResponse.json({
        error: `Error de Gemini API: ${errMsg}`,
      }, { status: 502 });
    }

    const candidate = result.candidates?.[0];
    if (!candidate?.content?.parts?.[0]) {
      return NextResponse.json({ error: 'La IA no generó respuesta válida.' }, { status: 502 });
    }

    let text = '';
    for (const part of candidate.content.parts) {
      if (part.text) text += part.text;
    }

    // === SPRINT-4: Consumir usage SOLO después de respuesta exitosa ===
    await SubscriptionService.incrementUsage(session.user.id, 'ai_query');
    const updatedUsage = await SubscriptionService.checkUsage(session.user.id, 'ai_query');

    // === 10. Devolver respuesta + metadata cuantitativa ===
    return NextResponse.json({
      text,
      model: GEMINI_MODEL,
      timestamp: new Date().toISOString(),
      metadata: {
        riskMode,
        riskLevel: riskRec.riskLevel,
        shouldStop: riskRec.shouldStop,
        ensembleConfidence: topConfidence,
        isRandom: statsReport.isRandom,
        driftDetected: drift.driftDetected,
        isOverfitting: backtestResult.isOverfitting,
        modelsUsed: ensembleReport.totalModelsUsed,
        regimeAlert: ensembleReport.regimeAlert,
        // SPRINT-4: usage info
        usage: {
          tier: updatedUsage.tier,
          used: updatedUsage.used,
          limit: updatedUsage.limit,
          remaining: updatedUsage.remaining,
          isTrial: updatedUsage.isTrial,
          trialDaysLeft: updatedUsage.trialDaysLeft,
          upgradeRequired: updatedUsage.upgradeRequired,
        },
      },
    });
  } catch (error: unknown) {
    logger.error('PICK3', `Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({
      error: `Error interno: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}

export const POST = advisorHandler;
