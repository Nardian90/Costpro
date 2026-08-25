import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { getSessionInfo, getSocket } from '@/lib/whatsapp/baileys-client';

/**
 * GET /api/whatsapp/health?store_id=UUID
 *
 * WhatsApp-specific health check — returns detailed connection state:
 *
 *   Status enum:
 *     - NOT_CONFIGURED  (no whatsapp_configs row, or no phone_number)
 *     - CONNECTING       (Baileys is attempting to connect, QR may be pending)
 *     - QR_REQUIRED     (QR code generated, waiting for user to scan)
 *     - CONNECTED        (live WebSocket + authenticated session)
 *     - DISCONNECTED     (no active session, no QR pending)
 *     - ERROR            (last_disconnect error set)
 *
 * Returns:
 *   {
 *     status: 'CONNECTED' | 'QR_REQUIRED' | 'CONNECTING' | 'DISCONNECTED' | 'NOT_CONFIGURED' | 'ERROR',
 *     hasSession: boolean,  // WASocket exists in memory
 *     hasQrCode: boolean,    // QR is pending scan
 *     phoneNumber?: string,  // The configured WhatsApp number (masked)
 *     lastConnectedAt?: string,
 *     connectionStatusInDb: string,  // What the DB says (may lag in-memory)
 *     autoPublishEnabled: boolean,
 *     lastPublishStatus?: string,
 *     lastPublishAt?: string,
 *   }
 */
async function handler(req: NextRequest, session: AuthenticatedSession) {
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id');
  if (!storeId) {
    return NextResponse.json({ error: 'store_id es obligatorio' }, { status: 400 });
  }
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) return NextResponse.json({ error: 'Config error' }, { status: 500 });

  // 1. Load DB config
  const { data: cfg } = await admin
    .from('whatsapp_configs')
    .select('phone_number, connection_status, last_connected_at, is_active, auto_publish_enabled, last_publish_status, last_publish_at, last_publish_error')
    .eq('store_id', storeId)
    .maybeSingle();

  if (!cfg) {
    return NextResponse.json({
      status: 'NOT_CONFIGURED',
      hasSession: false,
      hasQrCode: false,
      detail: 'No existe configuración de WhatsApp para esta tienda',
    });
  }

  if (!cfg.phone_number) {
    return NextResponse.json({
      status: 'NOT_CONFIGURED',
      hasSession: false,
      hasQrCode: false,
      detail: 'Falta phone_number en la configuración',
    });
  }

  // 2. Check in-memory session state
  const sessionInfo = getSessionInfo(storeId);
  const sock = getSocket(storeId);
  const hasSession = !!sock;
  const hasQrCode = !!sessionInfo.qrCode;

  // 3. Derive final status
  let status: 'CONNECTED' | 'QR_REQUIRED' | 'CONNECTING' | 'DISCONNECTED' | 'NOT_CONFIGURED' | 'ERROR';

  if (sessionInfo.status === 'connected' && hasSession) {
    status = 'CONNECTED';
  } else if (hasQrCode) {
    status = 'QR_REQUIRED';
  } else if (sessionInfo.status === 'connecting') {
    status = 'CONNECTING';
  } else if (cfg.last_publish_error && cfg.connection_status === 'disconnected') {
    status = 'ERROR';
  } else {
    status = 'DISCONNECTED';
  }

  // Mask phone number — only show last 4 digits
  const maskedPhone = cfg.phone_number
    ? `***${cfg.phone_number.slice(-4)}`
    : null;

  return NextResponse.json({
    status,
    hasSession,
    hasQrCode,
    phoneNumber: maskedPhone,
    lastConnectedAt: cfg.last_connected_at,
    connectionStatusInDb: cfg.connection_status,
    isActive: cfg.is_active,
    autoPublishEnabled: cfg.auto_publish_enabled,
    lastPublishStatus: cfg.last_publish_status,
    lastPublishAt: cfg.last_publish_at,
    lastPublishError: cfg.last_publish_error,
  });
}

export const GET = withAuth(handler as any);
