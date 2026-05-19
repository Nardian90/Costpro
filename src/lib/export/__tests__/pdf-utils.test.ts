import { expect, test } from 'vitest';
import { sanitizeAnnexTitle, isSectionHeaderRedundant } from '../pdf-generator-utils';

test('sanitizeAnnexTitle removes redundant IDs', () => {
  expect(sanitizeAnnexTitle('I', 'ANEXO I: I - DESGLOSE')).toBe('ANEXO I: DESGLOSE');
  expect(sanitizeAnnexTitle('II', 'II - Mano de Obra')).toBe('ANEXO II: Mano de Obra');
  expect(sanitizeAnnexTitle('1', '1. Materiales')).toBe('ANEXO 1: Materiales');
});

test('isSectionHeaderRedundant detects matching labels', () => {
  const sectionLabel = 'Sección 1: Gasto Material';
  const rows = [{ label: 'GASTO MATERIAL' }];
  expect(isSectionHeaderRedundant(sectionLabel, rows)).toBe(true);

  const sectionLabel2 = 'SALARIO DIRECTO';
  const rows2 = [{ label: 'Salario Directo' }];
  expect(isSectionHeaderRedundant(sectionLabel2, rows2)).toBe(true);
});
