import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';

/**
 * GET /api/reports/download/[runId] — descarga autenticada del PDF de un reporte.
 *
 * BUG-022 (E2E-PRODUCT-FIX-ROUND1): sustituye las signed URLs de 24h y las URLs
 * públicas del bucket 'reports' (ahora privado, migración 20261005120001).
 * El acceso requiere sesión (withAuth) y se valida el ownership del run:
 * ejecutor o admin (mismo modelo de bypass de /api/reports/generate).
 * El objeto se lee con service_role (único rol con lectura tras la
 * privatización) y se transmite como stream PDF.
 */
async function downloadHandler(
  req: NextRequest,
  session: AuthenticatedSession
): Promise<NextResponse> {
  // runId desde el path: /api/reports/download/[runId]
  const parts = new URL(req.url).pathname.split('/');
  const runId = parts[parts.length - 1];

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
    return NextResponse.json({ error: 'run id inválido' }, { status: 400 });
  }

  const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 });
  }

  const { data: run, error: runError } = await admin
    .from('report_runs')
    .select('id, executed_by, parameters_snapshot')
    .eq('id', runId)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
  }

  // Ownership: el ejecutor del run o un admin (bypass consistente con generate)
  const isAdmin = (session.user as Record<string, unknown>)?.role === 'admin';
  if (!isAdmin && run.executed_by !== session.user.id) {
    return NextResponse.json({ error: 'Prohibido' }, { status: 403 });
  }

  // La ruta de storage es determinista: reports/<type>/<runId>.pdf
  // (contract de /api/reports/generate, fileName = `reports/${type}/${runData.id}.pdf`)
  const snapshot = (run.parameters_snapshot ?? {}) as Record<string, unknown>;
  const type = snapshot.type as string | undefined;
  if (!type) {
    return NextResponse.json({ error: 'Reporte sin tipo registrado' }, { status: 404 });
  }
  const filePath = `reports/${type}/${runId}.pdf`;

  const { data: fileData, error: downloadError } = await admin.storage
    .from('reports')
    .download(filePath);

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'Archivo del reporte no encontrado' }, { status: 404 });
  }

  const buffer = await fileData.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="report-${runId}.pdf"`,
    },
  });
}

export const GET = withTracing(
  withAuth(downloadHandler) as any,
  'GET /api/reports/download/[runId]'
);
