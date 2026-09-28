import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/purge-snapshots/route';
import { verifyCronAuthorization } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

/**
 * SEC-TS-05 — GET /api/cron/purge-snapshots
 *
 * Antes: la autorización era un chequeo CONDICIONAL sobre el header
 * x-cron-secret:
 *
 *   if (expectedSecret && cronSecret !== expectedSecret) return 401;
 *
 * Con CRON_SECRET ausente (estado observado en el entorno desplegado) la
 * condición entera se saltaba → cualquier anónimo ejecutaba la RPC
 * service-role purge_old_reset_snapshots(30) (DELETE global de
 * store_reset_snapshots >30 días). Además el header x-cron-secret no es un
 * mecanismo de Vercel: el Vercel Cron legítico envía Authorization: Bearer
 * CRON_SECRET o x-vercel-signature, por lo que "proteger" configurando
 * CRON_SECRET rompía el cron legítimo (contrato desalineado).
 *
 * Después (SEC-TS-05 · fail-closed canónico, mismo cron-auth de
 * {telegram,whatsapp}-auto-publish):
 *   - sin headers y sin CRON_SECRET → 401 (NUNCA allow por omisión)
 *   - CRON_SECRET ausente + cualquier Bearer/x-cron-secret → 401
 *   - CRON_SECRET configurado + Bearer ausente/incorrecto → 401
 *   - CRON_SECRET configurado + Bearer correcto → 200, RPC ejecutada
 *   - JWT x-vercel-signature válido (VERCEL_PROJECT_ID) → 200 (Vercel Cron)
 *   - JWT con VERCEL_PROJECT_ID ausente o firma inválida → 401
 *
 * Se usa el cron-auth REAL y la ruta REAL (export GET con withTracing REAL);
 * solo se mockea jose (para simular el JWKS de Vercel sin red), el cliente
 * service-role (spy sobre la RPC de purge) y el logger. El secret de los
 * tests es un valor FICTICIO — el valor real nunca se escribe en el repo.
 */

const FAKE_SECRET = 'sec-ts-05-fictitious-cron-secret-0001';

// jose mock (mismo patrón que sec-ts-02-cron-auto-publish.test.ts)
const jwtVerifyMock = vi.fn();
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: (...args: any[]) => jwtVerifyMock(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Cliente service-role mockeado — spy sobre la RPC de purge
const rpcSpy = vi.fn();
const adminClient = { rpc: (...args: any[]) => rpcSpy(...args) };
let adminAvailable = true;
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => (adminAvailable ? adminClient : null),
}));

function makeGetReq(headers: Record<string, string> = {}): any {
  return {
    method: 'GET',
    url: 'http://localhost:3000/api/cron/purge-snapshots',
    headers: new Headers(headers),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  jwtVerifyMock.mockReset();
  adminAvailable = true;
  rpcSpy.mockResolvedValue({ data: 3, error: null });
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_PROJECT_ID;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_PROJECT_ID;
});

