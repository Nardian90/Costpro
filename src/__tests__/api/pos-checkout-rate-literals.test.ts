/**
 * Test guardián — CP-POS-008 (Misión Continua 2026-10-21).
 *
 * El fallback USD/CUP = 680 estaba duplicado como literal mágico en 5
 * archivos del POS (11+ apariciones). El drift entre copias era el riesgo
 * real: cambiar la tasa en un punto y no en los demás produce conversiones
 * incoherentes entre Vender, Catálogo de Ventas, importación y exportación.
 *
 * Regla desde el fix: la ÚNICA definición vive en `USD_CUP_RATE`
 * (src/lib/utils.ts, documentada como fallback de legacy — la fuente
 * autoritativa es la tasa configurada de la tienda, /api/store-rates).
 * Este test impide que vuelva a sembrarse un literal 680 de tasa en src/.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const SRC_ROOT = join(process.cwd(), 'src');
const EXEMPT = new Set([
  // La definición canónica del fallback (documentada) vive aquí:
  'lib/utils.ts',
  // Documentación/comentarios de contratos que citan el valor histórico:
  'validation/api-schemas.ts',
  'app/api/store-rates/route.ts',
  // Módulo de Inteligencia de Cambio: su tabla FALLBACK_INFORMAL es del
  // dominio del MERCADO INFORMAL multi-moneda (USD:650/EUR:680/MLC:650),
  // distinta de la tasa de venta del POS — consolidarla sería semánticamente
  // incorrecto (el 680 de allí es EUR, no USD).
  'components/views/terminal/views/exchange_intelligence/ExchangeIntelligenceView.tsx',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (['.ts', '.tsx'].includes(extname(name)) && !name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

// Patrones que representan un LITERAL de tasa hardcodeado (no menciones
// históricas en texto de comentarios sobre la tasa vigente de la tienda).
const RATE_LITERAL = /(:\s*680\b|\|\|\s*680\b|=\s*680;)/;

describe('CP-POS-008 — fuente única del fallback de tasa USD', () => {
  it('ningún archivo fuera de la exención declara un literal de tasa 680', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = file.replace(SRC_ROOT + '/', '');
      if (EXEMPT.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      if (RATE_LITERAL.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('la constante canónica existe y todos los consumidores la importan', () => {
    const utils = readFileSync(join(SRC_ROOT, 'lib/utils.ts'), 'utf8');
    expect(utils).toContain('export const USD_CUP_RATE = 680;');

    const consumers = [
      'components/views/terminal/views/pos/usePOSCheckout.ts',
      'components/views/terminal/views/pos/salesCatalogExport.ts',
      'components/views/terminal/views/pos/useSalesCatalog.ts',
      'components/views/terminal/views/pos/salesCatalogImport.ts',
    ];
    for (const rel of consumers) {
      const src = readFileSync(join(SRC_ROOT, rel), 'utf8');
      expect(src, rel).toContain("USD_CUP_RATE");
      expect(src, rel).toContain("@/lib/utils");
    }
  });
});
