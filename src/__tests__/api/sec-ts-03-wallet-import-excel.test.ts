import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/wallet/import-excel/route';
import {
  walletImportExcelSchema,
  WALLET_EXCEL_MAX_BASE64_CHARS,
} from '@/validation/api-schemas';

/**
 * SEC-TS-03 · H7 — POST /api/wallet/import-excel
 *
 * Antes: el body { content: base64 } se decodificaba y XLSX.read parseaba
 * el archivo COMPLETO en memoria sin ningún tope. La App Router no impone
 * body-size-limit en route handlers y el deploy real (Docker persistente)
 * no tiene límite de plataforma → un payload arbitrariamente grande podía
 * agotar heap/CPU del proceso (además de N upserts por fila).
 *
 * Después (patrón canónico OCR de SEC-TS-02 · H1):
 *   request → sesión (401 anónimo) → Content-Length declarado excesivo
 *   → 413 temprano (optimización, NO barrera única) → Zod
 *   walletImportExcelSchema (base64 estricto, tope 10 MiB) → 400/413 →
 *   Buffer → XLSX → upserts.
 *
 * Se mockean getServerSession, XLSX, supabase y logger. El XLSX mock
 * permite afirmar que payloads rechazados NUNCA llegan al parseo.
 */

const USER_X = '9a111111-1111-4111-8111-999999999999';

const sessionState = { value: null as any };

vi.mock('@/lib/auth', () => ({
  getServerSession: async () => sessionState.value,
}));

// COSTPRO 4: withRole('admin') consulta el perfil del solicitante vía
// supabase-admin — se mockea como admin para ejercitar el gate real.
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => adminProfileClient(),
  getSupabaseAdmin: () => adminProfileClient(),
}));

function adminProfileClient() {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    single: () => Promise.resolve({ data: { role: 'admin', roles: ['admin'] } }),
  };
  return {
    from: (table: string) => (table === 'user_store_memberships'
      ? { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }
      : chain),
  };
}

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// XLSX mock — XLSX.read NUNCA debe ejecutarse para payloads rechazados.
const xlsxRead = vi.fn();
const sheetToJson = vi.fn();
vi.mock('@e965/xlsx', () => ({
  read: (...args: any[]) => xlsxRead(...args),
  utils: { sheet_to_json: (...args: any[]) => sheetToJson(...args) },
}));

// supabase mock — upserts por fila + recálculo de saldos
const upsertMock = vi.fn();
const thenable = (result: any) => ({
  then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain: any = {
        upsert: (...a: any[]) => {
          upsertMock(table, ...a);
          return thenable({ error: null });
        },
        select: () => chain,
        update: () => chain,
        eq: () => thenable({ data: [] }),
      };
      return chain;
    },
  }),
}));

const VALID_ROWS = [
  { Fecha: '2026-01-02', Banco: 'BPA', Operación: 'Ingreso', Monto: 100, Moneda: 'CUP', Servicio: 'Venta' },
  { Fecha: '2026-01-03', Banco: 'BPA', Operación: 'Gasto', Monto: 40, Moneda: 'CUP', Servicio: 'Compra' },
];

function makePostReq(body: any, headers: Record<string, string> = {}): any {
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/wallet/import-excel',
    headers: new Headers(headers),
    json: async () => body,
  };
}

function authedSession() {
  sessionState.value = { user: { id: USER_X } };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.value = null;
  xlsxRead.mockReset();
  xlsxRead.mockReturnValue({ SheetNames: ['Transacciones'], Sheets: { Transacciones: {} } });
  sheetToJson.mockReset();
  sheetToJson.mockReturnValue(VALID_ROWS);
  upsertMock.mockReset();
});

