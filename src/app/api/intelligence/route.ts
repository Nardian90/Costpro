import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJson(relPath: string): any {
  try {
    const fullPath = path.join(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) return null;
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  } catch {
    return null;
  }
}

function listMarkdownFiles(dir: string): string[] {
  try {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath)
      .filter(f => f.endsWith('.md'))
      .sort();
  } catch {
    return [];
  }
}

// ─── Real System Metrics (computed at runtime) ──────────────────────────────

function computeRealSystemMetrics() {
  const mem = os.totalmem();
  const free = os.freemem();
  const cpus = os.cpus();
  const uptime = os.uptime();

  const loadAvg = os.loadavg();
  const cpuCount = cpus.length;

  return {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    cpuCount,
    cpuModel: cpus[0]?.model || 'Unknown',
    totalMemoryMB: Math.round(mem / 1024 / 1024),
    freeMemoryMB: Math.round(free / 1024 / 1024),
    memoryUsagePercent: Math.round((1 - free / mem) * 100),
    loadAvg1m: parseFloat(loadAvg[0].toFixed(2)),
    loadAvg5m: parseFloat(loadAvg[1].toFixed(2)),
    loadAvg15m: parseFloat(loadAvg[2].toFixed(2)),
    uptimeSeconds: uptime,
    uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    processMemoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    processUptimeMs: process.uptime() * 1000,
  };
}

function computeProjectMetrics(metrics: any, system: any) {
  const summary = metrics?.summary || {};
  const components = metrics?.components || [];
  const totalComponents = summary.total_components || components.length || 0;

  // Calculate real integrity from available data
  const avgInstability = summary.avg_instability ?? 0.3;
  const avgFanIn = summary.avg_fan_in ?? 0;
  const avgFanOut = summary.avg_fan_out ?? 0;
  const totalLinks = summary.total_links || 0;

  // Count layers from data
  const layerDist = summary.layer_distribution || {};
  const layerCount = Object.keys(layerDist).length || 4;

  // Multi-dimensional Integrity Score (SHI v2):
  // Evaluates 5 architectural quality dimensions, each weighted for realism
  const avgLinksPerComp = totalComponents > 0 ? totalLinks / totalComponents : 0;

  // 1. Artifact Completeness (20 pts): System has all required architecture files
  const artifactScore = (metrics && system) ? 20 : 5;

  // 2. Architecture Maturity (20 pts): Layer count and component scale
  const layerMaturity = Math.min(layerCount / 8, 1); // 8 layers = perfect
  const scaleMaturity = Math.min(totalComponents / 500, 1); // 500+ = mature
  const maturityScore = Math.round(layerMaturity * 10 + scaleMaturity * 10);

  // 3. Structural Connectivity (20 pts): Average links per component
  // 3+ avg = excellent, 2+ = good, 1+ = acceptable
  const connectivityScore = avgLinksPerComp >= 3 ? 20
    : avgLinksPerComp >= 2 ? 16
    : avgLinksPerComp >= 1 ? 10
    : 3;

  // 4. Stability Index (20 pts): Inverse instability with realistic thresholds
  // 0.0-0.3 = excellent, 0.3-0.5 = good, 0.5-0.7 = moderate, 0.7+ = concerning
  const stabilityScore = avgInstability <= 0.3 ? 20
    : avgInstability <= 0.5 ? 18
    : avgInstability <= 0.65 ? 16
    : avgInstability <= 0.8 ? 10
    : 5;

  // 5. Modular Richness (20 pts): Component diversity across layers
  // Rewards having many layers; penalizes extreme dominance
  const layerCountNormalized = Object.keys(layerDist).length;
  const dominantLayerPct = totalComponents > 0
    ? Math.max(...Object.values(layerDist) as number[]) / totalComponents
    : 1;
  // Diversity bonus: at least 5 layers with >1% each is excellent
  const nonTrivialLayers = Object.values(layerDist).filter(v => (v as number) / totalComponents > 0.01).length;
  const layerRichness = Math.min(nonTrivialLayers / 8, 1);
  const distributionBalance = dominantLayerPct <= 0.5 ? 1 : dominantLayerPct <= 0.65 ? 0.8 : dominantLayerPct <= 0.8 ? 0.5 : 0.2;
  const richnessScore = Math.round(layerRichness * 12 + distributionBalance * 8);

  const integrityScore = Math.round(
    artifactScore + maturityScore + connectivityScore + stabilityScore + richnessScore
  );

  // Extract UI views count (components in UI Components layer)
  const uiViewsCount = layerDist['UI Components'] || 0;
  // Extract application views
  const appViewsCount = layerDist['Application'] || 0;
  const viewsCount = uiViewsCount + appViewsCount;

  return {
    integrityScore: Math.min(100, Math.max(0, integrityScore)),
    couplingScore: Math.round((1 - avgInstability) * 100),
    totalComponents,
    layerCount,
    viewsCount,
    instability: avgInstability,
    avgFanIn: Math.round(avgFanIn * 100) / 100,
    avgFanOut: Math.round(avgFanOut * 100) / 100,
    totalLinks,
  };
}

