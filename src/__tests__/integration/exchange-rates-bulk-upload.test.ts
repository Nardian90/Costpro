import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as XLSX from '@e965/xlsx';

/**
 * IC-EXCEL-BULK-UPLOAD: tests de integración del endpoint
 * POST /api/exchange-rates/bulk-upload.
 *
 * Cubre:
 *   - Non-admin recibe 403 (defense in depth).
 *   - Admin sube Excel válido → upsert a exchange_rates (BCC + elToque).
 *   - Columnas faltantes → 400.
 *   - Fechas inválidas → errors[] con row number.
 *   - capture_method missing → reintenta sin la columna.
 *   - Supabase no configurado → 500.
 *
 * Mocks:
 *   - @/lib/auth-middleware: withAuth invoca handler con sesión inyectada.
 *   - @/lib/supabase-admin: getSupabaseAdminSafe devuelve mock chainable.
 *   - @/lib/logger: silenciado.
 */

// ── Sesión mockeada (mutable por test) ───────────────────────────────
const mockSession = { value: { user: { id: 'admin-1', role: 'admin', memberships: [] } } as any };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  withRole: (_role: any, fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ── Mock chainable para Supabase admin client ────────────────────────
// El endpoint hace: admin.from('exchange_rates').upsert(payload, {onConflict}).select().single()
// Necesitamos un chain que registre los payloads y devuelva {data, error}.

type UpsertCall = {
  payload: Record<string, unknown>;
  onConflict: string;
};

const upsertCalls: UpsertCall[] = [];

let nextError: { message: string } | null = null;
let captureMethodExists = true; // si false, la 1ª llamada falla con error de capture_method

const mockChain = {
  upsert: vi.fn((payload: Record<string, unknown>, opts?: { onConflict?: string }) => {
    upsertCalls.push({ payload, onConflict: opts?.onConflict || '' });
    // Si la 1ª llamada incluye capture_method y la columna "no existe", simular error.
    if (
      !captureMethodExists &&
      'capture_method' in payload &&
      nextError === null
    ) {
      nextError = { message: 'column "capture_method" of relation "exchange_rates" does not exist' };
    }
    return mockChain;
  }),
  select: vi.fn(() => mockChain),
  single: vi.fn(async () => {
    const err = nextError;
    nextError = null; // consumir error (un solo uso)
    return { data: { id: 'mock-' + upsertCalls.length }, error: err };
  }),
};

const mockAdminClient = {
  from: vi.fn(() => mockChain),
};

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: vi.fn(() => mockAdminClient),
}));

// ── Helpers ──────────────────────────────────────────────────────────

/** Crea un buffer .xlsx desde un array de objetos. */
function makeXlsx(rows: Array<Record<string, unknown>>): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tasas');
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  // Buffer → ArrayBuffer (slice returns ArrayBufferLike; force-cast to ArrayBuffer).
  const ab: ArrayBuffer = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
  return ab;
}

/**
 * Crea un request mock con FormData conteniendo el archivo.
 *
 * NOTA: No usamos `new NextRequest(url, { body: formData })` porque en jsdom
 * la implementación de File no pasa el webidl check de undici (Request.formData()
 * lanza "assert(typeof value === 'string' ... || webidl.is.File(value))"). En
 * producción (Vercel/Node runtime real) esto funciona correctamente.
 *
 * El handler solo usa `req.formData()` y `req.url`, así que un mock mínimo
 * con esos dos campos es suficiente para los tests.
 */
