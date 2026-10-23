/**
 * Iteración 11.5 → CP-INFRA-002b — Pruebas PT-11.5.x ACTUALIZADAS.
 *
 * CP-INFRA-002b (2026-10-23): OpenTelemetry fue RETIRADO del runtime por
 * decisión del propietario (mandato §4: «El propietario no necesita
 * OpenTelemetry en este momento»). Este archivo originalmente verificaba la
 * IMPLEMENTACIÓN de OTel; ahora verifica el CONTRATO DE RETIRADA:
 *
 *   PT-11.5.1 — Las migraciones históricas de BD NO se tocan (datos preservados).
 *   PT-11.5.2 — Ningún archivo runtime importa @opentelemetry/*.
 *   PT-11.5.3 — El barril observability conserva la superficie pública
 *               (withTracing, logger, spans no-op) para los ~130 importadores.
 *   PT-11.5.4 — withTracing sigue haciendo logging estructurado (sin spans).
 *   PT-11.5.5 — sanitizer.ts se conserva (utilidad de sanitización pura).
 *   PT-11.5.6 — supabase-traced.ts eliminado; supabase-admin devuelve el
 *               cliente sin envolver (auditoría de negocio intacta).
 *   PT-11.5.7 — logger.ts conserva getTraceContext en su interfaz (ahora {}).
 *   PT-11.5.10/11 — El esquema SQL de trace_id en audit_logs se conserva
 *               (columnas/triggers intactos en BD; solo ya no se rellenan).
 *   PT-11.5.12 — Regresión de iteraciones anteriores.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const SRC_DIR = join(process.cwd(), 'src');


/**
 * Strips comments (block + line) so that the negative assertions below test
 * ACTIVE code only — the retirement explanations themselves legitimately
 * mention the retired symbols in comments.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Recolecta todos los archivos .ts/.tsx de src/ (excluye tests). */
function collectRuntimeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      collectRuntimeFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('PT-11.5.1 — Migrations de Iteración 11.5 (datos históricos preservados)', () => {
  const expected = [
    '20260811000001_v2_20_1_audit_logs_trace_id.sql',
    '20260811000002_v2_20_2_rpc_trace_id.sql',
  ];
  for (const f of expected) {
    it(`${f} existe`, () => {
      expect(readdirSync(MIGRATIONS_DIR)).toContain(f);
    });
    it(`${f} tiene DOWN`, () => {
      expect(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8')).toContain('DOWN');
    });
  }
});

describe('PT-11.5.2 — CP-INFRA-002b: cero imports de OpenTelemetry en runtime', () => {
  it('ningún archivo .ts/.tsx de src/ (fuera de tests) importa @opentelemetry', () => {
    const offenders: string[] = [];
    for (const file of collectRuntimeFiles(SRC_DIR)) {
      const src = stripComments(readFileSync(file, 'utf-8'));
      if (/from\s+['"]@opentelemetry|require\(['"]@opentelemetry|import\(['"]@opentelemetry/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
  it('src/instrumentation.ts (entry OTel puro) fue eliminado', () => {
    expect(existsSync(join(SRC_DIR, 'instrumentation.ts'))).toBe(false);
  });
  it('src/lib/observability/tracing.ts (setupTracing del SDK) fue eliminado', () => {
    expect(existsSync(join(SRC_DIR, 'lib', 'observability', 'tracing.ts'))).toBe(false);
  });
  it('src/types/otel-modules.d.ts fue eliminado', () => {
    expect(existsSync(join(SRC_DIR, 'types', 'otel-modules.d.ts'))).toBe(false);
  });
  it('package.json ya no declara el SDK OTel propio (los 5 paquetes retirados)', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    // Los 5 paquetes del SDK propio (retirados por CP-INFRA-002b) deben seguir fuera.
    expect(all['@opentelemetry/api']).toBeUndefined();
    expect(all['@opentelemetry/sdk-node']).toBeUndefined();
    expect(all['@opentelemetry/resources']).toBeUndefined();
    expect(all['@opentelemetry/sdk-trace-base']).toBeUndefined();
    expect(all['@opentelemetry/semantic-conventions']).toBeUndefined();
  });
  it('solo permanecen los 2 pares @opentelemetry/* que @sentry/node-core REQUIERE (peers declarados)', () => {
    // Evidencia del build fallido dpl_FZyM2zM9ALHC (e1fac2535): sin copia
    // top-level de estos peers, @sentry/node-core no carga en el build de
    // Vercel (Sentry v10 se construye sobre OTel). Son dependencias de la
    // arquitectura de Sentry, NO de nuestro tracing (retirado).
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    const otel = Object.keys(all).filter((k) => k.startsWith('@opentelemetry/'));
    expect(otel.sort()).toEqual(['@opentelemetry/exporter-trace-otlp-http', '@opentelemetry/instrumentation']);
  });
  it('next.config.ts ya no externaliza paquetes OTel', () => {
    const cfg = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8');
    expect(cfg).not.toContain("'@opentelemetry/");
  });
  it('instrumentation.ts raíz conserva Sentry y los handlers de proceso', () => {
    const src = readFileSync(join(process.cwd(), 'instrumentation.ts'), 'utf-8');
    expect(src).toContain('unhandledRejection');
    expect(src).toContain('uncaughtException');
    const active = stripComments(src);
    expect(active).not.toContain('setupTracing');
    expect(active).not.toContain('@opentelemetry');
  });
});

describe('PT-11.5.3 — Barril observability: superficie pública intacta (spans no-op)', () => {
  const barrel = readFileSync(join(SRC_DIR, 'lib', 'observability', 'index.ts'), 'utf-8');
  it('exporta withTracing', () => expect(barrel).toContain('withTracing'));
  it('exporta logger (logInfo/logWarn/logError/logDebug)', () => {
    expect(barrel).toContain('logInfo');
    expect(barrel).toContain('logError');
  });
  it('exporta la superficie de tracing (no-op, misma interfaz)', () => {
    expect(barrel).toContain('withActiveSpan');
    expect(barrel).toContain('SpanStatusCode');
  });
  it('tracing-core.ts ya no importa @opentelemetry/api', () => {
    const src = readFileSync(join(SRC_DIR, 'lib', 'observability', 'tracing-core.ts'), 'utf-8');
    expect(stripComments(src)).not.toContain('@opentelemetry');
  });
});

describe('PT-11.5.4 — withTracing: logging estructurado conservado (sin spans)', () => {
  const src = readFileSync(join(SRC_DIR, 'lib', 'observability', 'api-tracing.ts'), 'utf-8');
  it('registra duración y status de cada request', () => {
    expect(src).toContain('Date.now()');
    expect(src).toContain('statusCode');
  });
  it('logError en fallos y re-throw del error original', () => {
    expect(src).toContain('logError');
    expect(src).toContain('throw error');
  });
  it('sin spans ni OTel', () => {
    const active = stripComments(src);
    expect(active).not.toContain('withActiveSpan');
    expect(active).not.toContain('@opentelemetry');
  });
});

describe('PT-11.5.5 — sanitizer.ts (utilidad pura conservada)', () => {
  const src = readFileSync(join(SRC_DIR, 'lib', 'observability', 'sanitizer.ts'), 'utf-8');
  it('filtra datos sensibles', () => {
    expect(src).toContain("'password'");
    expect(src).toContain("'token'");
  });
  it('exporta sanitizeAttributes', () => {
    expect(src).toContain('export function sanitizeAttributes');
  });
});

describe('PT-11.5.6 — supabase-traced retirado; clientes sin envolver', () => {
  it('src/lib/supabase-traced.ts fue eliminado', () => {
    expect(existsSync(join(SRC_DIR, 'lib', 'supabase-traced.ts'))).toBe(false);
  });
  it('supabase-admin.ts ya no envuelve con wrapRpcWithTracing', () => {
    const src = readFileSync(join(SRC_DIR, 'lib', 'supabase-admin.ts'), 'utf-8');
    expect(stripComments(src)).not.toContain('wrapRpcWithTracing');
  });
  it('supabase-session.ts ya no envuelve con wrapRpcWithTracing', () => {
    const src = readFileSync(join(SRC_DIR, 'lib', 'supabase-session.ts'), 'utf-8');
    expect(stripComments(src)).not.toContain('wrapRpcWithTracing');
  });
});

describe('PT-11.5.10 — audit_logs.trace_id: esquema SQL preservado', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260811000001_v2_20_1_audit_logs_trace_id.sql'), 'utf-8');
  it('ADD COLUMN trace_id text (columna conservada en BD)', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS trace_id text');
  });
  it('CREATE INDEX', () => {
    expect(sql).toContain('idx_audit_logs_trace_id');
  });
});

describe('PT-11.5.11 — Trigger set_audit_log_trace_id (intacto en BD)', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260811000002_v2_20_2_rpc_trace_id.sql'), 'utf-8');
  it('trigger function existe', () => {
    expect(sql).toContain('set_audit_log_trace_id');
  });
  it('NO modifica ningún RPC existente', () => {
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.create_sale_v2');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.close_cash_shift');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.reverse_transaction_v2');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.create_devolution_v2');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.void_transaction');
  });
});

describe('PT-11.5.12 — Regresión', () => {
  it('tests de iteraciones anteriores presentes', () => {
    const testFiles = readdirSync(join(process.cwd(), 'src', '__tests__', 'integration'));
    expect(testFiles).toContain('iteration-11-1.test.ts');
    expect(testFiles).toContain('iteration-11-2.test.ts');
    expect(testFiles).toContain('iteration-11-3.test.ts');
    expect(testFiles).toContain('iteration-11-4.test.ts');
    expect(testFiles).toContain('iteration-12.test.ts');
    expect(testFiles).toContain('iteration-13.test.ts');
    expect(testFiles).toContain('iteration-fiscal.test.ts');
  });
  it('FINALIZE-V2: USE_V2_CHECKOUT eliminado (V2 único camino)', () => {
    expect(existsSync(join(process.cwd(), 'src', 'config', 'features.ts'))).toBe(false);
  });
});
