import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { z } from 'zod';
import { uuidRegex } from '@/validation/schemas';

const closeSchema = z.object({
  closure_id: z.string().regex(uuidRegex),
  declared_cash: z.number().min(0),
  declared_vouchers: z.number().min(0),
  // MISIÓN CAJA v2.24.0 (D8): efectivo USD contado al cerrar (lado físico
  // USD del arqueo). DEFAULT 0 — compatibilidad con cierres que no lo cuenten.
  declared_cash_usd: z.number().min(0).default(0),
  notes: z.string().max(1000).optional(),
  // COSTPRO-FINAL-CYCLE-CLOSE-001 (T4): evidencia del cierre con ventas
  // pendientes de sincronización. Campo ADITIVO: el cierre se ejecuta igual;
  // solo queda la traza en audit_logs (mecanismo existente, sin PII). El rol
  // de supervisor se verifica AQUÍ con la sesión — jamás desde el cliente.
  audit_pending_sales: z
    .object({
      storeId: z.string().regex(uuidRegex).nullable().optional(),
      pending: z.number().int().min(0),
      conflict: z.number().int().min(0),
      decidedBy: z.enum(['operator', 'supervisor']),
      outcome: z.literal('cerrada_con_pendientes'),
    })
    .optional(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { allowed } = await rateLimit(`cash-close:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json();
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  // COSTPRO-FINAL-CYCLE-CLOSE-001 (T4): si el cierre se confirma CON ventas
  // en conflicto, la autorización debe ser de supervisor/admin verificada
  // con la SESIÓN del servidor. Un operador ordinario que declare
  // decidedBy='supervisor' se rechaza aquí (el RPC no se ejecuta).
  const auditInfo = parsed.data.audit_pending_sales;
  if (auditInfo && auditInfo.conflict > 0) {
    const role = (session.user as { role?: string }).role;
    const isPrivileged = role === 'admin' || role === 'superadmin';
    if (auditInfo.decidedBy === 'supervisor' && !isPrivileged) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Cerrar con ventas en conflicto requiere supervisor o administrador (verificado en servidor).' },
        { status: 403 },
      );
    }
    if (auditInfo.decidedBy === 'operator') {
      // El operador solo puede continuar con pendientes SIN conflicto.
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Existen ventas en conflicto: se requiere supervisor o administrador.' },
        { status: 403 },
      );
    }
  }

  // T4: traza en audit_logs ANTES del RPC (mecanismo existente, sin PII —
  // conteos, tienda, quién decidió). El CHECK audit_logs_store_id_check
  // exige store_id para taballas no globales: sin storeId conocido se usa
  // table_name='system' (patrón de 20261108140000). Fail-open deliberado
  // para la AUDITORÍA (el cierre operativo no se bloquea por fallo de log).
  if (auditInfo) {
    const storeIdForAudit = auditInfo.storeId ?? null;
    try {
      const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
        user_id: session.user.id,
        action: 'cash_closure_with_pending_sales',
        table_name: storeIdForAudit ? 'cash_closures' : 'system',
        record_id: parsed.data.closure_id,
        store_id: storeIdForAudit,
        metadata: {
          pending_sales: auditInfo.pending,
          conflict_sales: auditInfo.conflict,
          decided_by: auditInfo.decidedBy,
          decided_by_role: (session.user as { role?: string }).role,
          outcome: auditInfo.outcome,
          source: 'server',
          detail: 'Cierre de turno confirmado con ventas pendientes de sincronización. Las ventas conservan su turno original y siguen en la cola de sincronización.',
          timestamp: new Date().toISOString(),
        },
      });
      if (auditError) {
        console.error('[cash-closures/close] auditoría pendientes falló:', auditError.message);
      }
    } catch (e) {
      console.error('[cash-closures/close] auditoría pendientes excepción:', String(e));
    }
  }

  const { data, error } = await supabaseAdmin.rpc('close_cash_shift', {
    p_closure_id: parsed.data.closure_id,
    p_declared_cash: parsed.data.declared_cash,
    p_declared_vouchers: parsed.data.declared_vouchers,
    // MISIÓN CAJA v2.24.0 (D8): parámetro posicional 4 del RPC vivo
    // (p_declared_cash_usd) — el arqueo USD se registra sin autoajuste.
    p_declared_cash_usd: parsed.data.declared_cash_usd ?? 0,
    p_notes: parsed.data.notes || null,
    p_user_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_CLOSURE_NOT_PENDING')) return NextResponse.json({ error: 'El cierre ya fue finalizado' }, { status: 409 });
    if (msg.includes('ERR_CLOSURE_NOT_FOUND')) return NextResponse.json({ error: 'Cierre no encontrado' }, { status: 404 });
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const POST = withTracing(
  withAuth(postHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/cash-closures/close'
);