function makeUploadRequest(buffer: ArrayBuffer, filename: string = 'tasas.xlsx'): NextRequest {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const file = new File([blob], filename);
  const formData = new FormData();
  formData.append('file', file);
  const req = {
    method: 'POST',
    url: 'http://localhost:3000/api/exchange-rates/bulk-upload',
    nextUrl: { pathname: '/api/exchange-rates/bulk-upload' },
    headers: new Headers(),
    formData: async () => formData,
  } as unknown as NextRequest;
  return req;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('POST /api/exchange-rates/bulk-upload (IC-EXCEL-BULK-UPLOAD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls.length = 0;
    nextError = null;
    captureMethodExists = true;
    mockSession.value = { user: { id: 'admin-1', role: 'admin', memberships: [] } };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  it('rechaza con 403 si el usuario no es admin', async () => {
    mockSession.value = { user: { id: 'clerk-1', role: 'clerk', memberships: [] } };
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const buf = makeXlsx([
      { fecha: '2024-01-01', bcc: 120, informal: 650 },
    ]);
    const res = await POST(makeUploadRequest(buf));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/admin/i);
    // No se debe llamar a Supabase para nada.
    expect(mockAdminClient.from).not.toHaveBeenCalled();
  });

  it('procesa un Excel válido y hace upsert de BCC + elToque por fila', async () => {
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const buf = makeXlsx([
      { fecha: '2024-01-01', bcc: 120, informal: 650 },
      { fecha: '2024-01-02', bcc: 121, informal: 655 },
    ]);
    const res = await POST(makeUploadRequest(buf));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(4); // 2 filas × 2 sources (BCC + elToque)
    expect(body.total_rows).toBe(2);
    expect(body.errors).toEqual([]);

    // Verificar que los upserts tengan los payloads correctos.
    expect(upsertCalls).toHaveLength(4);
    const bccCall = upsertCalls.find(
      c => c.payload.source === 'BCC' && c.payload.rate_date === '2024-01-01'
    );
    expect(bccCall).toBeDefined();
    expect(bccCall!.payload).toMatchObject({
      currency: 'USD',
      segment: '3',
      rate: 120,
      capture_method: 'real',
    });
    expect(bccCall!.onConflict).toBe('rate_date,source,currency,segment');

    const elToqueCall = upsertCalls.find(
      c => c.payload.source === 'elToque' && c.payload.rate_date === '2024-01-02'
    );
    expect(elToqueCall).toBeDefined();
    expect(elToqueCall!.payload).toMatchObject({ rate: 655 });
  });

  it('acepta nombres de columna alternativos (date, oficial, mercado)', async () => {
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const buf = makeXlsx([
      { date: '2024-03-15', oficial: 130, mercado: 700 },
    ]);
    const res = await POST(makeUploadRequest(buf));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(2);
    expect(upsertCalls).toHaveLength(2);
    expect(upsertCalls[0].payload).toMatchObject({ rate_date: '2024-03-15' });
  });

  it('acepta fecha en formato DD/MM/YYYY', async () => {
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const buf = makeXlsx([
      { fecha: '15/03/2024', bcc: 130, informal: 700 },
    ]);
    const res = await POST(makeUploadRequest(buf));

    expect(res.status).toBe(200);
    const body = await res.json();
    // 1 fila × 2 sources (BCC + elToque) = 2 upserts.
    expect(body.processed).toBe(2);
    expect(body.total_rows).toBe(1);
    expect(upsertCalls[0].payload.rate_date).toBe('2024-03-15');
    expect(upsertCalls[1].payload.rate_date).toBe('2024-03-15');
  });

  it('retorna 400 si faltan columnas requeridas', async () => {
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const buf = makeXlsx([
      { fecha: '2024-01-01', bcc: 120 }, // sin informal
    ]);
    const res = await POST(makeUploadRequest(buf));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/informal/);
    expect(mockAdminClient.from).not.toHaveBeenCalled();
  });

  it('retorna 400 si el archivo no tiene filas de datos (solo header)', async () => {
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    // Header-only file: usar aoa_to_sheet para garantizar headers sin filas.
    const ws = XLSX.utils.aoa_to_sheet([['fecha', 'bcc', 'informal']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasas');
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const ab: ArrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
    const res = await POST(makeUploadRequest(ab));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/filas/i);
  });

  it('rechaza con 413 si el archivo tiene más de 1000 filas', async () => {
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const rows = Array.from({ length: 1001 }, (_, i) => ({
      fecha: `2024-01-${String(i + 1).padStart(2, '0')}`,
      bcc: 120,
      informal: 650,
    }));
    const buf = makeXlsx(rows);
    const res = await POST(makeUploadRequest(buf));

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.max).toBe(1000);
    expect(body.received).toBe(1001);
  });

  it('registra errores por fila con fecha inválida (no aborta el resto)', async () => {
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const buf = makeXlsx([
      { fecha: '2024-01-01', bcc: 120, informal: 650 },
      { fecha: 'NO-ES-FECHA', bcc: 121, informal: 655 },
      { fecha: '2024-01-03', bcc: 122, informal: 660 },
    ]);
    const res = await POST(makeUploadRequest(buf));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_rows).toBe(2); // 2 filas válidas
    expect(body.processed).toBe(4); // 2 filas × 2 sources
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].row).toBe(3); // fila 3 (1-based + header)
    expect(body.errors[0].error).toMatch(/Fecha inválida/i);
  });

  it('rechaza con 400 si la extensión no es soportada', async () => {
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const blob = new Blob(['plain text'], { type: 'text/plain' });
    const file = new File([blob], 'tasas.txt');
    const formData = new FormData();
    formData.append('file', file);
    // Mock request (ver nota en makeUploadRequest sobre jsdom + File).
    const req = {
      method: 'POST',
      url: 'http://localhost:3000/api/exchange-rates/bulk-upload',
      nextUrl: { pathname: '/api/exchange-rates/bulk-upload' },
      headers: new Headers(),
      formData: async () => formData,
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/\.xlsx|\.xls|\.csv/i);
  });

  it('retorna 400 si no se envía archivo', async () => {
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const formData = new FormData(); // sin 'file'
    const req = {
      method: 'POST',
      url: 'http://localhost:3000/api/exchange-rates/bulk-upload',
      nextUrl: { pathname: '/api/exchange-rates/bulk-upload' },
      headers: new Headers(),
      formData: async () => formData,
    } as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file/i);
  });

  it('reintenta sin capture_method si la columna no existe en BD', async () => {
    captureMethodExists = false; // simula migración pendiente
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const buf = makeXlsx([
      { fecha: '2024-01-01', bcc: 120, informal: 650 },
    ]);
    const res = await POST(makeUploadRequest(buf));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.capture_method_missing).toBe(true);
    // 4 upserts = 2 sources × (1 con capture_method que falla + 1 retry sin)
    expect(upsertCalls).toHaveLength(4);
    // Los retries no deben incluir capture_method.
    const retryCalls = upsertCalls.filter(c => !('capture_method' in c.payload));
    expect(retryCalls.length).toBe(2);
    // Las llamadas que tienen capture_method deben ser las que fallaron.
    const withMethod = upsertCalls.filter(c => 'capture_method' in c.payload);
    expect(withMethod.length).toBe(2);
  });

  it('retorna 500 si Supabase no está configurado (admin client null)', async () => {
    const { getSupabaseAdminSafe } = await import('@/lib/supabase-admin');
    (getSupabaseAdminSafe as any).mockReturnValueOnce(null);

    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    const buf = makeXlsx([{ fecha: '2024-01-01', bcc: 120, informal: 650 }]);
    const res = await POST(makeUploadRequest(buf));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/CONFIG_ERROR/i);
  });

  it('acepta archivo .csv además de .xlsx', async () => {
    const { POST } = await import('@/app/api/exchange-rates/bulk-upload/route');

    // Crear CSV en texto y convertir a buffer.
    const csv = 'fecha,bcc,informal\n2024-05-10,125,680\n2024-05-11,126,685\n';
    const buf = Buffer.from(csv, 'utf-8');
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const res = await POST(makeUploadRequest(arrayBuf, 'tasas.csv'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(4);
    expect(body.total_rows).toBe(2);
  });
});