// ─── Pipeline State Generator ───────────────────────────────────────────────

function generatePipelineState() {
  const now = new Date();
  return {
    version: '9.0.0',
    currentPhase: 18,
    totalPhases: 18,
    cycle: 1,
    status: 'IDLE',
    schedulerMode: 'NORMAL',
    confidenceThreshold: 90,
    repairThreshold: 80,
    lastExecution: now.toISOString(),
    nextExecution: null,
    pipelineVersion: '9.0.0',
    documentationModel: 'ISO 26514 + Diataxis',
    rag_engine: {
      batch_size: 50,
      embedding_model: 'text-embedding-3-small',
      chunk_size: 512,
      overlap: 64,
    },
    governance: {
      auto_approve_threshold: 95,
      require_review_below: 80,
      max_pending_reviews: 10,
    }
  };
}

// ─── Knowledge Extraction (enriched from all available sources) ─────────────

function extractKnowledgeData(system: any, metrics: any, knowledgeGraph: any) {
  // ── 1. Workflows: from knowledge_graph.json (group === 'workflow') ──
  const kgNodes: any[] = knowledgeGraph?.nodes || [];
  const kgEdges: any[] = knowledgeGraph?.edges || knowledgeGraph?.links || [];

  const workflowNodes = kgNodes.filter(n => n.group === 'workflow');
  const workflows = workflowNodes.map(w => {
    const deps = kgEdges
      .filter(e => e.source === w.id && e.type === 'contains')
      .map(e => kgNodes.find(n => n.id === e.target))
      .filter(Boolean);
    return {
      id: w.id,
      name: w.label,
      feature: w.group,
      domain: 'workflow',
      description: `Proceso de negocio: ${w.label}. Gestiona la ejecución y orquestación de tareas dentro del dominio operativo.`,
      triggers: deps.slice(0, 5).map(d => d.label),
      components: deps.map(d => d.id),
    };
  });

  // ── 2. Views: from system_architecture.json components in Application layer ──
  const sysComponents: any[] = system?.components || [];
  const appLayer = sysComponents.filter(c => c.layer === 'Application');
  const views = appLayer.map(c => {
    const deps: any[] = c.dependencies || [];
    return {
      id: c.id,
      name: c.label || c.filePath?.split('/').pop() || c.id,
      feature: c.type || 'view',
      domain: c.layer || 'Application',
      description: c.filePath
        ? `Vista de aplicación en ${c.filePath}. Nivel de acoplamiento: ${c.dependencies?.length || 0} dependencias.`
        : `Componente Application con ${deps.length} dependencias internas.`,
      dependencies: deps.slice(0, 8),
      dependencyCount: deps.length,
    };
  });

  // ── 3. Components: from architecture_metrics.json with layer info ──
  const metricComponents: any[] = metrics?.components || [];
  const layerDistribution: Record<string, any[]> = {};
  for (const mc of metricComponents) {
    const layer = mc.layer || 'Unknown';
    if (!layerDistribution[layer]) layerDistribution[layer] = [];
    layerDistribution[layer].push(mc);
  }

  const components = metricComponents.map(c => {
    return {
      id: c.id,
      name: c.label || c.id,
      type: c.type || 'component',
      layer: c.layer || 'Unknown',
      domain: c.layer || 'Unknown',
      fan_in: c.fan_in || 0,
      fan_out: c.fan_out || 0,
      coupling: c.coupling || 0,
      instability: c.instability || 0,
      description: `Componente en capa ${c.layer || 'Unknown'} con fan-in ${c.fan_in || 0}, fan-out ${c.fan_out || 0}, acoplamiento ${(c.coupling * 100).toFixed(0)}%.`,
    };
  });

  // ── 4. Knowledge Graph: use knowledge_graph.json directly ──
  const graph = knowledgeGraph || { nodes: [], edges: [] };

  // ── 5. Layer Summary for Knowledge Tab ──
  const layerSummary = Object.entries(layerDistribution).map(([layer, comps]) => ({
    layer,
    count: comps.length,
    avgFanIn: (comps.reduce((s: number, c: any) => s + (c.fan_in || 0), 0) / comps.length).toFixed(2),
    avgFanOut: (comps.reduce((s: number, c: any) => s + (c.fan_out || 0), 0) / comps.length).toFixed(2),
    avgCoupling: (comps.reduce((s: number, c: any) => s + (c.coupling || 0), 0) / comps.length * 100).toFixed(1),
    avgInstability: (comps.reduce((s: number, c: any) => s + (c.instability || 0), 0) / comps.length * 100).toFixed(1),
  }));

  return {
    workflows,
    views,
    components,
    knowledgeGraph: graph,
    layerSummary,
  };
}

