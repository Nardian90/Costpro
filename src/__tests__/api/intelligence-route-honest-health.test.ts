import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * MISIÓN «SISTEMA → SALUD» (2026-10-24) — Contrato honesto de /api/intelligence.
 * Corrección post-fusión (PR #1473 → #1475): timeout con temporizador cancelado
 * y errores públicos categorizados (sin detalles internos del proveedor).
 *
 * La suite verifica:
 *
 *   1. Gate de rol: withRole('admin', …) — vista admin-only (alineada con la
 *      navegación y con el precedente FIX-SEC-018 de /api/system-health).
 *   2. Comprobación de BD real: head-count de SOLO LECTURA sobre `stores`
 *      (count:'exact', head:true) — sin filas, sin escrituras, sin RPC.
 *   3. Ningún dato de tiendas viaja en la respuesta (solo estados y latencias).
 *   4. Fallo de BD → checkSummary 'degraded' (2/3), NUNCA como éxito.
 *   5. Fuentes de conocimiento: estado real de existencia/lectura + mtime;
 *      una fuente ausente o ilegible queda marcada, no oculta.
 *   6. Versión real de package.json (adiós «v9.0.0» inventado).
 *   7. Grafo solo con ?include=graph (el refresco base queda ligero).
 *   8. TIMEOUT: el temporizador se cancela en los tres caminos (éxito rápido,
 *      error rápido, timeout) y un timeout se reporta como fallo, jamás éxito.
 *   9. SANEAMIENTO: el detalle público nunca contiene el mensaje interno
 *      (SQL, hosts, puertos, claves); los logs solo registran la categoría.
 */

const { roleGate, dbResult, dbCalls, fsState, FIXTURES, keyFor } = vi.hoisted(() => {
  const FIXTURES: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'costpro', version: '0.2.0' }),
    'knowledge/architecture/architecture_metrics.json': JSON.stringify({
      summary: { total_components: 725, total_links: 1200, layer_distribution: { Application: 40, Services: 80 } },
      components: new Array(3).fill({ id: 'c' }),
    }),
    'knowledge/architecture/architecture_graph.json': JSON.stringify({ nodes: [], links: [] }),
    'knowledge/architecture/system_architecture.json': JSON.stringify({
      components: [{ id: 'v1', layer: 'Application' }, { id: 's1', layer: 'Services' }],
    }),
    'knowledge/knowledge_graph.json': JSON.stringify({
      nodes: [{ id: 'n1', group: 'workflow' }, { id: 'n2', group: 'feature' }],
      links: [{ source: 'n1', target: 'n2' }],
    }),
    'docs/automation/review_queue.json': JSON.stringify({ queue: [] }),
  };
  const keyFor = (absPath: string): string | undefined =>
    Object.keys(FIXTURES).find((k) => absPath.endsWith(k));
  return {
    roleGate: { value: '' },
    dbResult: { value: { error: null as { message: string } | null }, hang: false },
    dbCalls: { selectArgs: [] as any[], writes: [] as string[] },
    fsState: { forceMissing: new Set<string>(), overrides: {} as Record<string, string> },
    FIXTURES,
    keyFor,
  };
});

vi.mock('@/lib/auth-middleware', () => ({
  withRole: (role: string, fn: any) => {
    roleGate.value = role;
    return async (req: any) => fn(req, { user: { id: 'u1', role: 'admin' }, token: 't' });
  },
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (fn: any) => fn,
}));

vi.mock('fs', () => {
  const DIRS = ['knowledge/docs', 'knowledge/help'];
  const existsSync = (p: string) => {
    if (DIRS.some((d) => p.endsWith(d))) return true;
    const key = keyFor(p);
    if (!key) return false;
    if (fsState.forceMissing.has(key)) return false;
    return true;
  };
  const readFileSync = (p: string) => {
    const key = keyFor(p);
    if (!key) throw new Error('ENOENT');
    return fsState.overrides[key] ?? FIXTURES[key];
  };
  const statSync = (p: string) => {
    const key = keyFor(p);
    if (!key) throw new Error('ENOENT');
    return { size: 1024, mtime: new Date('2026-10-01T12:00:00Z') };
  };
  const readdirSync = (p: string) => {
    if (p.endsWith('knowledge/docs')) return [{ name: 'guide.md', isDirectory: () => false }];
    if (p.endsWith('knowledge/help')) return [{ name: 'help.md', isDirectory: () => false }];
    return [];
  };
  return { default: { existsSync, readFileSync, statSync, readdirSync }, existsSync, readFileSync, statSync, readdirSync };
});

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: async () => ({
    from: (table: string) => {
      if (table !== 'stores') throw new Error('UNEXPECTED-TABLE');
      return {
        select: (...args: any[]) => {
          dbCalls.selectArgs.push(args);
          // `hang` simula una consulta que nunca responde (gana el timeout).
          const outcome = () =>
            dbResult.hang ? new Promise<any>(() => {}) : Promise.resolve({ ...dbResult.value });
          return {
            then: (onFulfilled: any, onRejected: any) => outcome().then(onFulfilled, onRejected),
            catch: (cb: any) => outcome().catch(cb),
          };
        },
        insert: () => {
          dbCalls.writes.push('insert');
          throw new Error('WRITE-BLOCKED');
        },
        update: () => {
          dbCalls.writes.push('update');
          throw new Error('WRITE-BLOCKED');
        },
        delete: () => {
          dbCalls.writes.push('delete');
          throw new Error('WRITE-BLOCKED');
        },
        rpc: () => {
          dbCalls.writes.push('rpc');
          throw new Error('WRITE-BLOCKED');
        },
      };
    },
  }),
}));

