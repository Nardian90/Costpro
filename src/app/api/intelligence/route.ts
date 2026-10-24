import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * SALUD — API honesta (rediseño 2026-10-24, misión «Sistema → Salud»).
 *
 * Semántica de cada comprobación (FASE D — documentación interna):
 *
 * | Fuente            | Consulta                                     | Tipo        | Frecuencia                | Éxito                          | Errores                     |
 * |-------------------|----------------------------------------------|-------------|---------------------------|--------------------------------|-----------------------------|
 * | api               | Respuesta de ESTE endpoint                   | Instantáneo | Carga de vista + refresco | HTTP 200 con payload válido    | 401/403/500 (no hay body)   |
 * | database          | head-count de SOLO LECTURA sobre `stores`    | Instantáneo | Carga de vista + refresco | Sin error y < 5 s              | status 'error' + detalle    |
 * | auth              | Sesión admin validada por `withRole`         | Instantáneo | Cada solicitud            | Middleware no rechazó          | 401 antes de llegar aquí    |
 * | knowledgeSources  | fs.statSync + JSON.parse por artefacto       | Instantáneo | Carga de vista + refresco | existe + parsea sin errores    | missing / parse_error       |
 * | docsList          | readdirSync recursivo (knowledge/docs, help) | Instantáneo | Carga de vista + refresco | listado sin lanzar excepción   | lista vacía                 |
 *
 * - NO hay métricas almacenadas ni agregación temporal: cada dato se obtiene
 *   en el momento de la solicitud. La vista se actualiza SOLO bajo demanda
 *   (carga inicial o botón «Refrescar núcleo») — no es «tiempo real».
 * - La comprobación de BD usa el cliente admin EXISTENTE (mismo que usa el
 *   middleware de autenticación), es de solo lectura (head-count, sin filas)
 *   y NO devuelve datos de tiendas a la respuesta.
 * - El grafo de conocimiento (404 KB) solo se incluye con `?include=graph`
 *   para no penalizar cada refresco.
 * - Los artefactos de knowledge/ son instantáneas ESTÁTICAS del repositorio:
 *   cambian únicamente con cada despliegue, no en tiempo de ejecución.
 */

// ─── Tipos del contrato ──────────────────────────────────────────────────────

export type CheckStatus = 'ok' | 'error';

interface CheckResult {
  name: string;
  status: CheckStatus;
  latencyMs: number | null;
  checkedAt: string;
  detail: string;
}

type KnowledgeSourceStatus = 'ok' | 'missing' | 'parse_error';

interface KnowledgeSourceInfo {
  name: string;
  path: string;
  kind: string;
  description: string;
  status: KnowledgeSourceStatus;
  sizeBytes: number | null;
  lastModified: string | null;
}

// ─── Fuentes de conocimiento declaradas (instantáneas estáticas del repo) ────

const KNOWLEDGE_SOURCES: Array<Omit<KnowledgeSourceInfo, 'status' | 'sizeBytes' | 'lastModified'>> = [
  {
    name: 'Métricas de arquitectura',
    path: 'knowledge/architecture/architecture_metrics.json',
    kind: 'Instantánea estática',
    description: 'Análisis estático de componentes del repositorio: fan-in/fan-out, acoplamiento y capas.',
  },
  {
    name: 'Grafo de dependencias',
    path: 'knowledge/architecture/architecture_graph.json',
    kind: 'Instantánea estática',
    description: 'Grafo de dependencias entre archivos del repositorio en el momento del análisis.',
  },
  {
    name: 'Manifiesto de arquitectura',
    path: 'knowledge/architecture/system_architecture.json',
    kind: 'Instantánea estática',
    description: 'Manifiesto de componentes del repositorio generado por el análisis de arquitectura.',
  },
  {
    name: 'Grafo de conocimiento',
    path: 'knowledge/knowledge_graph.json',
    kind: 'Instantánea estática',
    description: 'Nodos y relaciones de dominio extraídos del análisis del repositorio.',
  },
  {
    name: 'Cola de revisión',
    path: 'docs/automation/review_queue.json',
    kind: 'Instantánea estática',
    description: 'Cola de artefactos pendientes de revisión registrada en el repositorio.',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJsonFile(relPath: string): { parsed: any | null; parseError: boolean } {
  try {
    const fullPath = path.join(/*turbopackIgnore: true*/process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) return { parsed: null, parseError: false };
    return { parsed: JSON.parse(fs.readFileSync(fullPath, 'utf8')), parseError: false };
  } catch {
    return { parsed: null, parseError: true };
  }
}

function readAppVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/process.cwd(), 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'desconocida';
  } catch {
    return 'desconocida';
  }
}

const DB_CHECK_TIMEOUT_MS = 5_000;

/** Comprobación de conectividad a BD: head-count de SOLO lectura sobre `stores`. */
async function checkDatabase(): Promise<CheckResult> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const client = await getSupabaseAdminClient();
    const query = client.from('stores').select('id', { count: 'exact', head: true });
    // Evita unhandled rejection si el timeout gana la carrera.
    Promise.resolve(query).catch(() => undefined);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DB_CHECK_TIMEOUT')), DB_CHECK_TIMEOUT_MS)
    );
    const result = (await Promise.race([query, timeout])) as { error?: { message?: string } } | undefined;
    const latencyMs = Date.now() - startedAt;

    if (result && result.error) {
      const raw = typeof result.error.message === 'string' ? result.error.message.slice(0, 120) : 'Error de conexión';
      return {
        name: 'Base de datos',
        status: 'error',
        latencyMs,
        checkedAt,
        detail: raw,
      };
    }
    return {
      name: 'Base de datos',
      status: 'ok',
      latencyMs,
      checkedAt,
      detail: 'Consulta de solo lectura completada',
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startedAt;
    const detail =
      err?.message === 'DB_CHECK_TIMEOUT'
        ? `Tiempo de espera agotado (${DB_CHECK_TIMEOUT_MS / 1000} s)`
        : 'No se pudo conectar con la base de datos';
    return { name: 'Base de datos', status: 'error', latencyMs, checkedAt, detail };
  }
}

