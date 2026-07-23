/**
 * @file POST /api/stores/[id]/backup/restore
 * @description Restaura un respaldo JSON en la tienda destino.
 *
 * Body:
 *   Content-Type: application/json
 *   {
 *     "content": "<JSON string of the backup file>",
 *     "upsert": true,        // optional, default true
 *     "dryRun": false        // optional, default false
 *   }
 *
 * O bien multipart/form-data con un campo "file" (el archivo JSON).
 *
 * AUTORIZACIÓN:
 *   - admin global → acceso a cualquier tienda
 *   - encargado/manager/admin de la tienda → acceso a su tienda
 *
 * RATE LIMIT: 3 restores / hora / usuario. El restore es destructivo (puede
 * sobreescribir datos existentes) — límite más bajo que el export.
 *
 * AUDIT: registra en audit_logs cada restore con resultado (inserted/skipped/
 *   errors).
 *
 * SECURITY:
 *   - Valida el formato del JSON antes de tocar la BD.
 *   - Reescribe store_id en cada fila para que coincida con la tienda destino
 *     (previene inyección de datos en otra tienda vía JSON manipulado).
 *   - No permite crear nuevas tiendas (la tabla 'stores' solo se UPDATE).
 *   - El service-role client bypassa RLS pero la autorización ya se validó.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { canManageStore } from '@/lib/roles';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { restoreFromBackup } from '@/lib/backup/backup-service';

const RESTORE_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxRequests: 3 };
const MAX_RESTORE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB cap

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const rlKey = `stores:restore-backup:${session.user.id}:${clientIp}`;
  const { allowed } = await rateLimit(rlKey, RESTORE_RATE_LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { ...createApiError('RATE_LIMITED'), message: 'Límite de 3 restauraciones por hora excedido' },
      { status: 429 },
    );
  }

  // ── CSRF ───────────────────────────────────────────────────────────────────
  if (!validateOrigin(req)) {
    return NextResponse.json(createApiError('INVALID_ORIGIN'), { status: 403 });
  }

  // ── Extract storeId from URL ──────────────────────────────────────────────
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const storesIdx = pathParts.indexOf('stores');
  const targetStoreId = storesIdx >= 0 ? pathParts[storesIdx + 1] : null;

  if (!targetStoreId) {
    return NextResponse.json(createApiError('INVALID_STORE_ID'), { status: 400 });
  }

  // ── Authorization ─────────────────────────────────────────────────────────
  if (!canManageStore(session.user, targetStoreId)) {
    return NextResponse.json(
      { ...createApiError('FORBIDDEN'), message: 'No tienes permisos para restaurar en esta tienda' },
      { status: 403 },
    );
  }

  // ── Extract content + options ─────────────────────────────────────────────
  let fileContent = '';
  let upsert = true;
  let dryRun = false;

  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ...createApiError('BAD_REQUEST'), message: 'Campo "file" requerido' },
          { status: 400 },
        );
      }
      if (file.size > MAX_RESTORE_SIZE_BYTES) {
        return NextResponse.json(
          { ...createApiError('BAD_REQUEST'), message: `Archivo excede 100 MB (recibido: ${file.size} bytes)` },
          { status: 413 },
        );
      }
      fileContent = await file.text();
      upsert = formData.get('upsert') !== 'false';
      dryRun = formData.get('dryRun') === 'true';
    } else {
      // Application/JSON path
      const body = await req.json();
      if (typeof body.content !== 'string') {
        return NextResponse.json(
          { ...createApiError('BAD_REQUEST'), message: 'Campo "content" (string) requerido' },
          { status: 400 },
        );
      }
      if (body.content.length > MAX_RESTORE_SIZE_BYTES) {
        return NextResponse.json(
          { ...createApiError('BAD_REQUEST'), message: 'Contenido excede 100 MB' },
          { status: 413 },
        );
      }
      fileContent = body.content;
      upsert = body.upsert !== false;
      dryRun = body.dryRun === true;
    }
  } catch (e) {
    return NextResponse.json(
      { ...createApiError('BAD_REQUEST'), message: `Body inválido: ${e instanceof Error ? e.message : ''}` },
      { status: 400 },
    );
  }

  // ── Run restore ───────────────────────────────────────────────────────────
  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const supabase = getSupabaseAdminSafe();
  if (!supabase) {
    return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
  }

  try {
    const result = await restoreFromBackup(supabase, targetStoreId, fileContent, { upsert, dryRun });

    // ── Audit log ──────────────────────────────────────────────────────────
    try {
      await supabase.from('audit_logs').insert({
        user_id: session.user.id,
        action: dryRun ? 'STORE_BACKUP_RESTORE_DRYRUN' : 'STORE_BACKUP_RESTORE',
        table_name: 'stores',
        record_id: targetStoreId,
        new_data: {
          upsert,
          dryRun,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
          errorsCount: result.errors.length,
          errors: result.errors.slice(0, 10), // cap audit payload
          durationMs: result.durationMs,
        },
      });
    } catch (auditErr) {
      logger.warn('AUDIT', 'RESTORE_AUDIT_LOG_FAILED', {
        storeId: targetStoreId, userId: session.user.id, error: String(auditErr),
      });
    }

    logger.info('AUDIT', 'STORE_BACKUP_RESTORED', {
      storeId: targetStoreId, userId: session.user.id, dryRun,
      inserted: result.inserted, updated: result.updated,
      skipped: result.skipped, errorsCount: result.errors.length,
    });

    const totalInserted = Object.values(result.inserted).reduce((a, b) => a + b, 0);
    const totalUpdated = Object.values(result.updated).reduce((a, b) => a + b, 0);
    const totalSkipped = Object.values(result.skipped).reduce((a, b) => a + b, 0);

    return NextResponse.json({
      success: true,
      dryRun,
      summary: {
        totalInserted,
        totalUpdated,
        totalSkipped,
        errorsCount: result.errors.length,
        durationMs: result.durationMs,
      },
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('AUDIT', 'STORE_BACKUP_RESTORE_FAILED', {
      storeId: targetStoreId, userId: session.user.id, error: message,
    });
    return NextResponse.json(
      { ...createApiError('UNKNOWN_ERROR'), message },
      { status: 500 },
    );
  }
}

export const POST = withTracing(
  withAuth(postHandler) as Parameters<typeof withTracing>[0],
  'POST /api/stores/[id]/backup/restore',
);