// ─── Health Summary Calculator ─────────────────────────────────────────────

function calculateHealthSummary(projectMetrics: any, systemMetrics: any) {
  const now = new Date();
  const uptimeOk = systemMetrics.uptimeSeconds > 60;
  const memoryOk = systemMetrics.memoryUsagePercent < 90;
  const cpuOk = systemMetrics.loadAvg1m < systemMetrics.cpuCount * 2;

  let score = projectMetrics.integrityScore || 70;
  if (uptimeOk) score += 5;
  if (memoryOk) score += 5;
  if (cpuOk) score += 5;
  score = Math.min(100, score);

  const status = score >= 85 ? 'HEALTHY' : score >= 70 ? 'STABLE' : score >= 50 ? 'DEGRADED' : 'CRITICAL';

  return {
    timestamp: now.toISOString(),
    integrityScore: score,
    status,
    systemMetrics: {
      memoryPercent: systemMetrics.memoryUsagePercent,
      processMemoryMB: systemMetrics.processMemoryMB,
      cpuLoad: systemMetrics.loadAvg1m,
      cpuCount: systemMetrics.cpuCount,
      uptime: systemMetrics.uptimeHuman,
    },
    platform: {
      node: systemMetrics.nodeVersion,
      os: `${systemMetrics.platform}/${systemMetrics.arch}`,
    }
  };
}

// ─── Main Handler ───────────────────────────────────────────────────────────

const handler = withAuth(async (req: NextRequest, session: AuthenticatedSession) => {
  // ── Read disk-based artifacts ──
  const metrics = readJson('knowledge/architecture/architecture_metrics.json');
  const graph = readJson('knowledge/architecture/architecture_graph.json');
  const system = readJson('knowledge/architecture/system_architecture.json');
  const audit = readJson('docs/architecture_audit.json');
  const knowledgeGraph = readJson('knowledge/knowledge_graph.json');

  // ── Compute real metrics ──
  const systemMetrics = computeRealSystemMetrics();
  const projectMetrics = computeProjectMetrics(metrics, system);
  const pipelineState = generatePipelineState();
  const knowledgeData = extractKnowledgeData(system, metrics, knowledgeGraph);
  const healthSummary = calculateHealthSummary(projectMetrics, systemMetrics);

  // ── List available documentation (recursive) ──
  function listMarkdownFilesRecursive(dir: string, base = ''): string[] {
    const results: string[] = [];
    try {
      const fullPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullPath)) return results;
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        const relPath = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          results.push(...listMarkdownFilesRecursive(path.join(dir, entry.name), relPath));
        } else if (entry.name.endsWith('.md')) {
          results.push(relPath);
        }
      }
    } catch {}
    return results;
  }

  const docsList = [
    ...listMarkdownFilesRecursive('knowledge/docs', 'docs'),
    ...listMarkdownFilesRecursive('knowledge/help', 'help'),
  ];

  // ── Build response with all required fields ──
  return NextResponse.json({
    // Original fields
    audit: audit || {
      phaseExecutions: [],
      timestamp: new Date().toISOString(),
      engine: 'v9.0.0',
      generatedBy: 'Intelligence Pipeline v9.0',
    },
    metrics,
    graph,
    system,

    // Computed fields
    manifest: {
      version: '9.0.0',
      generatedAt: new Date().toISOString(),
      artifactCount: 4 + docsList.length,
      sourceDirectory: 'knowledge/architecture/',
    },
    changes: [],
    reviewQueue: {
      queue: [],
      totalPending: 0,
      lastReview: null,
    },
    integrityReport: null,
    pipelineState,
    knowledgeGraph: knowledgeGraph || knowledgeData.knowledgeGraph,
    userHelp: [],
    views: knowledgeData.views,
    workflows: knowledgeData.workflows,
    components: knowledgeData.components,
    layerSummary: knowledgeData.layerSummary || [],
    docsList,
    healthSummary,

    // Real-time system data
    systemMetrics,
    projectMetrics,
  });
});

export const GET = withTracing(handler, 'GET /api/intelligence');
