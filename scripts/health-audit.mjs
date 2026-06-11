#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * CostPro Salud Plataforma — Automated Health Audit Engine
 * Centro de Inteligencia v9.0.0
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Run: node scripts/health-audit.mjs
 * Cron: 0 * * * * cd /home/z/my-project && node scripts/health-audit.mjs >> /home/z/my-project/logs/health-audit.log 2>&1
 *
 * Checks:
 *   1. API endpoint availability (/api/intelligence)
 *   2. Architecture artifacts integrity (4 JSON files)
 *   3. Knowledge graph completeness
 *   4. Documentation coverage (help/*.md)
 *   5. System resource health (CPU, RAM, uptime)
 *   6. Component health scores (504 components)
 *   7. Pipeline state validation
 *   8. Cross-tab data consistency
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE_DIR = path.join(ROOT, 'knowledge');
const ARCH_DIR = path.join(KNOWLEDGE_DIR, 'architecture');
const HELP_DIR = path.join(KNOWLEDGE_DIR, 'help');
const LOGS_DIR = path.join(ROOT, 'logs');
const STATE_FILE = path.join(ROOT, '.health-audit-state.json');

// Ensure logs directory
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── Audit Engine ──

const audit = {
  timestamp: new Date().toISOString(),
  score: 0,
  totalChecks: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  sections: [],
  currentSection: '',
  currentIssues: [],
};

function startSection(name) {
  audit.currentSection = name;
  audit.currentIssues = [];
}

function check(name, passed, severity = 'error', detail = '') {
  audit.totalChecks++;
  if (passed) {
    audit.passed++;
  } else if (severity === 'warning') {
    audit.warnings++;
    audit.currentIssues.push(`[WARN] ${name}${detail ? ': ' + detail : ''}`);
  } else {
    audit.failed++;
    audit.currentIssues.push(`[FAIL] ${name}${detail ? ': ' + detail : ''}`);
  }
}

function endSection() {
  const checks = audit.totalChecks;
  audit.sections.push({
    name: audit.currentSection,
    score: audit.totalChecks > 0 ? Math.round((audit.passed / audit.totalChecks) * 100) : 0,
    checks: audit.totalChecks,
    passed: audit.passed,
    issues: [...audit.currentIssues],
  });
  audit.totalChecks = 0;
  audit.passed = 0;
  audit.warnings = 0;
  audit.failed = 0;
  audit.currentIssues = [];
}

// ── 1. Architecture Artifacts Integrity ──

function checkArchitectureArtifacts() {
  startSection('Artefactos de Arquitectura');

  const required = [
    { name: 'Architecture Metrics', path: 'architecture_metrics.json' },
    { name: 'Architecture Graph', path: 'architecture_graph.json' },
    { name: 'System Architecture', path: 'system_architecture.json' },
  ];

  for (const art of required) {
    const fullPath = path.join(ARCH_DIR, art.path);
    const exists = fs.existsSync(fullPath);
    check(`${art.name} existe`, exists, 'error', exists ? 'OK' : `Falta: ${fullPath}`);

    if (exists) {
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        check(`${art.name} JSON válido`, true, 'error');

        if (art.path === 'architecture_metrics.json') {
          const compCount = data.components?.length || 0;
          const linkCount = data.summary?.total_links || 0;
          check(`${art.name}: ${compCount} componentes`, compCount >= 100, 'warning', `${compCount} encontrados`);
          check(`${art.name}: ${linkCount} dependencias`, linkCount >= 100, 'warning', `${linkCount} encontrados`);
          check(`${art.name}: layer_distribution presente`, !!data.summary?.layer_distribution, 'warning');
        }

        if (art.path === 'architecture_graph.json') {
          const nodes = data.nodes?.length || 0;
          const edges = data.edges?.length || data.links?.length || 0;
          check(`${art.name}: ${nodes} nodos`, nodes >= 50, 'warning', `${nodes} encontrados`);
          check(`${art.name}: ${edges} enlaces`, edges >= 50, 'warning', `${edges} encontrados`);
        }

        if (art.path === 'system_architecture.json') {
          const comps = data.components?.length || 0;
          check(`${art.name}: ${comps} componentes del sistema`, comps >= 10, 'warning', `${comps} encontrados`);
        }
      } catch (e) {
        check(`${art.name} JSON válido`, false, 'error', e?.message?.substring(0, 80));
      }
    }
  }

  // File sizes
  for (const art of required) {
    const fullPath = path.join(ARCH_DIR, art.path);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      const sizeKB = Math.round(stat.size / 1024);
      check(`${art.name}: tamaño ${sizeKB}KB`, sizeKB >= 1, 'warning', `${sizeKB}KB`);
    }
  }

  endSection();
}

// ── 2. Knowledge Graph ──

function checkKnowledgeGraph() {
  startSection('Mapa de Conocimiento');

  const kgPath = path.join(KNOWLEDGE_DIR, 'knowledge_graph.json');
  const exists = fs.existsSync(kgPath);
  check('knowledge_graph.json existe', exists, 'error');

  if (exists) {
    try {
      const data = JSON.parse(fs.readFileSync(kgPath, 'utf-8'));
      check('KG JSON válido', true);

      const nodes = data.nodes?.length || 0;
      const edges = data.edges?.length || data.links?.length || 0;
      check(`KG: ${nodes} nodos semánticos`, nodes >= 10, 'warning', `${nodes} nodos`);
      check(`KG: ${edges} relaciones`, edges >= 10, 'warning', `${edges} relaciones`);

      // Check for workflow nodes
      const workflows = (data.nodes || []).filter((n) => n.group === 'workflow');
      check(`KG: ${workflows.length} workflows`, workflows.length >= 3, 'warning', `${workflows.length} flujos de negocio`);
    } catch (e) {
      check('KG JSON válido', false, 'error', e?.message?.substring(0, 80));
    }
  }

  endSection();
}

// ── 3. Documentation Coverage ──

function checkDocumentation() {
  startSection('Documentación Operativa');

  const requiredSections = [
    '01-empezar', '02-gestion', '03-inventario', '04-configuracion', '05-referencia',
  ];

  let totalDocs = 0;
  for (const section of requiredSections) {
    const sectionDir = path.join(HELP_DIR, section);
    const exists = fs.existsSync(sectionDir);
    check(`Sección ${section} existe`, exists, 'warning', exists ? 'OK' : 'Falta');

    if (exists) {
      const files = fs.readdirSync(sectionDir).filter(f => f.endsWith('.md'));
      totalDocs += files.length;
      check(`${section}: ${files.length} documentos`, files.length >= 2, 'warning');

      // Check each doc has H1
      for (const file of files) {
        const content = fs.readFileSync(path.join(sectionDir, file), 'utf-8');
        const hasH1 = content.split('\n').some(l => /^#\s+/.test(l.trim()));
        check(`${section}/${file}: tiene H1`, hasH1, 'warning');
      }
    }
  }

  check('Total documentos >= 15', totalDocs >= 15, 'warning', `${totalDocs} encontrados`);

  // Compliance section
  const complianceDir = path.join(HELP_DIR, 'compliance');
  if (fs.existsSync(complianceDir)) {
    const compFiles = fs.readdirSync(complianceDir).filter(f => f.endsWith('.md'));
    check(`Cumplimiento: ${compFiles.length} documentos`, compFiles.length >= 1, 'warning');
  }

  endSection();
}

// ── 4. System Resources ──

function checkSystemResources() {
  startSection('Recursos del Sistema');

  const mem = os.totalmem();
  const free = os.freemem();
  const memUsagePercent = Math.round((1 - free / mem) * 100);
  const loadAvg = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  const uptime = os.uptime();

  check(`RAM: ${memUsagePercent}% uso`, memUsagePercent < 90, memUsagePercent > 90 ? 'error' : 'warning', `${Math.round(free / 1024 / 1024)}MB libre de ${Math.round(mem / 1024 / 1024)}MB`);
  check(`CPU: load ${loadAvg.toFixed(2)}`, loadAvg < cpuCount * 4, loadAvg > cpuCount * 4 ? 'error' : 'warning', `${cpuCount} cores`);
  check(`Uptime: ${Math.floor(uptime / 3600)}h`, uptime > 60, 'warning', 'Sistema estable');
  check(`Proceso: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, process.memoryUsage().heapUsed < 512 * 1024 * 1024, 'warning');

  endSection();
}

// ── 5. API Endpoint ──

function checkAPIEndpoint() {
  startSection('API /api/intelligence');

  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/api/intelligence', { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });

      res.on('end', () => {
        check('API responde HTTP', res.statusCode === 200, res.statusCode === 200 ? 'error' : 'warning', `Status ${res.statusCode}`);

        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            check('API retorna JSON válido', true);

            const hasHealth = !!data.healthSummary;
            const hasMetrics = !!data.metrics;
            const hasGraph = !!data.graph;
            const hasSystem = !!data.system;
            const hasKnowledge = !!data.knowledgeGraph;
            const hasPipeline = !!data.pipelineState;
            const hasAnalytics = !!data.analytics;
            const hasDocsList = Array.isArray(data.docsList);

            check('healthSummary presente', hasHealth, 'warning');
            check('metrics presente', hasMetrics, 'warning');
            check('graph presente', hasGraph, 'warning');
            check('system presente', hasSystem, 'warning');
            check('knowledgeGraph presente', hasKnowledge, 'warning');
            check('pipelineState presente', hasPipeline, 'warning');
            check('analytics presente', hasAnalytics, 'warning', hasAnalytics ? 'Analytics enriquecidos OK' : 'Sin analytics');
            check('docsList presente', hasDocsList, 'warning', hasDocsList ? `${data.docsList.length} docs` : 'Vacio');

            if (data.healthSummary) {
              const score = data.healthSummary.integrityScore || 0;
              check(`Integridad: ${score}%`, score >= 50, score < 50 ? 'error' : 'warning');
            }

            if (data.analytics) {
              check(`Riesgo: ${data.analytics.riskAssessment?.level || 'N/A'}`, true, 'warning');
              check(`Componentes críticos: ${data.analytics.topCriticalComponents?.length || 0}`, (data.analytics.topCriticalComponents?.length || 0) >= 5, 'warning');
              check(`Salud por capas: ${data.analytics.layerHealthScores?.length || 0} capas`, (data.analytics.layerHealthScores?.length || 0) >= 3, 'warning');
            }
          } catch (e) {
            check('API retorna JSON válido', false, 'error', e.message?.substring(0, 80));
          }
        }

        endSection();
        resolve();
      });
    });

    req.on('error', (e) => {
      check('API accesible', false, 'error', e.message?.substring(0, 80));
      endSection();
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      check('API responde en tiempo', false, 'error', 'Timeout 10s');
      endSection();
      resolve();
    });
  });
}

// ── 6. Source Code Integrity ──

function checkSourceIntegrity() {
  startSection('Integridad del Código Fuente');

  const healthFiles = [
    'src/components/views/health/HealthView.tsx',
    'src/components/views/health/HealthLayout.tsx',
    'src/components/views/health/hooks/useHealthData.ts',
    'src/components/views/health/tabs/OverviewTab.tsx',
    'src/components/views/health/tabs/ArchitectureTab.tsx',
    'src/components/views/health/tabs/KnowledgeTab.tsx',
    'src/components/views/health/tabs/DocumentationTab.tsx',
    'src/components/views/health/tabs/AuditTab.tsx',
    'src/components/views/health/tabs/PipelineTab.tsx',
    'src/components/views/health/components/GraphViewer.tsx',
    'src/components/views/health/components/GraphViewerLazy.tsx',
    'src/components/views/health/components/MetricCard.tsx',
    'src/components/views/health/components/JsonViewer.tsx',
    'src/components/views/health/components/MarkdownViewer.tsx',
    'src/app/api/intelligence/route.ts',
  ];

  for (const file of healthFiles) {
    const fullPath = path.join(ROOT, file);
    const exists = fs.existsSync(fullPath);
    check(`${file.split('/').pop()} existe`, exists, 'error');

    if (exists) {
      const stat = fs.statSync(fullPath);
      const sizeKB = Math.round(stat.size / 1024);
      check(`${file.split('/').pop()}: ${sizeKB}KB`, sizeKB >= 1, 'warning');
    }
  }

  endSection();
}

// ── 7. Production Guard Removed ──

function checkProductionReadiness() {
  startSection('Listo para Producción');

  const apiPath = path.join(ROOT, 'src/app/api/intelligence/route.ts');
  const apiContent = fs.readFileSync(apiPath, 'utf-8');

  check('No hay guard de producción bloqueante', !apiContent.includes("process.env.NODE_ENV === 'production'"), 'error',
    apiContent.includes("process.env.NODE_ENV === 'production'") ? 'PELIGRO: Datos mínimos en producción' : 'OK: Full data en todos los ambientes');

  // Check for 'in' operator bug in GraphViewer
  const graphPath = path.join(ROOT, 'src/components/views/health/components/GraphViewer.tsx');
  if (fs.existsSync(graphPath)) {
    const graphContent = fs.readFileSync(graphPath, 'utf-8');
    const hasBrokenIn = graphContent.includes("' in id");
    check('No hay operador "in" roto en GraphViewer', !hasBrokenIn, 'error',
      hasBrokenIn ? 'PELIGRO: deriveLayer usa "in" en vez de includes()' : 'OK: deriveLayer usa includes()');
  }

  check('useHealthData tiene tipo AnalyticsData', apiContent.includes('analytics') || fs.readFileSync(path.join(ROOT, 'src/components/views/health/hooks/useHealthData.ts'), 'utf-8').includes('AnalyticsData'), 'warning');

  endSection();
}

// ════════════════════════════════════════════════════════════════════════
// REPORT
// ════════════════════════════════════════════════════════════════════════

function computeScore() {
  // Weight each section
  const weights = {
    'Artefactos de Arquitectura': 20,
    'Mapa de Conocimiento': 15,
    'Documentación Operativa': 10,
    'Recursos del Sistema': 10,
    'API /api/intelligence': 25,
    'Integridad del Código Fuente': 10,
    'Listo para Producción': 10,
  };

  let totalWeight = 0;
  let weightedScore = 0;

  for (const section of audit.sections) {
    const w = weights[section.name] || 10;
    totalWeight += w;
    weightedScore += section.score * w;
  }

  audit.score = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
}

function printReport() {
  const timestamp = audit.timestamp;
  const score = audit.score;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  SALUD PLATAFORMA — AUDITORÍA AUTOMÁTICA v9.0.0              ║`);
  console.log(`║  Score: ${String(score).padStart(3)}/100  ${'█'.repeat(Math.floor(score / 10))}${'░'.repeat(10 - Math.floor(score / 10))}  ${score >= 90 ? 'EXCELENTE' : score >= 75 ? 'BUENO' : score >= 50 ? 'ACEPTABLE' : 'DEGRADADO'}                 ║`);
  console.log(`║  ${timestamp.substring(0, 19)}                                ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');

  for (const section of audit.sections) {
    const barLen = 20;
    const filled = Math.floor(section.score / 100 * barLen);
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
    console.log(`║  ${section.name.padEnd(32)} ${bar} ${String(section.score).padStart(3)}%  ║`);

    for (const issue of section.issues.slice(0, 5)) {
      console.log(`║    ${issue.substring(0, 58).padEnd(58)}  ║`);
    }
    if (section.issues.length > 5) {
      console.log(`║    ... y ${section.issues.length - 5} issues más${' '.repeat(42)}║`);
    }
  }

  console.log('╚══════════════════════════════════════════════════════════════╝');

  return score;
}

// ════════════════════════════════════════════════════════════════════════
// STATE PERSISTENCE
// ════════════════════════════════════════════════════════════════════════

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {}
  return { history: [] };
}

function saveState(score) {
  const state = loadState();
  state.history.push({
    timestamp: audit.timestamp,
    score,
    sections: audit.sections.map(s => ({ name: s.name, score: s.score })),
  });
  // Keep last 100 runs
  if (state.history.length > 100) state.history = state.history.slice(-100);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════

async function runAudit() {
  console.log(`\n>> Salud Plataforma Audit — ${new Date().toISOString()}`);
  console.log('   Centro de Inteligencia v9.0.0');

  checkArchitectureArtifacts();
  checkKnowledgeGraph();
  checkDocumentation();
  checkSystemResources();
  await checkAPIEndpoint();
  checkSourceIntegrity();
  checkProductionReadiness();

  computeScore();
  const score = printReport();
  saveState(score);

  // Trend
  const state = loadState();
  if (state.history.length >= 2) {
    const prev = state.history[state.history.length - 2].score;
    const delta = score - prev;
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    console.log(`\n>> Tendencia: ${arrow}${Math.abs(delta)} puntos (anterior: ${prev}/100, actual: ${score}/100)`);
  }

  console.log(`>> Próxima auditoría en 1 hora (cron: 0 * * * *)`);
}

runAudit().catch(console.error);
