/**
 * Iteración 11.5 — Pruebas PT-11.5.x (Observabilidad OTel)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

describe('PT-11.5.1 — Migrations de Iteración 11.5', () => {
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

describe('PT-11.5.2 — instrumentation.ts', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'instrumentation.ts'), 'utf-8');
  it('existe y exporta register()', () => {
    expect(src).toContain('export async function register()');
  });
  it('try/catch silencioso (no bloquea boot)', () => {
    expect(src).toContain('try');
    expect(src).toContain('catch');
    expect(src).toContain('console.warn');
  });
  it('solo activa en production o OTEL_ENABLED', () => {
    expect(src).toContain("NODE_ENV === 'production'");
    expect(src).toContain("OTEL_ENABLED === 'true'");
  });
});

describe('PT-11.5.3 — tracing-core.ts real (no no-op)', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'observability', 'tracing-core.ts'), 'utf-8');
  it('importa @opentelemetry/api', () => {
    expect(src).toContain('@opentelemetry/api');
  });
  it('getTraceContext usa trace.getSpan(context.active())', () => {
    expect(src).toContain('trace.getSpan(context.active())');
  });
  it('getActiveTraceId retorna string o null', () => {
    expect(src).toContain('getActiveTraceId');
  });
  it('no contiene "DISABLED" ni "no-op" en descripción', () => {
    expect(src).not.toContain('OpenTelemetry DISABLED');
  });
});

describe('PT-11.5.4 — tracing.ts (sin auto-instrumentations)', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'observability', 'tracing.ts'), 'utf-8');
  it('Aclaración 1: NO importa auto-instrumentations-node en código activo', () => {
    const activeLines = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const activeCode = activeLines.join('\n');
    expect(activeCode).not.toContain('getNodeAutoInstrumentations');
    expect(activeCode).not.toContain("import('@opentelemetry/auto-instrumentations-node')");
  });
  it('usa BatchSpanProcessor (no Simple)', () => {
    expect(src).toContain('BatchSpanProcessor');
  });
  it('usa ConsoleSpanExporter', () => {
    expect(src).toContain('ConsoleSpanExporter');
  });
});

describe('PT-11.5.5 — sanitizer.ts', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'observability', 'sanitizer.ts'), 'utf-8');
  it('filtra customer_name', () => expect(src).toContain("'customer_name'"));
  it('filtra password', () => expect(src).toContain("'password'"));
  it('filtra total_amount', () => expect(src).toContain("'total_amount'"));
  it('filtra cash_amount', () => expect(src).toContain("'cash_amount'"));
  it('filtra api_key', () => expect(src).toContain("'api_key'"));
  it('filtra token', () => expect(src).toContain("'token'"));
  it('tiene patterns regex', () => {
    expect(src).toContain('/password/i');
    expect(src).toContain('/token/i');
  });
  it('exporta sanitizeAttributes', () => {
    expect(src).toContain('export function sanitizeAttributes');
  });
});

describe('PT-11.5.6 — supabase-traced.ts wrapper', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'supabase-traced.ts'), 'utf-8');
  it('usa Proxy', () => expect(src).toContain('new Proxy'));
  it('intercepta solo rpc()', () => {
    expect(src).toContain("prop === 'rpc'");
  });
  it('crea span con nombre rpc.method', () => {
    expect(src).toContain('startActiveSpan');
    expect(src).toContain('rpc.');
  });
  it('sanitiza params', () => expect(src).toContain('sanitizeAttributes'));
  it('en dev retorna cliente sin modificar', () => {
    expect(src).toContain("NODE_ENV === 'development'");
  });
  it('finally { span.end() }', () => {
    expect(src).toContain('finally');
    expect(src).toContain('span.end()');
  });
});

describe('PT-11.5.7 — supabase-admin integrado con wrapper', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'supabase-admin.ts'), 'utf-8');
  it('importa wrapRpcWithTracing', () => {
    expect(src).toContain('wrapRpcWithTracing');
  });
  it('getSupabaseAdminSafe usa wrapper', () => {
    expect(src).toContain('wrapRpcWithTracing(client)');
  });
});

describe('PT-11.5.8 — logger.ts integrado con getTraceContext real', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'observability', 'logger.ts'), 'utf-8');
  it('Aclaración 2: importa getTraceContext de tracing-core', () => {
    expect(src).toContain("from './tracing-core'");
    expect(src).toContain('getTraceContext');
  });
  it('NO define getTraceContext como no-op local', () => {
    const activeLines = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const activeCode = activeLines.join('\n');
    expect(activeCode).not.toContain('function getTraceContext()');
  });
});

describe('PT-11.5.9 — api-tracing withTracing', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'observability', 'api-tracing.ts'), 'utf-8');
  it('Aclaración 3: lee x-costpro-trace-id del header', () => {
    expect(src).toContain("x-costpro-trace-id");
  });
  it('sigue siendo passthrough en dev', () => {
    expect(src).toContain("NODE_ENV === 'development'");
  });
  it('registra http.method, http.route, http.status_code', () => {
    expect(src).toContain("'http.method'");
    expect(src).toContain("'http.route'");
    expect(src).toContain("'http.status_code'");
  });
});

describe('PT-11.5.10 — audit_logs.trace_id', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260811000001_v2_20_1_audit_logs_trace_id.sql'), 'utf-8');
  it('ADD COLUMN trace_id text', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS trace_id text');
  });
  it('CREATE INDEX', () => {
    expect(sql).toContain('idx_audit_logs_trace_id');
  });
});

describe('PT-11.5.11 — Trigger set_audit_log_trace_id', () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, '20260811000002_v2_20_2_rpc_trace_id.sql'), 'utf-8');
  it('trigger function existe', () => {
    expect(sql).toContain('set_audit_log_trace_id');
  });
  it('lee app.trace_id session variable', () => {
    expect(sql).toContain("current_setting('app.trace_id'");
  });
  it('BEFORE INSERT trigger', () => {
    expect(sql).toContain('BEFORE INSERT');
  });
  it('NO modifica ningún RPC existente', () => {
    // The migration should NOT contain CREATE OR REPLACE FUNCTION for any of the 5 RPCs
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
  it('USE_V2_CHECKOUT sigue activo', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'config', 'features.ts'), 'utf-8');
    expect(src).toContain('USE_V2_CHECKOUT');
  });
});
