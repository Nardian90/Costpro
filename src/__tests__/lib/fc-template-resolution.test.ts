import { describe, it, expect } from 'vitest';
import {
  isUuidTemplateId,
  inferModalidadFromTemplate,
  isTemplateVisibleToUser,
  hasStoreMembership,
} from '@/lib/integration/fc-template-resolution';
import type { UserStoreMembership, UserRole } from '@/types';

type SessionLike = { id: string; role: UserRole; memberships: UserStoreMembership[] };

function sessionOf(role: UserRole, memberships: UserStoreMembership[] = []): SessionLike {
  return { id: 'user-session', role, memberships };
}

// ============================================
// isUuidTemplateId
// ============================================

describe('isUuidTemplateId', () => {
  it('reconoce un UUID válido (referencia a cost_sheet_templates)', () => {
    expect(isUuidTemplateId('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isUuidTemplateId('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')).toBe(true); // mayúsculas
  });

  it('rechaza claves de plantilla de sistema', () => {
    expect(isUuidTemplateId('costpro-reinicio')).toBe(false);
    expect(isUuidTemplateId('template-pizza')).toBe(false);
    expect(isUuidTemplateId('sys-juice')).toBe(false);
  });

  it('rechaza valores vacíos o malformados', () => {
    expect(isUuidTemplateId(null)).toBe(false);
    expect(isUuidTemplateId(undefined)).toBe(false);
    expect(isUuidTemplateId('')).toBe(false);
    expect(isUuidTemplateId('not-a-uuid')).toBe(false);
    expect(isUuidTemplateId('11111111-2222-4333-8444')).toBe(false); // incompleto
  });
});

// ============================================
// inferModalidadFromTemplate
// ============================================

describe('inferModalidadFromTemplate', () => {
  it('infiere modalidad válida del header.destination', () => {
    expect(inferModalidadFromTemplate({ header: { destination: 'servicios' } })).toBe('servicios');
    expect(inferModalidadFromTemplate({ header: { destination: 'produccion' } })).toBe('produccion');
    expect(inferModalidadFromTemplate({ header: { destination: 'comercializacion' } })).toBe('comercializacion');
  });

  it('cae al default ante destination inválido o ausente', () => {
    expect(inferModalidadFromTemplate({ header: { destination: 'otra-cosa' } })).toBe('produccion');
    expect(inferModalidadFromTemplate({ header: {} })).toBe('produccion');
    expect(inferModalidadFromTemplate(null)).toBe('produccion');
    expect(inferModalidadFromTemplate(undefined)).toBe('produccion');
  });

  it('respeta el fallback explícito', () => {
    expect(inferModalidadFromTemplate({ header: {} }, 'servicios')).toBe('servicios');
    expect(inferModalidadFromTemplate(null, 'comercializacion')).toBe('comercializacion');
  });

  // FC-MODALIDAD-FIX (misión 2026-11-13): fichas guardadas desde el editor
  // llevaban 'producción'/'comercialización' CON tilde (opciones históricas del
  // HeaderEditor) — la inferencia anterior nunca matcheaba y caía SIEMPRE al
  // default. La comparación es ahora normalizada (tildes + caja).
  it('normaliza tildes y mayúsculas de destination (variantes históricas del editor)', () => {
    expect(inferModalidadFromTemplate({ header: { destination: 'producción' } })).toBe('produccion');
    expect(inferModalidadFromTemplate({ header: { destination: 'Comercialización' } })).toBe('comercializacion');
    expect(inferModalidadFromTemplate({ header: { destination: 'SERVICIOS' } })).toBe('servicios');
    expect(inferModalidadFromTemplate({ header: { destination: ' Producción ' } })).toBe('produccion');
  });

  it('sigue cayendo al default ante valores realmente desconocidos', () => {
    expect(inferModalidadFromTemplate({ header: { destination: 'producción industrial' } })).toBe('produccion');
    expect(inferModalidadFromTemplate({ header: { destination: 42 } })).toBe('produccion');
  });
});

// ============================================
// hasStoreMembership
// ============================================

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const STORE_B = 'b2222222-2222-4222-8222-222222222222';

function membershipsOf(...rows: Array<[string, string, 'active' | 'revoked']>): UserStoreMembership[] {
  return rows.map(([store_id, role, status]) => ({ store_id, role, status } as UserStoreMembership));
}

describe('hasStoreMembership', () => {
  it('admite a admin global sin membresías', () => {
    expect(hasStoreMembership({ role: 'admin', memberships: [] }, STORE_A, ['admin', 'manager', 'encargado', 'costo'])).toBe(true);
  });

  it('admite a superadmin global', () => {
    expect(hasStoreMembership({ role: 'superadmin', memberships: [] }, STORE_A, ['encargado'])).toBe(true);
  });

  it('admite miembro activo con rol autorizado en la tienda', () => {
    expect(
      hasStoreMembership(
        { role: 'usuario', memberships: membershipsOf([STORE_A, 'encargado', 'active']) },
        STORE_A,
        ['admin', 'manager', 'encargado', 'costo'],
      ),
    ).toBe(true);
  });

  it('rechaza miembro con rol no autorizado (clerk)', () => {
    expect(
      hasStoreMembership(
        { role: 'usuario', memberships: membershipsOf([STORE_A, 'clerk', 'active']) },
        STORE_A,
        ['admin', 'manager', 'encargado', 'costo'],
      ),
    ).toBe(false);
  });

  it('rechaza miembro revocado', () => {
    expect(
      hasStoreMembership(
        { role: 'usuario', memberships: membershipsOf([STORE_A, 'encargado', 'revoked']) },
        STORE_A,
        ['admin', 'manager', 'encargado', 'costo'],
      ),
    ).toBe(false);
  });

  it('rechaza miembro de OTRA tienda (aislamiento multitienda)', () => {
    expect(
      hasStoreMembership(
        { role: 'usuario', memberships: membershipsOf([STORE_B, 'encargado', 'active']) },
        STORE_A,
        ['admin', 'manager', 'encargado', 'costo'],
      ),
    ).toBe(false);
  });
});

// ============================================
// isTemplateVisibleToUser — espejo manual de la RLS de cost_sheet_templates
// ============================================

describe('isTemplateVisibleToUser', () => {
  it('admin global ve todo', () => {
    const session = sessionOf('admin');
    expect(isTemplateVisibleToUser({ type: 'private', created_by: 'user-1', store_id: null }, session)).toBe(true);
    expect(isTemplateVisibleToUser({ type: 'public', created_by: null, store_id: STORE_B }, session)).toBe(true);
  });

  it('plantilla privada SOLO visible para su propietario', () => {
    const owner = sessionOf('usuario');
    const other = { ...sessionOf('usuario'), id: 'user-2' };

    expect(isTemplateVisibleToUser({ type: 'private', created_by: 'user-1', store_id: null }, { ...owner, id: 'user-1' })).toBe(true);
    // Exposición de plantillas de otra cuenta — bloqueada
    expect(isTemplateVisibleToUser({ type: 'private', created_by: 'user-1', store_id: null }, other)).toBe(false);
    expect(isTemplateVisibleToUser({ type: 'private', created_by: null, store_id: null }, other)).toBe(false);
  });

  it('plantilla pública global visible para cualquier autenticado', () => {
    const session = sessionOf('usuario');
    expect(isTemplateVisibleToUser({ type: 'public', created_by: 'user-1', store_id: null }, session)).toBe(true);
  });

  it('plantilla pública de tienda X visible solo con membresía en X', () => {
    const member = sessionOf('usuario', membershipsOf([STORE_A, 'clerk', 'active']));
    const outsider = sessionOf('usuario', membershipsOf([STORE_B, 'admin', 'active']));

    expect(isTemplateVisibleToUser({ type: 'public', created_by: 'user-1', store_id: STORE_A }, member)).toBe(true);
    expect(isTemplateVisibleToUser({ type: 'public', created_by: 'user-1', store_id: STORE_A }, outsider)).toBe(false);
  });

  it('plantillas de sistema visibles para todos', () => {
    const session = sessionOf('usuario');
    expect(isTemplateVisibleToUser({ type: 'system', created_by: null, store_id: null }, session)).toBe(true);
  });
});
