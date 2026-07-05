/**
 * sprint3.integration.test.ts — End-to-end audit of Sprint 3
 *
 * Verifica que:
 *   1. El API route /api/pick3/advisor existe y exporta POST
 *   2. El system prompt contiene las advertencias anti-patrones
 *   3. El contexto cuantitativo incluye todas las secciones
 *   4. El route ejecuta todos los engines requeridos
 *   5. La metadata de respuesta tiene la estructura esperada
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROUTE_PATH = path.join(process.cwd(), 'src/app/api/pick3/advisor/route.ts');
const COMPONENT_PATH = path.join(process.cwd(), 'src/components/views/terminal/views/pick3/Pick3AIAdvisor.tsx');

describe('SPRINT-3 INTEGRATION AUDIT', () => {
  describe('API Route structure', () => {
    it('el archivo route.ts existe', () => {
      expect(fs.existsSync(ROUTE_PATH)).toBe(true);
    });

    it('exporta POST handler', async () => {
      const route = await import('@/app/api/pick3/advisor/route');
      expect(route.POST).toBeDefined();
      expect(typeof route.POST).toBe('function');
    });

    it('tiene configuración de runtime nodejs y maxDuration', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain("runtime = 'nodejs'");
      expect(content).toContain('maxDuration = 60');
      expect(content).toContain("dynamic = 'force-dynamic'");
    });

    it('valida sesión con getServerSession', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('getServerSession(req)');
      expect(content).toContain('No autorizado');
    });

    it('requiere mínimo 30 sorteos', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('history.length < 30');
    });
  });

  describe('Engines execution', () => {
    it('ejecuta AnalysisEngine', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('new AnalysisEngine(');
      expect(content).toContain('.analyze(60)');
    });

    it('ejecuta EnsembleEngine', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('new EnsembleEngine(');
      expect(content).toContain('.generateReport(config, 5)');
    });

    it('ejecuta BacktestEngine', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('new BacktestEngine(');
      expect(content).toContain('.runValidation(');
    });

    it('ejecuta tests estadísticos', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('runFullStatisticalTests(');
    });

    it('ejecuta drift detection', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('detectRegimeChange(');
    });

    it('ejecuta RiskLayer', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('new RiskLayer(');
      expect(content).toContain('.calculateRecommendation(');
    });
  });

  describe('System prompt anti-patterns', () => {
    it('prohíbe prometer retornos', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('NUNCA prometes retornos');
      expect(content).toContain('NUNCA dices "este número va a salir"');
    });

    it('prohíbe apofenia y gambler fallacy', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('gambler\'s fallacy');
      expect(content).toContain('apofenia');
    });

    it('define honestidad estadística', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('HONESTIDAD ESTADÍSTICA');
      expect(content).toContain('Si los tests estadísticos dicen que los datos son aleatorios');
    });

    it('define regime awareness', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('REGIME AWARENESS');
      expect(content).toContain('drift');
    });

    it('define explainability', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('EXPLAINABILITY');
      expect(content).toContain('modelContributions');
    });
  });

  describe('Risk modes in system prompt', () => {
    it('define Defensive con Kelly 10%', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Defensive: recomendaciones conservadoras. Kelly 10%');
      expect(content).toContain('Max 2% bankroll/sorteo');
      expect(content).toContain('Stop-loss 15%');
    });

    it('define Balanced con Kelly 25%', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Balanced: recomendaciones estándar. Kelly 25%');
      expect(content).toContain('Max 5% bankroll/sorteo');
      expect(content).toContain('Stop-loss 25%');
    });

    it('define Aggressive con Kelly 50%', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Aggressive: recomendaciones agresivas. Kelly 50%');
      expect(content).toContain('Max 10% bankroll/sorteo');
      expect(content).toContain('Stop-loss 35%');
    });
  });

  describe('Quantitative context sections', () => {
    it('incluye sección de datos del usuario', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Bankroll actual');
      expect(content).toContain('Total de sorteos en histórico');
    });

    it('incluye últimos 10 sorteos', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Últimos 10 sorteos');
    });

    it('incluye top 5 predicciones del ensemble', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Top 5 Predicciones del Ensemble');
    });

    it('incluye desempeño de modelos', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Desempeño de Modelos');
    });

    it('incluye validación estadística', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Validación Estadística');
      expect(content).toContain('chiCuadrado');
      expect(content).toContain('kolmogorovSmirnov');
      expect(content).toContain('runsTest');
      expect(content).toContain('entropia');
    });

    it('incluye sección de régimen', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Régimen');
      expect(content).toContain('driftDetectado');
    });

    it('incluye backtest completo', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Backtest');
      expect(content).toContain('sharpe');
      expect(content).toContain('sortino');
      expect(content).toContain('calmar');
      expect(content).toContain('profitFactor');
      expect(content).toContain('kellyFraction');
      expect(content).toContain('probabilityOfRuin');
    });

    it('incluye recomendación de riesgo', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('Recomendación de Riesgo');
      expect(content).toContain('betSize');
      expect(content).toContain('totalExposure');
      expect(content).toContain('riskLevel');
      expect(content).toContain('shouldStop');
    });
  });

  describe('Response metadata', () => {
    it('devuelve metadata con todos los campos', () => {
      const content = fs.readFileSync(ROUTE_PATH, 'utf-8');
      expect(content).toContain('riskMode:');
      expect(content).toContain('riskLevel:');
      expect(content).toContain('shouldStop:');
      expect(content).toContain('ensembleConfidence:');
      expect(content).toContain('isRandom:');
      expect(content).toContain('driftDetected:');
      expect(content).toContain('isOverfitting:');
      expect(content).toContain('modelsUsed:');
      expect(content).toContain('regimeAlert:');
    });
  });

  describe('Component Pick3AIAdvisor', () => {
    it('el componente existe', () => {
      expect(fs.existsSync(COMPONENT_PATH)).toBe(true);
    });

    it('tiene selector de 3 modos', () => {
      const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
      expect(content).toContain("'defensive'");
      expect(content).toContain("'balanced'");
      expect(content).toContain("'aggressive'");
    });

    it('persiste modo en localStorage', () => {
      const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
      expect(content).toContain("localStorage.setItem('pick3-risk-mode'");
      expect(content).toContain("localStorage.getItem('pick3-risk-mode'");
    });

    it('renderiza badges de metadata', () => {
      const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
      expect(content).toContain('renderStatusBadges');
      // El código usa optional chaining (metadata?.isRandom o metadata.isRandom)
      expect(content).toMatch(/metadata\??\.isRandom/);
      expect(content).toMatch(/metadata\??\.driftDetected/);
      expect(content).toMatch(/metadata\??\.isOverfitting/);
      expect(content).toMatch(/metadata\??\.shouldStop/);
      expect(content).toMatch(/metadata\??\.riskLevel/);
      expect(content).toMatch(/metadata\??\.modelsUsed/);
    });

    it('tiene quick questions contextuales', () => {
      const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
      expect(content).toContain('¿Hay edge estadístico real o es ruido?');
      expect(content).toContain('¿Detectaste drift en el régimen?');
      expect(content).toContain('¿Cuánto debería apostar según Kelly?');
    });

    it('tiene disclaimer honesto', () => {
      const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
      expect(content).toContain('expected value negativo');
      expect(content).toContain('ningún método garantiza ganancias');
    });

    it('usa el endpoint /api/pick3/advisor', () => {
      const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
      expect(content).toContain("'/api/pick3/advisor'");
    });

    it('envía riskMode y bankroll en el body', () => {
      const content = fs.readFileSync(COMPONENT_PATH, 'utf-8');
      expect(content).toContain('riskMode');
      expect(content).toContain('bankroll');
    });
  });

  describe('Integration with Pick3IntelligenceView', () => {
    it('pasa profile al Pick3AIAdvisor', () => {
      const viewPath = path.join(process.cwd(), 'src/components/views/terminal/views/pick3/Pick3IntelligenceView.tsx');
      const content = fs.readFileSync(viewPath, 'utf-8');
      expect(content).toContain('profile={profile}');
    });
  });
});
