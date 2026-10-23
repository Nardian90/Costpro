import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { WHATSAPP_SESSIONS_ENABLED } from '@/lib/messaging-flags';

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
    if (!validateOrigin(req)) { return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 }); }
  // CP-INFRA-002 (2026-10-23): desconexión reversible — no se crean sesiones
  // Baileys nuevas (el WebSocket de WhatsApp queda sin conexiones nuevas).
  // CP-INFRA-002b (2026-10-23): además, el cliente Baileys fue RETIRADO del
  // runtime (dependencia desinstalada). La bandera ya no basta para
  // reactivar: ver el procedimiento completo en
  // docs/CP-INFRA-002-REACTIVACION.md (reinstalar @whiskeysockets/baileys y
  // restaurar baileys-client.ts/handlers.ts desde git).
  if (!WHATSAPP_SESSIONS_ENABLED) {
    return NextResponse.json(
      { error: 'WHATSAPP_SESSIONS_DISABLED', reason: 'Integración WhatsApp desconectada (CP-INFRA-002). Reactivar con WHATSAPP_SESSIONS_ENABLED=true.' },
      { status: 503 },
    );
  }
  const { allowed } = await rateLimit(`wa:connect:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const body = await req.json().catch(() => ({}));

  // REM-COSTPRO4-CI: contrato del body con Zod (requeridad de store_id la
  // aplica el check de abajo con el error de contrato).
  const StoreActionSchema = z.object({ store_id: z.string().optional() }).passthrough();
  const parsedBody = StoreActionSchema.safeParse(body ?? {});
  if (!parsedBody.success) {
    return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  }

  const storeId = body.store_id;
  if (!storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  // CP-INFRA-002b: con la bandera habilitada pero el runtime retirado,
  // se responde 503 con el procedimiento — nunca un éxito falso.
  return NextResponse.json(
    { error: 'WHATSAPP_RUNTIME_UNAVAILABLE', reason: 'Cliente Baileys retirado del runtime (CP-INFRA-002b). Seguir docs/CP-INFRA-002-REACTIVACION.md para reinstalarlo antes de conectar.' },
    { status: 503 },
  );
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/whatsapp/connect');