function listMarkdownFilesRecursive(dir: string, base = ''): string[] {
  const results: string[] = [];
  try {
    const fullPath = path.join(/*turbopackIgnore: true*/process.cwd(), dir);
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
  } catch {
    // Listado best-effort: sin directorio → lista vacía.
  }
  return results;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

const handler = withRole('admin', async (req: NextRequest) => {
  const startedAt = Date.now();

  // ── Comprobación de BD (real, solo lectura) ──
  const database = await checkDatabase();

  // La respuesta de este endpoint ES la comprobación de API y sesión:
  // si el código llega aquí, withRole validó la sesión admin y el endpoint
  // está operativo. La latencia total se mide al armar la respuesta.
  const now = new Date().toISOString();
  const api: CheckResult = {
    name: 'API',
    status: 'ok',
    latencyMs: null, // Se completa justo antes de responder.
    checkedAt: now,
    detail: 'Endpoint operativo',
  };
  const auth: CheckResult = {
    name: 'Sesión',
    status: 'ok',
    latencyMs: null,
    checkedAt: now,
    detail: 'Sesión de administrador validada',
  };

  const checks = { api, database, auth };
  const passed = Object.values(checks).filter((c) => c.status === 'ok').length;
  const total = Object.values(checks).length;
  const checkSummary = {
    total,
    passed,
    failed: total - passed,
    status: database.status === 'ok' ? ('ok' as const) : ('degraded' as const),
  };

  // ── Fuentes de conocimiento (existencia + lectura + mtime reales) ──
  const knowledgeSources: KnowledgeSourceInfo[] = KNOWLEDGE_SOURCES.map((source) => {
    const checkedAt = new Date().toISOString();
    try {
      const fullPath = path.join(/*turbopackIgnore: true*/process.cwd(), source.path);
      if (!fs.existsSync(fullPath)) {
        return { ...source, status: 'missing' as const, sizeBytes: null, lastModified: null };
      }
      const stat = fs.statSync(fullPath);
      const { parseError } = readJsonFile(source.path);
      return {
        ...source,
        status: parseError ? ('parse_error' as const) : ('ok' as const),
        sizeBytes: stat.size,
        lastModified: stat.mtime.toISOString(),
      };
    } catch {
      return { ...source, status: 'parse_error' as const, sizeBytes: null, lastModified: null };
    }
  });
  const sourcesOk = knowledgeSources.filter((s) => s.status === 'ok').length;

  // ── Resumen de contenido (solo de artefactos que leyeron correctamente) ──
  const metrics = knowledgeSources[0].status === 'ok' ? readJsonFile(KNOWLEDGE_SOURCES[0].path).parsed : null;
  const systemArtifact =
    knowledgeSources[2].status === 'ok' ? readJsonFile(KNOWLEDGE_SOURCES[2].path).parsed : null;
  const knowledgeGraphFile =
    knowledgeSources[3].status === 'ok' ? readJsonFile(KNOWLEDGE_SOURCES[3].path).parsed : null;

  const workflowNodes: any[] = knowledgeGraphFile?.nodes?.filter((n: any) => n.group === 'workflow') ?? [];
  const appViews: any[] = systemArtifact?.components?.filter((c: any) => c.layer === 'Application') ?? [];
  const contentSummary = metrics
    ? {
        components: metrics?.summary?.total_components ?? metrics?.components?.length ?? 0,
        layers: Object.keys(metrics?.summary?.layer_distribution ?? {}).length,
        workflows: workflowNodes.length,
        graphNodes: knowledgeGraphFile?.nodes?.length ?? 0,
        graphLinks: knowledgeGraphFile?.links?.length ?? knowledgeGraphFile?.edges?.length ?? 0,
        appViews: appViews.length,
      }
    : null;

  // ── Documentación (listado real de archivos .md) ──
  const docsList = [
    ...listMarkdownFilesRecursive('knowledge/docs', 'docs'),
    ...listMarkdownFilesRecursive('knowledge/help', 'help'),
  ];

  // ── Grafo bajo demanda (?include=graph) — 404 KB, no en cada refresco ──
  const includeGraph = req.nextUrl?.searchParams?.get('include') === 'graph';
  const knowledgeGraph = includeGraph && knowledgeGraphFile
    ? { nodes: knowledgeGraphFile.nodes ?? [], links: knowledgeGraphFile.links ?? knowledgeGraphFile.edges ?? [] }
    : undefined;

  api.latencyMs = Date.now() - startedAt;

  return NextResponse.json({
    app: {
      version: readAppVersion(),
      environment: process.env.NODE_ENV ?? 'desconocido',
    },
    generatedAt: now,
    checks,
    checkSummary,
    knowledgeSources,
    sourcesSummary: { total: knowledgeSources.length, ok: sourcesOk, failed: knowledgeSources.length - sourcesOk },
    contentSummary,
    docsList,
    docsSummary: { count: docsList.length },
    ...(knowledgeGraph ? { knowledgeGraph } : {}),
  });
});

export const GET = withTracing(handler, 'GET /api/intelligence');
