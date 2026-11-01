/**
 * E2E — CP-OFFERS-PUERTOPADRE-002 (F-1): guard de store_id en PATCH.
 *
 * La ruta PATCH /api/ofertas/[id] escribe con service_role (bypass de RLS).
 * El check de autorización validaba la tienda ORIGEN pero no el store_id del
 * payload: un miembro con rol de escritura podía mover la oferta a una tienda
 * ajena (RLS directo lo deniega con 42501 — verificado). Este spec certifica
 * el fix: el cambio de tienda se rechaza con 400 y la oferta no se mueve.
 */
import { test, expect } from '@playwright/test';
import { signIn, apiHeaders, sb } from './fixtures/session.fixture';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || '';
const PILOT_A = process.env.E2E_PILOT_STORE_A || '';
const PILOT_B = process.env.E2E_PILOT_STORE_B || '';
const runTag = `F1G-${Date.now().toString(36)}`;
const createdIds: string[] = [];

test.beforeAll(async () => {
  test.skip(!PILOT_A || !PILOT_B || !ADMIN_EMAIL, 'entorno aislado incompleto');
});

test.afterAll(async () => {
  for (const id of createdIds) await sb.delete('ofertas', `id=eq.${id}`).catch(() => {});
});

test('F-1: PATCH con store_id de otra tienda → 400 y la oferta NO se mueve', async ({ request }) => {
  const admin = await signIn(ADMIN_EMAIL, ADMIN_PASS);

  const create = await request.post('/api/ofertas', {
    headers: apiHeaders(admin.token),
    data: {
      store_id: PILOT_A,
      numero: `${runTag}-1`,
      fecha: new Date().toLocaleDateString('en-CA'),
      objeto: 'Spec F-1 guard',
      suministrador: { empresa: 'S' },
      cliente: { empresa: 'C' },
      productos: [{ codigo: 'X', descripcion: 'p', um: 'U', cantidad: 1, precio_unitario: 100 }],
    },
  });
  expect(create.status()).toBe(201);
  const { data } = await create.json();
  createdIds.push(data.id);

  // Intento de mover a PILOT_B (ajena)
  const move = await request.patch(`/api/ofertas/${data.id}`, {
    headers: apiHeaders(admin.token),
    data: { store_id: PILOT_B },
  });
  expect(move.status()).toBe(400);
  const body = await move.json();
  expect(body.message).toMatch(/no se puede cambiar la tienda/i);

  // Verificación directa en PostgreSQL: la oferta SIGUE en PILOT_A
  const rows = await sb.select<{ store_id: string }>('ofertas', `id=eq.${data.id}&select=store_id&limit=1`);
  expect(rows[0].store_id).toBe(PILOT_A);

  // Edición normal (mismo store_id explícito) → sigue funcionando
  const edit = await request.patch(`/api/ofertas/${data.id}`, {
    headers: apiHeaders(admin.token),
    data: { store_id: PILOT_A, objeto: 'Editado con mismo store_id' },
  });
  expect(edit.status()).toBe(200);
  const rows2 = await sb.select<{ store_id: string; objeto: string }>('ofertas', `id=eq.${data.id}&select=store_id,objeto&limit=1`);
  expect(rows2[0].store_id).toBe(PILOT_A);
  expect(rows2[0].objeto).toBe('Editado con mismo store_id');
});
