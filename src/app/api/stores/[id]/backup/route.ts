/**
 * @file GET /api/stores/[id]/backup
 * @description Exporta un respaldo de la tienda en formato JSON | PDF | XLSX.
 *
 * Query params:
 *   - format: 'json' | 'pdf' | 'xlsx'   (default: 'json')
 *   - range:  'all'  | 'year' | 'month' (default: 'all')
 *   - year:   number  (requerido si range=year|month)
 *   - month:  1-12    (requerido si range=month)
 *
 * AUTORIZACIÓN:
 *   - admin global → acceso a cualquier tienda
 *   - encargado/manager/admin de la tienda → acceso a su tienda
 *   - Ver canManageStore() para detalles.
 *
 * RATE LIMIT: 5 backups / hora / usuario (los backups pueden ser pesados).
 *
 * AUDIT: registra en audit_logs la operación con metadata (formato, rango,
 *   conteo de registros, tamaño del archivo).
 *
 * SECURITY: usa el service-role admin client para bypassar RLS una vez
 *   validada la autorización con canManageStore().
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { generateBackup, type BackupFormat, type BackupRange } from '@/lib/backup/backup-service';

/**
 * Rate limit: 5 exports por hora por usuario.
 * Los backups pueden escanear tablas grandes (ventas históricas) y
 * generar archivos pesados; este límite protege contra abuso.
 */
const BACKUP_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxRequests: 5 };

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const rlKey = `stores:backup:${session.user.id}:${clientIp}`;
  const { allowed, remaining } = await rateLimit(rlKey, BACKUP_RATE_LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { ...createApiError('RATE_LIMITED'), message: 'Límite de 5 backups por hora excedido' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } },
    );
  }

  // ── CSRF (los exports son GET pero validamos origin igualmente) ────────────
  if (!validateOrigin(req)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }

  // ── Extract storeId from URL ──────────────────────────────────────────────
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const storesIdx = pathParts.indexOf('stores');
  const storeId = storesIdx >= 0 ? pathParts[storesIdx + 1] : null;

  if (!storeId) {
    return NextResponse.json(createApiError('INVALID_STORE_ID'), { status: 400 });
  }

  // ── Authorization ─────────────────────────────────────────────────────────
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(
      { ...createApiError('FORBIDDEN'), message: 'No tienes permisos para hacer backup de esta tienda' },
      { status: 403 },
    );
  }

  // ── Parse query params ────────────────────────────────────────────────────
  const sp = url.searchParams;
  const format = (sp.get('format') || 'json') as BackupFormat;
  const range = (sp.get('range') || 'all') as BackupRange;
  const year = sp.get('year') ? Number(sp.get('year')) : undefined;
  const month = sp.get('month') ? Number(sp.get('month')) : undefined;

  if (!['json', 'pdf', 'xlsx'].includes(format)) {
    return NextResponse.json(
      { ...createApiError('BAD_REQUEST'), message: 'format debe ser json, pdf o xlsx' },
      { status: 400 },
    );
  }
  if (!['all', 'year', 'month'].includes(range)) {
    return NextResponse.json(
      { ...createApiError('BAD_REQUEST'), message: 'range debe ser all, year o month' },
      { status: 400 },
    );
  }
  if (range === 'year' && (!year || year < 2000 || year > 2100)) {
    return NextResponse.json(
      { ...createApiError('BAD_REQUEST'), message: 'year requerido y debe estar entre 2000 y 2100' },
      { status: 400 },
    );
  }
  if (range === 'month' && (!year || !month || month < 1 || month > 12)) {
    return NextResponse.json(
      { ...createApiError('BAD_REQUEST'), message: 'year y month requeridos (month 1-12)' },
      { status: 400 },
    );
  }

  // ── Generate backup ───────────────────────────────────────────────────────
  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
  }

  try {
    const result = await generateBackup(supabase, { storeId, format, range, year, month });

    // ── Audit log (fire and forget — don't block response) ────────────────
    try {
      await supabase.from('audit_logs').insert({
        user_id: session.user.id,
        action: 'STORE_BACKUP_EXPORT',
        table_name: 'stores',
        record_id: storeId,
        new_data: {
          format,
          range,
          year,
          month,
          filename: result.filename,
          totalBytes: result.totalBytes,
          recordCounts: result.recordCounts,
        },
      });
    } catch (auditErr) {
      // No bloquear el backup por un fallo de auditoría; solo loguear.
      logger.warn('AUDIT', 'BACKUP_AUDIT_LOG_FAILED', {
        storeId, userId: session.user.id, error: String(auditErr),
      });
    }

    logger.info('AUDIT', 'STORE_BACKUP_EXPORTED', {
      storeId, userId: session.user.id, format, range,
      totalBytes: result.totalBytes, filename: result.filename,
    });

    // ── Stream binary response ────────────────────────────────────────────
    // Convert Uint8Array → ArrayBuffer for NextResponse compatibility.
    const arrayBuffer = result.data.buffer.slice(
      result.data.byteOffset,
      result.data.byteOffset + result.data.byteLength,
    ) as ArrayBuffer;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': String(result.totalBytes),
        'X-Backup-Total-Records': String(
          Object.values(result.recordCounts).reduce((a, b) => a + b, 0),
        ),
        'X-RateLimit-Remaining': String(remaining),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('AUDIT', 'STORE_BACKUP_FAILED', {
      storeId, userId: session.user.id, format, range, error: message,
    });
    return NextResponse.json(
      { ...createApiError('UNKNOWN_ERROR'), message },
      { status: 500 },
    );
  }
}

export const GET = withTracing(
  withAuth(getHandler) as Parameters<typeof withTracing>[0],
  'GET /api/stores/[id]/backup',
);
