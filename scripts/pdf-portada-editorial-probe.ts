/**
 * CP-UX-FINAL-POLISH-003 · Sonda visual de la portada editorial.
 * Construye un InformeEjecutivo sintético que ejercita los caminos que los
 * fixtures de pdf-informe-stress.ts no producen:
 *   · Banda «Líder del período» (nombre + participación).
 *   · Cobertura insuficiente presente/ausente.
 *   · Indicador NO reconocido → defensa de integridad §9 («OTROS INDICADORES»).
 * Re-ejecutable: bun run scripts/pdf-portada-editorial-probe.ts --out <dir>
 * NO toca BD ni datos reales: modelo en memoria.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildInformeEjecutivoPdf, informeEjecutivoFileName } from '@/components/views/terminal/views/product_comparison/informe-ejecutivo-pdf';
import type { InformeEjecutivo } from '@/lib/product-comparison/informe';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : '/tmp/probe-portada';
mkdirSync(outDir, { recursive: true });

const meta = {
  entidadNombre: 'ENERVIDA-VITALLCONS',
  titulo: 'INFORME EJECUTIVO DE DESEMPEÑO COMERCIAL Y ABASTECIMIENTO' as const,
  periodoActual: { desde: '2026-11-01', hasta: '2026-11-24' },
  periodoComparacion: { desde: '2026-10-01', hasta: '2026-10-24' },
  generadoEl: new Date().toISOString(),
  ambito: 'ENERVIDA-VITALLCONS',
  diasPeriodo: 24,
  parametros: ['Top 20 por ingresos'],
};

const base = {
  meta,
  situacionGeneral: ['Párrafo de prueba de la situación general del conjunto comparado.'],
  conclusionGerencial: 'Conclusión gerencial de prueba para la sonda visual.',
  indicadores: [
    { label: 'Ingresos del conjunto comparado', value: '$1,472,605.00 CUP' },
    { label: 'Variación vs. tramo comparable', value: '-$1,915,360.00 CUP (-56.5%)' },
    { label: 'Productos con crecimiento relevante (+50% o más)', value: '3' },
    { label: 'Productos con contracción (-50% o más)', value: '15' },
    { label: 'Productos sin ventas en el tramo (con antecedente)', value: '13' },
    { label: 'Agotados con antecedentes de ventas', value: '11' },
    { label: 'Con cobertura estimada insuficiente', value: '5' },
    { label: 'Lider del período', value: 'Inversor — 25.8% de participación' },
    // Defensa §9: indicador futuro no clasificado no puede perderse.
    { label: 'Indicador futuro no clasificado (prueba)', value: '99' },
  ],
  prioridades: [],
  complementarias: [],
  grafico: null,
  anexos: [],
  metodologia: [{ titulo: 'Fuente de datos', parrafos: ['Prueba.'] }],
} as unknown as InformeEjecutivo;

const doc = await buildInformeEjecutivoPdf(base);
const bytes = Buffer.from(doc.output('arraybuffer'));
const dest = join(outDir, 'probe_portada_editorial.pdf');
writeFileSync(dest, bytes);
console.log(`OK → ${dest} (${Math.round(bytes.length / 1024)} KB · ${doc.getNumberOfPages()} pág)`);
console.log(`Nombre oficial: ${informeEjecutivoFileName(base)}`);
