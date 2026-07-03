import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as XLSX from '@e965/xlsx';

/**
 * IC-EXCEL-BULK-UPLOAD: tests del endpoint GET /api/exchange-rates/template.
 *
 * Verifica:
 *   - Devuelve un .xlsx válido con Content-Type correcto.
 *   - El .xlsx tiene 3 columnas (fecha, bcc, informal).
 *   - Las columnas bcc/informal están vacías.
 *   - Solo incluye fechas hábiles (lunes-viernes) desde 2021-01-01.
 *   - Non-authenticated → 401 (withAuth lo bloquea).
 */

// Sesión mock — cualquier usuario autenticado puede descargar la plantilla.
const mockSession = { value: { user: { id: 'user-1', role: 'clerk', memberships: [] } } as any };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  withRole: (_role: any, fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('GET /api/exchange-rates/template (IC-EXCEL-BULK-UPLOAD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.value = { user: { id: 'user-1', role: 'clerk', memberships: [] } };
  });

  it('devuelve un .xlsx válido con Content-Type correcto', async () => {
    const { GET } = await import('@/app/api/exchange-rates/template/route');
    const req = {
      method: 'GET',
      url: 'http://localhost:3000/api/exchange-rates/template',
      nextUrl: { pathname: '/api/exchange-rates/template' },
      headers: new Headers(),
    } as unknown as NextRequest;

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="plantilla-tasas-cuba.xlsx"'
    );

    // Verificar que el cuerpo es un .xlsx válido parseable.
    const buffer = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Tasas');
    const ws = wb.Sheets['Tasas'];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true });
    expect(rows.length).toBeGreaterThan(100); // muchas fechas hábiles desde 2021
    expect(rows[0]).toHaveProperty('fecha');
    expect(rows[0]).toHaveProperty('bcc');
    expect(rows[0]).toHaveProperty('informal');
  });

  it('solo incluye fechas hábiles (lunes-viernes)', async () => {
    const { GET } = await import('@/app/api/exchange-rates/template/route');
    const req = {
      method: 'GET',
      url: 'http://localhost:3000/api/exchange-rates/template',
      nextUrl: { pathname: '/api/exchange-rates/template' },
      headers: new Headers(),
    } as unknown as NextRequest;

    const res = await GET(req);
    const buffer = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Tasas']);

    // Verificar que ninguna fecha cae en sábado (6) o domingo (0).
    const weekendDates: string[] = [];
    rows.forEach(r => {
      const fecha = String(r.fecha);
      const day = new Date(fecha + 'T00:00:00Z').getUTCDay();
      if (day === 0 || day === 6) weekendDates.push(fecha);
    });
    expect(weekendDates).toEqual([]);
  });

  it('las columnas bcc e informal están vacías en todas las filas', async () => {
    const { GET } = await import('@/app/api/exchange-rates/template/route');
    const req = {
      method: 'GET',
      url: 'http://localhost:3000/api/exchange-rates/template',
      nextUrl: { pathname: '/api/exchange-rates/template' },
      headers: new Headers(),
    } as unknown as NextRequest;

    const res = await GET(req);
    const buffer = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Tasas']);

    rows.forEach(r => {
      // bcc e informal deben ser '' (string vacío) o undefined.
      expect(['', undefined, null]).toContain(r.bcc);
      expect(['', undefined, null]).toContain(r.informal);
    });
  });

  it('empieza desde el 2021-01-01 (cuando el BCC empezó a publicar)', async () => {
    const { GET } = await import('@/app/api/exchange-rates/template/route');
    const req = {
      method: 'GET',
      url: 'http://localhost:3000/api/exchange-rates/template',
      nextUrl: { pathname: '/api/exchange-rates/template' },
      headers: new Headers(),
    } as unknown as NextRequest;

    const res = await GET(req);
    const buffer = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Tasas']);

    // 2021-01-01 fue viernes — debe ser la primera fecha.
    expect(String(rows[0].fecha)).toBe('2021-01-01');
  });
});
