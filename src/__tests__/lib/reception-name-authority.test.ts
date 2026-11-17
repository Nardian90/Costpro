/**
 * CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 — helper de AUTORIDAD DEL NOMBRE.
 *
 * Contrato (misión §1/§4/§6):
 *   · El nombre del Catálogo Maestro es el OFICIAL para productos existentes
 *     (clases A/B/C). El Excel no puede modificarlo, sustituirlo ni
 *     sobrescribirlo.
 *   · Solo un producto VERDADERAMENTE nuevo (clase D / alta sin maestro) toma
 *     su nombre inicial del Excel.
 *   · La diferencia de nombres NO es error: se informa en la previsualización
 *     SOLO cuando difieren (§6); si coinciden, sin advertencia.
 *   · Degradación segura: sin `effective_name` (backend aún sin migrar) se usa
 *     `master_name`; sin este, el nombre del Excel (fidelidad).
 */
import { describe, it, expect } from 'vitest';
import { effectiveImportName, importNameDiffers } from '@/lib/receptions/name-authority';

describe('CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 — effectiveImportName', () => {
  it('CASO A · existente activo: el maestro impone su nombre aunque el Excel difiera', () => {
    expect(effectiveImportName({
      effectiveName: 'ABRAZADERA METÁLICA 3/4',
      masterName: 'ABRAZADERA METÁLICA 3/4',
      name: 'Abrazadera 3/4',
    })).toBe('ABRAZADERA METÁLICA 3/4');
  });

  it('CASO B/C · activación/reactivación: nombre canónico del maestro (no el del Excel)', () => {
    expect(effectiveImportName({
      effectiveName: 'Brida Nylon 200mm',
      masterName: 'BRIDA NYLON 200MM',
      name: 'brida 200',
    })).toBe('Brida Nylon 200mm');
  });

  it('CASO D · verdaderamente nuevo: el nombre del Excel es el nombre inicial del maestro', () => {
    expect(effectiveImportName({
      effectiveName: 'Tuerca Galvanizada M10 (nueva)',
      masterName: null,
      name: 'Tuerca Galvanizada M10 (nueva)',
    })).toBe('Tuerca Galvanizada M10 (nueva)');
  });

  it('Diferencias de mayúsculas/espacios NO alteran la autoridad: se usa el canónico vigente', () => {
    expect(effectiveImportName({
      effectiveName: 'Cemento Cola 25kg',
      masterName: 'Cemento Cola 25kg',
      name: '  cemento cola  25 KG ',
    })).toBe('Cemento Cola 25kg');
  });

  it('Degradación segura: sin effective_name usa master_name (backend aún sin migrar)', () => {
    expect(effectiveImportName({
      effectiveName: null,
      masterName: 'Nombre Maestro Canónico',
      name: 'Nombre Excel',
    })).toBe('Nombre Maestro Canónico');
  });

  it('Último recurso: sin maestro ni effective_name, el nombre del Excel (nuevo / no conectada)', () => {
    expect(effectiveImportName({
      effectiveName: null,
      masterName: null,
      name: 'Alta Local Sin Maestro',
    })).toBe('Alta Local Sin Maestro');
  });
});

describe('CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 — importNameDiffers (§6)', () => {
  it('Diferencia Excel↔maestro → se informa en la previsualización', () => {
    expect(importNameDiffers({
      masterName: 'ABRAZADERA METÁLICA 3/4',
      name: 'Abrazadera 3/4',
    })).toBe(true);
  });

  it('Nombres coincidentes → SIN advertencia (§6: no es error)', () => {
    expect(importNameDiffers({
      masterName: 'ABRAZADERA METÁLICA 3/4',
      name: 'ABRAZADERA METÁLICA 3/4',
    })).toBe(false);
  });

  it('Sin maestro (verdaderamente nuevo) → sin advertencia: el Excel bautiza el nuevo', () => {
    expect(importNameDiffers({
      masterName: null,
      name: 'Producto Nuevo del Excel',
    })).toBe(false);
  });
});
