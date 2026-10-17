/**
 * Test de regresión — CP-SEC-019 (auditoría 2026-10-16, MISIÓN 2).
 *
 * Defecto: 35→52 rutas API usaban z.string().uuid() (estricto RFC-4122 v4
 * con variant bits). PostgreSQL acepta CUALQUIER 8-4-4-4-12 hex como uuid,
 * y Central/Supabase generan UUIDs sintéticos SIN variant bits → las rutas
 * rechazaban con 400 un ID que la BD considera válido → «Ha ocurrido un
 * error» (incidente real del catálogo, ver docs/audits/
 * INCIDENTE_UUID_INVENTARIO_CATALOGO_CENTRAL_COSTPRO.md).
 *
 * Fix: reemplazo masivo por uuidLoose (fuente única declarada en
 * @/validation/api-schemas) y uuidRegex (@/validation/schemas) cuando hay
 * mensaje de error personalizado.
 *
 * Este contrato NO puede regresar: si alguien reintroduce z.string().uuid()
 * en src/app/api, el test 3 falla.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { uuidLoose } from '@/validation/api-schemas';
import { uuidRegex } from '@/validation/schemas';
import { z } from 'zod';

// ── Fixtures: UUIDs reales del incidente Central ────────────────────────────
// Patrón documentado: hex válido 8-4-4-4-12 PERO sin version/variant bits
// (tercer grupo no empieza por 4 / cuarto grupo no empieza por 8-b).
const SYNTHETIC_CENTRAL_UUIDS = [
  '01234567-89ab-cdef-0123-456789abcdef', // sin bits de variante
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', // versión arbitraria
  '123e4567-e89b-12d3-a456-426614174000', // v1-like: Postgres lo acepta
  '00000000-0000-0000-0000-000000000000', // nil uuid: válido en PG
  'ABCDEF01-2345-6789-ABCD-EF0123456789', // mayúsculas (PG case-insensitive)
];

const GARBAGE_IDS = [
  '',
  'not-a-uuid',
  '12345', // corto
  '12345678-1234-1234-1234-123456789012extra', // largo
  'gggggggg-gggg-gggg-gggg-gggggggggggg', // no-hex
  'null',
  'undefined',
  '12345678123412341234123456789012', // sin guiones
];

describe('CP-SEC-019 · validadores UUID permisivos (contrato Central)', () => {
  it('1 · uuidLoose acepta los UUID sintéticos de Central (defecto original)', () => {
    for (const id of SYNTHETIC_CENTRAL_UUIDS) {
      expect(uuidLoose.safeParse(id).success, `uuidLoose rechazó ${id}`).toBe(true);
    }
  });

  it('2 · uuidLoose sigue RECHAZANDO basura (no se amplió la superficie)', () => {
    for (const id of GARBAGE_IDS) {
      expect(uuidLoose.safeParse(id).success, `uuidLoose aceptó «${id}»`).toBe(false);
    }
  });

  it('3 · uuidRegex acepta sintéticos y rechaza basura (mensaje custom)', () => {
    for (const id of SYNTHETIC_CENTRAL_UUIDS) {
      expect(uuidRegex.test(id), `uuidRegex rechazó ${id}`).toBe(true);
    }
    for (const id of GARBAGE_IDS) {
      expect(uuidRegex.test(id), `uuidRegex aceptó «${id}»`).toBe(false);
    }
  });

  it('4 · REGRESIÓN: cero z.string().uuid() estricto en src/app/api (grep vivo)', () => {
    const root = process.cwd();
    const apiDir = join(root, 'src', 'app', 'api');
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.ts')) {
          const content = readFileSync(full, 'utf-8');
          if (/z\.string\(\)\.uuid\(/.test(content)) {
            offenders.push(relative(root, full));
          }
        }
      }
    }
    walk(apiDir);

    // El defecto original: 52 ocurrencias. El fix: 0. Si reaparece, este
    // test falla y señala exactamente el archivo.
    expect(offenders, `Rutas con z.string().uuid() reintroducido: ${offenders.join(', ')}`).toEqual([]);
  });

  it('5 · contratos representativos de rutas migradas (muestra del codemod)', () => {
    // Simula el contrato POST /api/users/delete tras el fix: user_id uuidLoose.
    const deleteSchema = z.object({ user_id: uuidLoose });
    // ID sintético de Central → aceptado (antes: 400 «Ha ocurrido un error»).
    expect(deleteSchema.safeParse({ user_id: '01234567-89ab-cdef-0123-456789abcdef' }).success).toBe(true);
    // Basura → sigue rechazado (el gate de entrada no se debilitó).
    expect(deleteSchema.safeParse({ user_id: 'cualquier-cosa' }).success).toBe(false);
    expect(deleteSchema.safeParse({ user_id: '' }).success).toBe(false);

    // Contrato service-types (caso con mensaje personalizado → uuidRegex).
    const patchSchema = z.object({
      id: z.string().regex(uuidRegex, 'Identificador de tipo inválido'),
    });
    expect(patchSchema.safeParse({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }).success).toBe(true);
    expect(patchSchema.safeParse({ id: 'xxx' }).success).toBe(false);
    // El mensaje custom sobrevive al reemplazo.
    const bad = patchSchema.safeParse({ id: 'xxx' });
    if (!bad.success) {
      expect(bad.error.issues[0].message).toBe('Identificador de tipo inválido');
    }
  });
});
