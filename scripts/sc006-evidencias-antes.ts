/**
 * CP-DOC-SC-DATA-MAPPING-006 — Evidencia ANTES: SC-2-04 tal como lo genera
 * el código de origin/main (worktree /tmp/costpro-main) con el mismo caso
 * controlado. El defecto visible: «Almacen Lari» (nombre del proveedor,
 * capturado en reference_doc) aparece como «Número del documento»; códigos
 * de entidad/almacén/proveedor en blanco; transportador como bloque suelto.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
// @ts-expect-error — módulo del worktree ANTES (código de main)
import { buildSc204ModelData, renderSc204Pdf } from '/tmp/costpro-main/src/lib/legal/sc204';

mkdirSync('/home/z/my-project/download/evidencias_sc006/antes_despues', { recursive: true });

const fuente = {
  entidadNombre: 'PUERTO PADRE',
  receipt: {
    id: 'bbbbbbbb-3333-4333-8333-333333333333',
    reference_doc: 'Almacen Lari',
    supplier: 'Almacen Lari',
    reception_date: '2026-11-05T09:00:00-05:00',
    status: 'active',
    store_id: 'store-a',
  },
  items: [
    { quantity: 24, unit_cost: 12.5, moneda_recepcion: 'CUP', products: { name: 'Cemento Portland P-35 TBV', sku: '141', unit_of_measure: 'saco' } },
    { quantity: 8, unit_cost: 64, moneda_recepcion: 'CUP', products: { name: 'Clavo de 2 pulgadas (libra)', sku: 'CL-02', unit_of_measure: 'libra' } },
  ],
  emissionDate: new Date('2026-11-08T15:30:00-05:00'),
};

const model = buildSc204ModelData(fuente as never);
const doc = await renderSc204Pdf(model);
writeFileSync(
  '/home/z/my-project/download/evidencias_sc006/antes_despues/sc204_ANTES_defecto.pdf',
  Buffer.from(doc.output('arraybuffer')),
);
console.log('PDF ANTES generado (código de origin/main):');
console.log(JSON.stringify({
  entidadCodigo: (model as Record<string, unknown>).entidadCodigo,
  almacenNombre: (model as Record<string, unknown>).almacenNombre,
  almacenCodigo: (model as Record<string, unknown>).almacenCodigo,
  proveedorCodigo: (model as Record<string, unknown>).proveedorCodigo,
  documentoNombre: (model as Record<string, unknown>).documentoNombre,
  documentoNumero: (model as Record<string, unknown>).documentoNumero,
}, null, 1));