// ─── Import de la ruta DESPUÉS de los mocks ─────────────────────────────────

import { GET } from '@/app/api/intelligence/route';

let warnSpy: ReturnType<typeof vi.spyOn>;

function makeRequest(includeGraph = false) {
  const url = `http://localhost:3000/api/intelligence${includeGraph ? '?include=graph' : ''}`;
  return { nextUrl: new URL(url), method: 'GET' } as any;
}

async function callRoute(includeGraph = false) {
  const response = await GET(makeRequest(includeGraph));
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  // NOTA: roleGate NO se resetea — withRole('admin', …) se ejecuta una única
  // vez en la importación del módulo (declaración del gate) y su valor debe
  // persistir para poder afirmarlo.
  dbResult.value = { error: null };
  dbResult.hang = false;
  dbCalls.selectArgs = [];
  dbCalls.writes = [];
  fsState.forceMissing.clear();
  fsState.overrides = {};
  // Silencia (y permite inspeccionar) el warn de categoría de la ruta.
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('GET /api/intelligence — Salud honesta', () => {
  it('declara el gate de rol admin-only (withRole("admin"))', async () => {
    await callRoute();
    expect(roleGate.value).toBe('admin');
  });

  it('comprueba la BD con una consulta de SOLO LECTURA (head-count, sin filas, sin escrituras)', async () => {
    const { body } = await callRoute();
    expect(dbCalls.writes).toEqual([]);
    expect(dbCalls.selectArgs.length).toBeGreaterThan(0);
    const [cols, opts] = dbCalls.selectArgs[0];
    expect(cols).toBe('id');
    expect(opts).toMatchObject({ count: 'exact', head: true });
    // La respuesta no transporta datos de tiendas: solo estados y latencias.
    expect(body.checks.database.status).toBe('ok');
    expect(typeof body.checks.database.latencyMs).toBe('number');
    expect(body).not.toHaveProperty('stores');
    expect(body.checks.database).not.toHaveProperty('count');
    expect(body.checks.database).not.toHaveProperty('rows');
  });

  it('reporta el estado global desde las comprobaciones ejecutadas (3/3 → ok, Operativo)', async () => {
    const { status, body } = await callRoute();
    expect(status).toBe(200);
    expect(body.checkSummary).toMatchObject({ total: 3, passed: 3, failed: 0, status: 'ok' });
    expect(body.checks.api.status).toBe('ok');
    expect(body.checks.auth.status).toBe('ok');
    expect(body.app.version).toBe('0.2.0');
    expect(body.app.environment).toBeDefined();
  });

  it('un fallo de BD se reporta como 2/3 «degraded», nunca como éxito (anti falso positivo)', async () => {
    dbResult.value = { error: { message: 'connection refused' } };
    const { body } = await callRoute();
    expect(body.checkSummary).toMatchObject({ total: 3, passed: 2, failed: 1, status: 'degraded' });
    expect(body.checks.database.status).toBe('error');
    // Detalle público categorizado: el texto interno «connection refused» NO viaja.
    expect(body.checks.database.detail).toMatch(/no se pudo conectar con la base de datos/i);
    expect(body.checks.database.detail).toMatch(/categoría: conectividad/i);
    expect(body.checks.database.detail).not.toContain('connection refused');
  });

  it('marca una fuente de conocimiento ausente como «missing» (no la oculta ni la inventa)', async () => {
    fsState.forceMissing.add('knowledge/architecture/architecture_metrics.json');
    const { body } = await callRoute();
    const metrics = body.knowledgeSources.find(
      (s: any) => s.path === 'knowledge/architecture/architecture_metrics.json'
    );
    expect(metrics.status).toBe('missing');
    expect(metrics.sizeBytes).toBeNull();
    expect(body.sourcesSummary).toMatchObject({ total: 5, ok: 4, failed: 1 });
    // Sin la métrica base no hay resumen de contenido: se declara No disponible.
    expect(body.contentSummary).toBeNull();
  });

  it('marca una fuente ilegible (JSON inválido) como «parse_error»', async () => {
    fsState.overrides['knowledge/architecture/architecture_metrics.json'] = '{not-json';
    const { body } = await callRoute();
    const metrics = body.knowledgeSources.find(
      (s: any) => s.path === 'knowledge/architecture/architecture_metrics.json'
    );
    expect(metrics.status).toBe('parse_error');
    expect(body.sourcesSummary.ok).toBe(4);
  });

  it('expone mtime real de las fuentes y lo usa como «última modificación»', async () => {
    const { body } = await callRoute();
    const okSource = body.knowledgeSources.find((s: any) => s.status === 'ok');
    expect(okSource.lastModified).toBe('2026-10-01T12:00:00.000Z');
    expect(okSource.sizeBytes).toBe(1024);
  });

  it('incluye el grafo SOLO con ?include=graph (refresco base ligero)', async () => {
    const base = await callRoute(false);
    expect(base.body.knowledgeGraph).toBeUndefined();

    const withGraph = await callRoute(true);
    expect(withGraph.body.knowledgeGraph).toBeDefined();
    expect(withGraph.body.knowledgeGraph.nodes.length).toBe(2);
    expect(withGraph.body.knowledgeGraph.links.length).toBe(1);
  });

  it('lista la documentación real y su recuento', async () => {
    const { body } = await callRoute();
    expect(body.docsList).toEqual(['docs/guide.md', 'help/help.md']);
    expect(body.docsSummary.count).toBe(2);
  });

  it('el resumen de contenido proviene de las instantáneas estáticas leídas (no de supuestos)', async () => {
    const { body } = await callRoute();
    expect(body.contentSummary).toMatchObject({
      components: 725,
      layers: 2,
      appViews: 1,
      workflows: 1,
      graphNodes: 2,
      graphLinks: 1,
    });
  });
});

describe('GET /api/intelligence — Gestión del temporizador de BD (corrección post-fusión)', () => {
  it('cancela el temporizador cuando la consulta responde antes del timeout (éxito rápido)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const { body } = await callRoute();
      expect(body.checks.database.status).toBe('ok');
      // El temporizador de 5 s quedó cancelado: nada residual tras el éxito.
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('cancela el temporizador cuando la consulta falla antes del timeout (error rápido)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      dbResult.value = { error: { message: 'connect ECONNREFUSED 10.0.2.15:5432' } };
      const { body } = await callRoute();
      expect(body.checks.database.status).toBe('error');
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('un timeout se comunica como fallo (degraded 2/3), nunca como éxito', async () => {
    vi.useFakeTimers();
    try {
      dbResult.hang = true; // la consulta nunca responde → gana el timeout de 5 s
      const pending = callRoute();
      await vi.advanceTimersByTimeAsync(5_100);
      const { body } = await pending;
      expect(body.checks.database.status).toBe('error');
      expect(body.checks.database.detail).toMatch(/tiempo de espera agotado/i);
      expect(body.checks.database.detail).toMatch(/categoría: tiempo de espera/i);
      expect(body.checkSummary).toMatchObject({ total: 3, passed: 2, failed: 1, status: 'degraded' });
      // El resto de comprobaciones se reporta con su estado real.
      expect(body.checks.api.status).toBe('ok');
      expect(body.checks.auth.status).toBe('ok');
    } finally {
      vi.useRealTimers();
      dbResult.hang = false;
    }
  });
});

describe('GET /api/intelligence — Errores públicos saneados (sin detalles internos)', () => {
  it('traduce un error de conexión conocido a mensaje público categorizado (sin host, puerto ni texto interno)', async () => {
    dbResult.value = { error: { message: 'connect ECONNREFUSED 10.0.2.15:5432 - connection refused' } };
    const { body } = await callRoute();
    expect(body.checks.database.status).toBe('error');
    expect(body.checks.database.detail).toMatch(/no se pudo conectar con la base de datos/i);
    expect(body.checks.database.detail).toMatch(/categoría: conectividad/i);
    // Ningún detalle interno viaja en la respuesta completa.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('ECONNREFUSED');
    expect(serialized).not.toContain('10.0.2.15');
    expect(serialized).not.toContain('5432');
    expect(serialized).not.toContain('connection refused');
    // Los logs solo registran la categoría, nunca el mensaje original.
    const logged = warnSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('ECONNREFUSED');
    expect(logged).toContain('conectividad');
  });

  it('devuelve un mensaje genérico para errores desconocidos (sin texto interno)', async () => {
    dbResult.value = { error: { message: 'unexpected token in GSS API request while negotiating' } };
    const { body } = await callRoute();
    expect(body.checks.database.status).toBe('error');
    expect(body.checks.database.detail).toMatch(/no pudo completarse/i);
    expect(body.checks.database.detail).toMatch(/categoría: desconocido/i);
    expect(JSON.stringify(body)).not.toContain('GSS');
  });

  it('traduce errores de autenticación sin exponer claves ni tokens', async () => {
    dbResult.value = { error: { message: 'Invalid API key: sb_secret_123456' } };
    const { body } = await callRoute();
    expect(body.checks.database.detail).toMatch(/autenticación o permisos insuficientes/i);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('sb_secret');
    expect(serialized).not.toContain('Invalid API key');
  });
});
