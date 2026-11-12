import { describe, it, expect } from 'vitest';
import {
  SYSTEM_FC_TEMPLATES,
  SYSTEM_TEMPLATE_IDS,
  isSystemTemplateId,
  getSystemTemplateMeta,
  mergeFCTemplateOptions,
  type TemplateOptionLike,
} from '@/lib/integration/fc-system-templates';

// ============================================
// Helpers
// ============================================

function rec(overrides: Partial<TemplateOptionLike>): TemplateOptionLike {
  return {
    id: 'x',
    name: 'n',
    description: null,
    category: null,
    data: {},
    type: 'private',
    created_by: null,
    store_id: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

const UUID_A = 'a1111111-1111-4111-8111-111111111111';
const UUID_B = 'b2222222-2222-4222-8222-222222222222';

// ============================================
// Tests
// ============================================

describe('fc-system-templates (FC-SYS-TEMPLATES 2026-11-13)', () => {
  it('expone el catálogo completo de 13 plantillas de sistema', () => {
    expect(SYSTEM_FC_TEMPLATES.length).toBe(13);
  });

  it('las claves son únicas y no colisionan con UUID de BD', () => {
    const ids = SYSTEM_FC_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(13);
    for (const id of ids) {
      expect(id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  });

  it('incluye las 13 claves del TEMPLATE_REGISTRY server-side', () => {
    // Espejo de TEMPLATE_REGISTRY (fc-generator-service.ts) — la fuente server
    // resuelve estas claves; si se añade una plantilla al registro, este
    // catálogo debe actualizarse en el mismo commit.
    const registryKeys = [
      'costpro-reinicio', 'template-pizza', 'template-juice', 'template-icecream',
      'template-shoes', 'template-furniture', 'template-repair', 'template-consultancy',
      'template-logistics', 'template-industrial', 'template-lavar', 'template-pastry',
      'costpro-ejemplo',
    ];
    for (const key of registryKeys) {
      expect(SYSTEM_TEMPLATE_IDS.has(key)).toBe(true);
    }
  });

  it('cada plantilla tiene nombre, descripción y categoría legibles', () => {
    for (const t of SYSTEM_FC_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.category.length).toBeGreaterThan(2);
    }
  });

  it('isSystemTemplateId: claves de registro sí, alias/UUID/basura no', () => {
    expect(isSystemTemplateId('costpro-reinicio')).toBe(true);
    expect(isSystemTemplateId('template-pizza')).toBe(true);
    // Alias del explorador histórico y valores no válidos → false (fail-closed)
    expect(isSystemTemplateId('sys-pizza')).toBe(false);
    expect(isSystemTemplateId(UUID_A)).toBe(false);
    expect(isSystemTemplateId('')).toBe(false);
    expect(isSystemTemplateId(null)).toBe(false);
    expect(isSystemTemplateId(undefined)).toBe(false);
  });

  it('getSystemTemplateMeta resuelve metadata y falla con null', () => {
    const meta = getSystemTemplateMeta('costpro-reinicio');
    expect(meta?.name).toBe('CostPro — Reinicio (General)');
    expect(getSystemTemplateMeta('no-existe')).toBeNull();
    expect(getSystemTemplateMeta(null)).toBeNull();
  });
});

describe('mergeFCTemplateOptions (fusión de procedencias)', () => {
  it('sin plantillas de BD: solo sistema (13)', () => {
    const merged = mergeFCTemplateOptions([]);
    expect(merged.length).toBe(13);
    expect(merged.every(t => t.type === 'system')).toBe(true);
  });

  it('ordena: privadas → públicas → sistema', () => {
    const db = [
      rec({ id: UUID_B, type: 'public', name: 'Pública' }),
      rec({ id: UUID_A, type: 'private', name: 'Privada' }),
    ];
    const merged = mergeFCTemplateOptions(db);
    expect(merged[0].id).toBe(UUID_A);          // privada primero
    expect(merged[1].id).toBe(UUID_B);          // pública después
    expect(merged[2].type).toBe('system');      // sistema al final
    expect(merged.length).toBe(2 + 13);
  });

  it('deduplica por id (públicas duplicadas entre queries)', () => {
    const db = [
      rec({ id: UUID_A, type: 'public' }),
      rec({ id: UUID_A, type: 'public' }),
      rec({ id: UUID_B, type: 'private' }),
    ];
    const merged = mergeFCTemplateOptions(db);
    expect(merged.filter(t => t.id === UUID_A).length).toBe(1);
  });

  it('ordena por updated_at desc dentro de cada procedencia', () => {
    const db = [
      rec({ id: UUID_B, type: 'private', updated_at: '2026-01-01' }),
      rec({ id: UUID_A, type: 'private', updated_at: '2026-06-01' }),
    ];
    const merged = mergeFCTemplateOptions(db);
    expect(merged[0].id).toBe(UUID_A); // más reciente primero
  });

  it('la lista final nunca queda vacía: sistema siempre disponible', () => {
    // Síntoma reportado por el propietario: «solo aparecen las privadas» —
    // con la fusión, aun sin privadas ni públicas el catálogo de sistema
    // ofrece 13 opciones válidas.
    const merged = mergeFCTemplateOptions([]);
    expect(merged.length).toBeGreaterThan(0);
  });
});
