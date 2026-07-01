import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';
import { createApiError } from '@/lib/api-errors';
import { canManageStore } from '@/lib/roles';
import { supabase } from '@/lib/supabaseClient';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { registerStore } from '@/lib/whatsapp/invitation-queue';

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const { allowed } = await rateLimit(`wa:inv:import:${session.user.id}`, { windowMs: 60_000, maxRequests: 3 });
  if (!allowed) return NextResponse.json(createApiError('RATE_LIMITED'), { status: 429 });

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const storeId = formData.get('store_id') as string;

  if (!file || !storeId) return NextResponse.json(createApiError('INVALID_DATA'), { status: 400 });
  if (!canManageStore(session.user, storeId)) {
    return NextResponse.json(createApiError('FORBIDDEN'), { status: 403 });
  }

  const text = await file.text();
  let records: Array<Record<string, string>> = [];

  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    return NextResponse.json(createApiError('UNKNOWN_ERROR', 'CSV inválido'), { status: 400 });
  }

  // Normalizar: aceptar phone/nombre o phone/name
  const invitations = records
    .filter(r => r.phone || r.phone_number)
    .map(r => ({
      store_id: storeId,
      phone_number: String(r.phone || r.phone_number).replace(/\D/g, ''),
      name: r.name || r.nombre || null,
      status: 'pending' as const,
    }))
    .filter(r => r.phone_number.length >= 5);

  if (invitations.length === 0) {
    return NextResponse.json(createApiError('INVALID_DATA', 'No se encontraron contactos válidos'), { status: 400 });
  }

  const { data, error } = await supabase
    .from('whatsapp_invitations')
    .insert(invitations)
    .select();

  if (error) return NextResponse.json(createApiError('UNKNOWN_ERROR'), { status: 500 });

  // Activar worker
  registerStore(storeId);

  return NextResponse.json({ success: true, imported: invitations.length, data });
}

export const POST = withTracing(withAuth(postHandler) as any, 'POST /api/whatsapp/invitations/import');
