import { type NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * SEC-TS-02 · H3/H4 — Verificación de autorización para endpoints de cron.
 *
 * Replica EXACTAMENTE el patrón FIX C5+C6 ya establecido en
 * /api/cron/usage-sync y /api/cron/exchange-rates: solo 2 modos aceptables,
 * sin dev mode ni fallback — fail-closed.
 *
 *   Modo 1 — JWT x-vercel-signature (Vercel Cron automático):
 *     Requiere VERCEL_PROJECT_ID configurado; se verifica contra el JWKS
 *     de Vercel (issuer='vercel', audience=projectId). Sin project ID no
 *     se puede validar la audiencia → rechazo (fail-closed).
 *
 *   Modo 2 — Bearer CRON_SECRET (llamadas manuales/locales):
 *     Authorization: Bearer <CRON_SECRET> exacto. Si CRON_SECRET no está
 *     configurado, este modo NUNCA autoriza (no existe el patrón
 *     "if (!CRON_SECRET) allow" — secret ausente = rechazo).
 *
 * Uso en la ruta:
 *   const auth = await verifyCronAuthorization(req);
 *   if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 */
const JWKS = createRemoteJWKSet(new URL('https://api.vercel.com/.well-known/jwks.json'));

export type CronAuthResult = {
  authorized: boolean;
  method: 'vercel-jwt' | 'cron-secret' | 'none';
};

export async function verifyCronAuthorization(req: NextRequest): Promise<CronAuthResult> {
  // ── Modo 1: JWT Vercel (requiere VERCEL_PROJECT_ID) ──
  const sig = req.headers.get('x-vercel-signature');
  if (sig) {
    const projectId = process.env.VERCEL_PROJECT_ID;
    if (!projectId) {
      // Sin project ID no podemos validar la audiencia — fail closed
      console.error('[cron-auth] VERCEL_PROJECT_ID not configured — rejecting JWT');
    } else {
      try {
        await jwtVerify(sig, JWKS, { issuer: 'vercel', audience: projectId });
        return { authorized: true, method: 'vercel-jwt' };
      } catch {
        // Firma inválida — continuar al siguiente modo (también fallará)
      }
    }
  }

  // ── Modo 2: Bearer CRON_SECRET (fail-closed: secret ausente → nunca autoriza) ──
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { authorized: true, method: 'cron-secret' };
  }

  return { authorized: false, method: 'none' };
}