describe('SEC-TS-05 · purge-snapshots — fail-closed cron auth (ruta REAL)', () => {
  it('sin headers y sin CRON_SECRET en server → 401 y la RPC de purge NUNCA se ejecuta (fail-closed)', async () => {
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('CRON_SECRET ausente + Bearer arbitrario → 401, sin purge (el fail-open quedó eliminado)', async () => {
    const res = await GET(makeGetReq({ authorization: 'Bearer anything-at-all' }));
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('CRON_SECRET ausente + header x-cron-secret heredado → 401, sin purge (el mecanismo antiguo ya NO autoriza)', async () => {
    const res = await GET(makeGetReq({ 'x-cron-secret': FAKE_SECRET }));
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('CRON_SECRET configurado + Authorization ausente → 401, sin purge', async () => {
    process.env.CRON_SECRET = FAKE_SECRET;
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('CRON_SECRET configurado + Bearer incorrecto → 401, sin purge', async () => {
    process.env.CRON_SECRET = FAKE_SECRET;
    const res = await GET(makeGetReq({ authorization: `Bearer ${FAKE_SECRET}-wrong` }));
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('CRON_SECRET configurado + Bearer correcto → 200, RPC purge_old_reset_snapshots(30) ejecutada, respuesta existente intacta', async () => {
    process.env.CRON_SECRET = FAKE_SECRET;
    const res = await GET(makeGetReq({ authorization: `Bearer ${FAKE_SECRET}` }));
    expect(res.status).toBe(200);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('purge_old_reset_snapshots', { p_days: 30 });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.purged).toBe(3);
    expect(String(json.message)).toContain('Purged 3');
  });

  it('JWT x-vercel-signature presente pero VERCEL_PROJECT_ID ausente → 401, sin purge (Modo 1 fail-closed)', async () => {
    const res = await GET(makeGetReq({ 'x-vercel-signature': 'sig.any' }));
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(jwtVerifyMock).not.toHaveBeenCalled();
  });

  it('JWT x-vercel-signature VÁLIDO (Vercel Cron automático) + VERCEL_PROJECT_ID → 200, purge ejecutada (caller legítimo)', async () => {
    process.env.VERCEL_PROJECT_ID = 'proj_sec_ts_05';
    jwtVerifyMock.mockResolvedValueOnce({ payload: {} });
    const res = await GET(makeGetReq({ 'x-vercel-signature': 'sig.valid' }));
    expect(res.status).toBe(200);
    expect(rpcSpy).toHaveBeenCalledWith('purge_old_reset_snapshots', { p_days: 30 });
  });

  it('JWT inválido (verificación falla) y sin Bearer → 401, sin purge', async () => {
    process.env.VERCEL_PROJECT_ID = 'proj_sec_ts_05';
    jwtVerifyMock.mockRejectedValueOnce(new Error('bad signature'));
    const res = await GET(makeGetReq({ 'x-vercel-signature': 'sig.bad' }));
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('repetición del request autorizado → ambas 200, RPC ejecutada 2 veces con los mismos args (contrato idempotente)', async () => {
    process.env.CRON_SECRET = FAKE_SECRET;
    const req = () => makeGetReq({ authorization: `Bearer ${FAKE_SECRET}` });
    const res1 = await GET(req());
    const res2 = await GET(req());
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(rpcSpy).toHaveBeenCalledTimes(2);
    expect(rpcSpy).toHaveBeenNthCalledWith(1, 'purge_old_reset_snapshots', { p_days: 30 });
    expect(rpcSpy).toHaveBeenNthCalledWith(2, 'purge_old_reset_snapshots', { p_days: 30 });
  });

  it('el secret NUNCA aparece en la respuesta ni en los logs', async () => {
    process.env.CRON_SECRET = FAKE_SECRET;
    // 401 con Bearer incorrecto
    const res401 = await GET(makeGetReq({ authorization: 'Bearer wrong' }));
    const body401 = JSON.stringify(await res401.json());
    expect(body401).not.toContain(FAKE_SECRET);
    // 200 con Bearer correcto
    const res200 = await GET(makeGetReq({ authorization: `Bearer ${FAKE_SECRET}` }));
    const body200 = JSON.stringify(await res200.json());
    expect(body200).not.toContain(FAKE_SECRET);
    // logger: ninguna llamada recibió el secret
    const logged = JSON.stringify(
      (logger.info as any).mock.calls.concat((logger.error as any).mock.calls, (logger.warn as any).mock.calls),
    );
    expect(logged).not.toContain(FAKE_SECRET);
  });

  it('supabase-admin ausente con auth OK → 500 "Server misconfigured" (comportamiento preexistente preservado)', async () => {
    process.env.CRON_SECRET = FAKE_SECRET;
    adminAvailable = false;
    const res = await GET(makeGetReq({ authorization: `Bearer ${FAKE_SECRET}` }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Server misconfigured');
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('RPC con error de DB → 500 controlado (comportamiento preexistente preservado)', async () => {
    process.env.CRON_SECRET = FAKE_SECRET;
    rpcSpy.mockResolvedValueOnce({ data: null, error: { message: 'db boom' } });
    const res = await GET(makeGetReq({ authorization: `Bearer ${FAKE_SECRET}` }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('db boom');
  });
});

describe('SEC-TS-05 · contrato del helper común cron-auth (helper REAL, jose mockeado)', () => {
  it('CRON_SECRET ausente en server → NUNCA autoriza (sin patrón "if (!CRON_SECRET) allow")', async () => {
    const result = await verifyCronAuthorization(makeGetReq({ authorization: 'Bearer x' }));
    expect(result.authorized).toBe(false);
    expect(result.method).toBe('none');
  });

  it('Bearer CRON_SECRET correcto → autorizado vía cron-secret (mismo contrato que las demás rutas cron)', async () => {
    process.env.CRON_SECRET = FAKE_SECRET;
    const result = await verifyCronAuthorization(makeGetReq({ authorization: `Bearer ${FAKE_SECRET}` }));
    expect(result).toEqual({ authorized: true, method: 'cron-secret' });
  });

  it('Bearer literal "null"/vacío NO autoriza aunque CRON_SECRET no exista', async () => {
    const result = await verifyCronAuthorization(makeGetReq({ authorization: 'Bearer null' }));
    expect(result.authorized).toBe(false);
  });
});
