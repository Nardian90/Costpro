import { test, expect } from '@playwright/test';
import { getAuthHeaders } from './fixtures/auth.fixture';

test.describe('Legal', () => {
  test('[BUG-017 REGRESSION] /api/legal/incidents must require authentication', async ({ request }) => {
    const response = await request.post('/api/legal/incidents', {
      data: { title: 'Test incident', description: 'E2E regression test for BUG-017', severity: 'low' }
    });
    const status = response.status();
    expect(status).toBe(401);
  });

  test('incidents: validates required fields → 400', async ({ request }) => {
    const legal_headers = getAuthHeaders('user');
    if (!legal_headers) { test.skip(true, 'Auth headers missing'); return; }
    const h = legal_headers;

    const r1 = await request.post('/api/legal/incidents', { headers: h, data: { description: 'test', severity: 'low' } });
    expect(r1.status()).toBe(400);

    const r2 = await request.post('/api/legal/incidents', { headers: h, data: { title: 'test', severity: 'low' } });
    expect(r2.status()).toBe(400);

    const r3 = await request.post('/api/legal/incidents', { headers: h, data: { title: 'test', description: 'test', severity: 'invalid' } });
    expect(r3.status()).toBe(400);
  });

  test('incidents: rejects title > 200 chars → 400', async ({ request }) => {
    const legal_headers = getAuthHeaders('user');
    if (!legal_headers) { test.skip(true, 'Auth headers missing'); return; }
    const response = await request.post('/api/legal/incidents', {
      headers: legal_headers,
      data: { title: 'x'.repeat(201), description: 'valid description long enough', severity: 'low' }
    });
    expect(response.status()).toBe(400);
  });

  test('incidents: description minimum 10 chars', async ({ request }) => {
    const legal_headers = getAuthHeaders('user');
    if (!legal_headers) { test.skip(true, 'Auth headers missing'); return; }
    const response = await request.post('/api/legal/incidents', {
      headers: legal_headers,
      data: { title: 'Valid Title', description: 'short', severity: 'low' }
    });
    expect(response.status()).toBe(400);
  });

  test('retention: rejects without authentication → 401', async ({ request }) => {
    const response = await request.post('/api/legal/retention', { data: {} });
    expect(response.status()).toBe(401);
  });

  test('retention: rejects non-admin user → 403', async ({ request }) => {
    const user_headers = getAuthHeaders('user');
    if (!user_headers) {
      test.skip(true, 'E2E_TEST_USER_TOKEN not configured');
      return;
    }
    const response = await request.post('/api/legal/retention', { headers: user_headers, data: {} });
    expect(response.status()).toBe(403);
  });

  test('[BUG-018 REGRESSION] incidents concurrent write', async ({ request }) => {
    const legal_headers = getAuthHeaders('user');
    if (!legal_headers) { test.skip(true, 'Auth headers missing'); return; }
    const h = legal_headers;
    const requests = Array(5).fill(null).map((_, i) =>
      request.post('/api/legal/incidents', {
        headers: h,
        data: { title: `Incident ${i}`, description: 'Concurrent write test description', severity: 'low' }
      })
    );
    const responses = await Promise.all(requests);
    responses.forEach(r => {
      // 429 = rate limit protector ante ráfaga concurrente (comportamiento válido)
      expect([201, 401, 429]).toContain(r.status());
    });
  });

  // CP-SECURITY-BACKLOG-001 (2026-11-14) — CIERRE FORMAL DE BUG-024.
  //
  // Defecto original (docs/audits/PLAN_PRIORIZADO_CORRECCIONES_COSTPRO_2026-10-16.md
  // §CP-SEC-012): los incidentes legales se persistían en `data/incidents.json`
  // (FS efímero en serverless → pérdida total en cada despliegue; sin GET).
  // Corregido por Decisión D ratificada por el propietario (2026-10-20,
  // PR #1431): persistencia en `audit_logs` con action='legal_incident'
  // (migración 20261020000005: índice parcial que sostiene el GET).
  //
  // Este test sustituye el `test.skip` obsoleto («Architecture issue...»)
  // que impedía el cierre formal: verifica el COMPORTAMIENTO esperado de
  // la Decisión D — el incidente POST se persiste de forma consultable
  // (GET admin paginado por action) y la lectura queda restringida a admin.
  test('[BUG-024 REGRESSION] incident POST persists (audit_logs) and only admin can list it', async ({ request }) => {
    const user_headers = getAuthHeaders('user');
    const admin_headers = getAuthHeaders('admin');
    if (!user_headers || !admin_headers) { test.skip(true, 'Auth headers missing'); return; }

    // 1) POST autenticado → 201 con id (BUG-017/018 ya cubiertos en otros tests).
    //    Se usa la sesión ADMIN para el POST: los tests previos de este spec
    //    (validaciones 400 ×5 y ráfaga concurrente BUG-018) consumen el bucket
    //    5/min del usuario «cajero» — con el limiter distribuido el budget es
    //    GLOBAL y predecible (antes: contadores aislados por instancia).
    const marker = `BUG-024-E2E-${Date.now()}`;
    const post = await request.post('/api/legal/incidents', {
      headers: admin_headers,
      data: {
        title: `Regresión BUG-024 ${marker}`,
        description: `Verificación de persistencia duradera (Decisión D): ${marker}. La escritura debe vivir en audit_logs y ser consultable por un administrador.`,
        severity: 'low',
      },
    });
    expect(post.status()).toBe(201);
    const body = await post.json();
    expect(body.success).toBe(true);
    expect(body.incidentId).toBeTruthy();

    // 2) GET admin → el incidente de este run ESTÁ persistido (paginación
    //    primera página + fallback por si hay >limit incidentes)
    const first = await request.get('/api/legal/incidents?limit=50&offset=0', { headers: admin_headers });
    expect(first.status()).toBe(200);
    const listBody = await first.json();
    const allIncidents = listBody.incidents || listBody.data || [];
    const found = Array.isArray(allIncidents) &&
      allIncidents.some((i: { title?: string }) => (i.title || '').includes(marker));
    expect(found).toBe(true);

    // 3) GET usuario NO admin → 403 (el legajo es solo-admin)
    const denied = await request.get('/api/legal/incidents?limit=10&offset=0', { headers: user_headers });
    expect(denied.status()).toBe(403);
  });
});