describe('SEC-TS-03 · H7 — límite de payload server-side en import-excel', () => {
  it('sin sesión → 401 y NINGÚN parseo (auth antes de todo procesamiento)', async () => {
    const res = await POST(makePostReq({ content: 'ZmFrZQ==' }));
    expect(res.status).toBe(401);
    expect(xlsxRead).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('archivo pequeño válido → 200, flujo legítimo intacto (2 filas guardadas)', async () => {
    authedSession();
    const content = Buffer.from('fake-xlsx-bytes').toString('base64');

    const res = await POST(makePostReq({ content }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.transactions).toBe(2);
    expect(json.skipped).toBe(0);
    expect(xlsxRead).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(2);
  });

  it('archivo EXACTAMENTE en el límite (10 MiB de base64) → PASS (límite inclusivo)', async () => {
    authedSession();
    const content = 'A'.repeat(WALLET_EXCEL_MAX_BASE64_CHARS);

    const res = await POST(makePostReq({ content }));
    expect(res.status).toBe(200);
    expect(xlsxRead).toHaveBeenCalledTimes(1);
  });

  it('archivo por ENCIMA del límite (10 MiB + 1) → 413 y el parseo NUNCA ocurre', async () => {
    authedSession();
    const content = 'A'.repeat(WALLET_EXCEL_MAX_BASE64_CHARS + 1);

    const res = await POST(makePostReq({ content }));
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(xlsxRead).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('Content-Length declarado excesivo → 413 temprano SIN bufferizar el body', async () => {
    authedSession();
    // cliente "honesto" que declara 15 MB — rechazo antes de req.json()
    const res = await POST(
      makePostReq(
        { content: 'ZmFrZQ==' },
        { 'content-length': String(WALLET_EXCEL_MAX_BASE64_CHARS + 2049) }
      )
    );
    expect(res.status).toBe(413);
    expect(xlsxRead).not.toHaveBeenCalled();
  });

  it('Content-Length AUSENTE (chunked) → el chequeo de contenido real sigue aplicando (barrera no única)', async () => {
    authedSession();
    // sin header content-length: un body real > límite debe caer en el schema
    const content = 'A'.repeat(WALLET_EXCEL_MAX_BASE64_CHARS + 10);
    const res = await POST(makePostReq({ content }));
    expect(res.status).toBe(413);
    expect(xlsxRead).not.toHaveBeenCalled();
  });

  it('payload malformado (base64 con caracteres inválidos) → 400, sin parseo', async () => {
    authedSession();
    const res = await POST(makePostReq({ content: '¡no-es-base64! §§' }));
    expect(res.status).toBe(400);
    expect(xlsxRead).not.toHaveBeenCalled();
  });

  it('body sin content → 400 (schema .min(1))', async () => {
    authedSession();
    const res = await POST(makePostReq({}));
    expect(res.status).toBe(400);
    expect(xlsxRead).not.toHaveBeenCalled();
  });

  it('JSON inválido → 400 controlado (antes: excepción sin catch en json())', async () => {
    authedSession();
    const req = {
      method: 'POST',
      url: 'http://localhost:3000/api/wallet/import-excel',
      headers: new Headers(),
      json: async () => {
        throw new Error('Unexpected token');
      },
    } as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(xlsxRead).not.toHaveBeenCalled();
  });

  it('usuario autenticado + archivo válido → upserts van SIEMPRE a su propio user_id (scoping intacto)', async () => {
    authedSession();
    const content = Buffer.from('fake').toString('base64');

    const res = await POST(makePostReq({ content }));
    expect(res.status).toBe(200);
    // cada upsert usa el user_id de la SESIÓN, no del body
    for (const call of upsertMock.mock.calls) {
      expect(call[1].user_id).toBe(USER_X);
    }
  });
});

describe('SEC-TS-03 · H7 — schema puro (walletImportExcelSchema)', () => {
  it('rechaza cadenas mayores al límite con code too_big (413 en la ruta)', () => {
    const result = walletImportExcelSchema.safeParse({ content: 'A'.repeat(WALLET_EXCEL_MAX_BASE64_CHARS + 1) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.code === 'too_big')).toBe(true);
    }
  });

  it('acepta exactamente el límite (inclusivo) y rechaza alfabeto no base64', () => {
    expect(walletImportExcelSchema.safeParse({ content: 'A'.repeat(WALLET_EXCEL_MAX_BASE64_CHARS) }).success).toBe(true);
    expect(walletImportExcelSchema.safeParse({ content: 'AB CD\n' }).success).toBe(false);
    expect(walletImportExcelSchema.safeParse({}).success).toBe(false);
  });
});
