/**
 * CP-CAT-MAESTRO-002 — Fase 6/7: ayuda integrada del Catálogo Maestro.
 *
 * Verifica la infraestructura real del Centro de Ayuda:
 *  · Los 3 documentos nuevos existen y tienen títulos/estructura correctos.
 *  · El índice search-keywords.json es JSON válido, sin rutas rotas.
 *  · Las búsquedas exigidas por la misión devuelven documentos del catálogo:
 *    «catálogo maestro», «catálogo de la organización», «conectar tienda»,
 *    «producto compartido», «activar producto» (con y sin tildes).
 *  · HELP_DOC_BY_VIEW apunta la vista organizations a la guía del catálogo
 *    (contrato existente: el botón «?» nunca apunta a un doc inexistente).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const KNOWLEDGE = path.join(process.cwd(), 'knowledge');
const HELP = path.join(KNOWLEDGE, 'help');

const DOCS_NUEVOS = [
  'help/02-como-hacer/30-como-usar-catalogo-de-la-organizacion.md',
  'help/04-explicacion/09-que-es-catalogo-maestro.md',
  'help/03-referencia/10-catalogo-maestro-campos.md',
];

const keywords = JSON.parse(fs.readFileSync(path.join(HELP, 'search-keywords.json'), 'utf8')) as Record<string, string[]>;

/** Réplica exacta del matching de /api/help-docs (fase 8: alias/sinónimos). */
function buscar(query: string): string[] {
  const q = query.toLowerCase();
  const hits = new Set<string>();
  for (const [term, docPaths] of Object.entries(keywords)) {
    if (term.startsWith('_')) continue;
    if (term.includes(q) || q.includes(term)) {
      for (const p of docPaths) hits.add(p);
    }
  }
  return [...hits];
}

describe('Ayuda integrada — Catálogo Maestro (CP-CAT-MAESTRO-002)', () => {
  it.each(DOCS_NUEVOS)('existe el documento %s', (doc) => {
    expect(fs.existsSync(path.join(KNOWLEDGE, doc))).toBe(true);
  });

  it('la guía procedural explica acceso, conexión, activación, creación y desconexión verificadas', () => {
    const s = fs.readFileSync(path.join(KNOWLEDGE, DOCS_NUEVOS[0]), 'utf8');
    expect(s).toContain('Catálogo de la organización');
    expect(s).toContain('SISTEMA → Organizaciones');
    expect(s).toMatch(/Procedimiento 2 — Conectar una tienda/);
    expect(s).toMatch(/Procedimiento 3 — Activar un producto existente/);
    expect(s).toMatch(/Procedimiento 4 — Crear un producto nuevo/);
    expect(s).toMatch(/Procedimiento 7 — Desconectar una tienda/);
    // No presenta funcionalidades proyectadas como existentes
    expect(s).not.toMatch(/próximamente|en desarrollo|futuro se podrá/i);
  });

  it('la referencia separa campos compartidos de locales y declara la regla de oro', () => {
    const s = fs.readFileSync(path.join(KNOWLEDGE, DOCS_NUEVOS[2]), 'utf8');
    expect(s).toMatch(/\| SKU \| Catálogo maestro/);
    expect(s).toMatch(/\| Precio de venta y moneda \| Fila local/);
    expect(s).toMatch(/no.*comparte precios, costos, existencias/i);
  });

  it('el índice de sinónimos no contiene rutas rotas', () => {
    for (const [term, docPaths] of Object.entries(keywords)) {
      if (term.startsWith('_')) continue;
      for (const p of docPaths) {
        expect(fs.existsSync(path.join(KNOWLEDGE, p)), `término «${term}» → ${p} inexistente`).toBe(true);
      }
    }
  });

  it.each([
    'catálogo maestro',
    'catalogo maestro',
    'catálogo de la organización',
    'catalogo de la organizacion',
    'conectar tienda',
    'producto compartido',
    'activar producto',
  ])('la búsqueda «%s» devuelve documentos del catálogo maestro', (query) => {
    const res = buscar(query);
    expect(res.length).toBeGreaterThan(0);
    expect(res.some(p => p.includes('catalogo'))).toBe(true);
  });

  it('HELP_DOC_BY_VIEW apunta la vista organizations a la guía del catálogo (doc existente)', async () => {
    const { HELP_DOC_BY_VIEW } = await import('@/components/views/terminal/views/help/HelpLauncher');
    expect(HELP_DOC_BY_VIEW['organizations']).toBe('help/02-como-hacer/30-como-usar-catalogo-de-la-organizacion.md');
    for (const docPath of Object.values(HELP_DOC_BY_VIEW)) {
      expect(fs.existsSync(path.join(KNOWLEDGE, docPath)), `mapeo roto: ${docPath}`).toBe(true);
    }
  });
});
