/**
 * Test de regresión — CP-POS-007, punto 4 (auditoría 2026-10-16, MISIÓN 2).
 *
 * El path offline del Catálogo de Ventas encola la venta (useCreateSale →
 * sync-engine) y /api/sync/batch la repite contra create_sale_v2. El replay
 * construía v2Payload SIN p_notes: la nota del cajero encolada se perdía
 * (segunda mitad del defecto CP-POS-007).
 *
 * Este contrato de fuente verifica que el mapping op.payload → v2Payload
 * propaga p_notes (y documenta la razón: create_sale_v2 une la nota manual
 * con la automática de incidencias sin sobrescribir, v_notes_final).
 *
 * Patrón: source-contract test (mismo estilo que iteration-11-1.test.ts),
 * porque montar el route completo exige sesiones Supabase reales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const routeSrc = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'sync', 'batch', 'route.ts'),
  'utf-8'
);

describe('CP-POS-007 (punto 4) · /api/sync/batch propaga p_notes al replay V2', () => {
  it('v2Payload incluye p_notes mapeado desde op.payload', () => {
    // Código activo (sin líneas de comentario) para no falsos positivos.
    const activeCode = routeSrc
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    expect(
      activeCode,
      'El mapping del replay debe propagar la nota encolada al RPC'
    ).toContain('p_notes: op.payload.p_notes || null');
  });

  it('el RPC destino sigue siendo create_sale_v2 (contrato del replay)', () => {
    const activeCode = routeSrc
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(activeCode).toContain("supabase.rpc('create_sale_v2', v2Payload)");
  });

  it('create_sale_v2 (migración vigente) acepta p_notes — contrato RPC alineado', () => {
    // La firma del RPC vive en la migración 20261017000000 (pos_payment_incidents).
    // Si el RPC dejara de aceptar p_notes, el replay rompería: este check ancla
    // la coherencia contrato-cliente ↔ contrato-BD.
    const migration = readFileSync(
      join(
        process.cwd(),
        'supabase',
        'migrations',
        '20261017000000_pos_payment_incidents_negative_guard.sql'
      ),
      'utf-8'
    );
    expect(migration).toContain('p_notes text DEFAULT NULL');
    // Y la nota manual no es sobrescrita por la automática (v_notes_final).
    expect(migration).toContain('v_notes_final := NULLIF(btrim(COALESCE(p_notes');
  });
});
