import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { supabase } from '@/lib/supabaseClient';
import { randomUUID } from 'node:crypto';

/**
 * /api/legal/incidents — F9.D (Decisión D ratificada, 2026-10-20)
 *
 * ANTES (deprecado en este cambio): el POST persistía en `data/incidents.json`
 * (archivo local del servidor) y NO existía GET. Sin durabilidad de BD, sin
 * aislamiento multi-tenant del legajo y sin lectura posible.
 *
 * AHORA:
 *   POST — usuarios autenticados reportan incidentes; se escribe en
 *         `audit_logs` con action='legal_incident' (cliente admin para bypass
 *         de RLS, patrón de audit-service) en una sola fila atómica.
 *   GET  — SOLO admin (contrato withRole('admin'): 401 sin sesión, 403 sin rol)
 *         con paginación (limit/offset) leyendo audit_logs por action.
 *
 * La migración 20261020000005 añade el índice parcial que sostiene el GET.
 * `data/incidents.json` queda DEPRECADO: este endpoint no lo lee ni escribe.
 */

export const dynamic = 'force-dynamic';

// ── Zod schema del body (contrato F9.D) ──
const incidentSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title must be at most 200 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000, 'Description must be at most 5000 characters'),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  reporter: z.string().max(100, 'Reporter name must be at most 100 characters').optional(),
});

type Severity = 'critical' | 'high' | 'medium' | 'low';

// ── Helpers ──
function generateIncidentId(): string {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  // FIX-BUG-SEC-006: randomUUID (criptográficamente seguro), nunca Math.random
  const random = randomUUID().slice(0, 8).toUpperCase();
  return `INC-${dateStr}-${random}`;
}

// ── POST: reporte de incidentes → audit_logs (action='legal_incident') ──
async function postHandler(request: NextRequest) {
  // FIX-SEC-014: solo usuarios autenticados
  const session = await getServerSession(request);
  if (!session || !session.token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Rate limiting: 5/min por usuario
  const rlResult = await rateLimit(`incidents:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!rlResult.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((rlResult.resetAt.getTime() - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rlResult.resetAt.getTime() - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body. Expected a valid JSON object.' },
      { status: 400 }
    );
  }

  const parseResult = incidentSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return NextResponse.json(
      { success: false, error: 'Validation failed', details: errors },
      { status: 400 }
    );
  }

  const data = parseResult.data;
  const incidentId = generateIncidentId();
  const timestamp = new Date().toISOString();
  // record_id de audit_logs es uuid: identificador estable de la fila;
  // el id legible INC-… vive en new_data.incidentId.
  const recordId = randomUUID();

  const incidentRecord = {
    incidentId,
    title: data.title,
    description: data.description,
    severity: data.severity as Severity,
    reporter: data.reporter ?? session.user.email ?? session.user.id,
    status: 'open' as const,
    actionsTaken: ['Incident reported via API endpoint'],
    resolution: null,
    timeline: [
      {
        event: `Incident created via /api/legal/incidents by user ${session.user.id}`,
        timestamp,
      },
    ],
  };

  // FIX-AUDIT-RLS: cliente admin (service_role) para bypass de RLS en escrituras
  // de auditoría desde API routes — mismo patrón que audit-service.
  const client = getSupabaseAdminSafe() ?? supabase;
  const { error } = await client.from('audit_logs').insert({
    user_id: session.user.id,
    table_name: 'legal_incidents',
    record_id: recordId,
    action: 'legal_incident',
    new_data: incidentRecord,
    metadata: {
      source: '/api/legal/incidents',
      deprecated_file: 'data/incidents.json',
      client: 'api',
    },
  });

  if (error) {
    console.error('[INCIDENTS] Failed to write incident to audit_logs:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error. Could not store incident.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      incidentId,
      recordId,
      timestamp,
    },
    {
      status: 201,
      headers: {
        'X-RateLimit-Remaining': String(rlResult.remaining),
      },
    }
  );
}

// ── GET: SOLO admin, paginado, lee el legajo de incidentes ──
async function getHandler(req: NextRequest) {
  const url = new URL(req.url);
  const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
  const rawOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: 'Servicio de autenticación no disponible' },
      { status: 500 }
    );
  }

  const { data, error, count } = await admin
    .from('audit_logs')
    .select('record_id, user_id, new_data, metadata, created_at', { count: 'exact' })
    .eq('action', 'legal_incident')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[INCIDENTS] Failed to read incidents from audit_logs:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error. Could not read incidents.' },
      { status: 500 }
    );
  }

  const incidents = (data ?? []).map((row: Record<string, unknown>) => {
    const nd = (row.new_data ?? {}) as Record<string, unknown>;
    return {
      incidentId: nd.incidentId,
      title: nd.title,
      description: nd.description,
      severity: nd.severity,
      reporter: nd.reporter,
      status: nd.status,
      reportedBy: row.user_id,
      createdAt: row.created_at,
      metadata: row.metadata,
      recordId: row.record_id,
    };
  });

  return NextResponse.json({
    success: true,
    incidents,
    pagination: { total: count ?? 0, limit, offset },
  });
}

export const POST = withTracing(postHandler, 'POST /api/legal/incidents');
export const GET = withRole('admin', getHandler);
