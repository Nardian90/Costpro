// Diagnostic endpoint — tests Supabase connectivity
// SEC-003 (CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 §4.2): autenticación fail-closed
// server-side — el diagnóstico solo se ejecuta con sesión verificada (mecanismo
// propio de la raíz /api: getServerSession + 401). Antes era un endpoint
// público sin auth ni rate-limit (hallazgo del audit-route-auth.cjs; sin
// llamador en el producto — orphan diagnostic).
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, any> = {};
  const start = Date.now();

  results.env = {
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET',
  };

  try {
    const t0 = Date.now();
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { 'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
      signal: AbortSignal.timeout(5000),
    });
    results.supabase_health = {
      status: res.status,
      time_ms: Date.now() - t0,
      ok: res.ok,
    };
    if (res.ok) {
      results.supabase_health_body = await res.json();
    }
  } catch (e: any) {
    results.supabase_health = { error: e.message, time_ms: Date.now() - start };
  }

  results.total_time_ms = Date.now() - start;
  results.diagnosis = results.supabase_health?.ok 
    ? 'Supabase reachable from server. Client-side issue likely.' 
    : 'Supabase NOT reachable from server. Network problem.';

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
