/**
 * CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001 — Evidencia visual del PDF SC-2-04
 * con/sin valores económicos (§1 de la misión).
 * ============================================================================
 * Produce PDFs REALES con el generador de producción (renderSc204Pdf, sin
 * mocks de librería) para los mismos datos de entrada EN AMBOS MODOS:
 *
 *   1. con-valores        — 6 líneas (comportamiento vigente; control).
 *   2. sin-valores        — MISMAS 6 líneas; sin Precio unitario/Importe ni
 *                           totales; anchos redistribuidos.
 *   3. sin-valores-largo  — 40 líneas con descripciones largas (varias
 *                           páginas; el modo sin valores se mantiene en todo
 *                           el documento y no hay ningún importe).
 *   4. con-valores-largo  — control multipágina del modo con valores.
 *
 * Uso (desde la raíz del repo):
 *   bun scripts/dev-recep001-pdf-evidence.ts <prefijo> [destino]
 */
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { renderSc204Pdf, sc204FileName, type Sc204ModelData } from '../src/lib/legal/sc204';

const PREFIX = process.argv[2] || 'despues';
const DEST = process.argv[3] || '/home/z/my-project/download/cp-recep-001/evidencia/pdf';
mkdirSync(DEST, { recursive: true });

// Logo real de la app (misma fuente que usa el navegador).
import { readFileSync } from 'node:fs';
const logoBytes = readFileSync(resolve(process.cwd(), 'public/logo.png'));
const LOGO_DATAURL = `data:image/png;base64,${logoBytes.toString('base64')}`;

function lineas(n: number, conValores: boolean): Sc204ModelData['lineas'] {
  return Array.from({ length: n }, (_, i) => ({
    codigo: `MAT-${String(1000 + i)}`,
    descripcion: `Cemento P-350 saco 50 kg — lote ${i + 1} (material de construcción para obra civil, uso estructural)`,
    unidadMedida: 'saco',
    cantidad: String(10 + i),
    precioUnitario: conValores ? `${(38.5 + i * 0.25).toFixed(2)} CUP` : '',
    importe: conValores ? `${((10 + i) * (38.5 + i * 0.25)).toFixed(2)} CUP` : '',
    saldoExistencia: String(120 + i * 7),
  }));
}

function baseModel(conValores: boolean, n: number, id: string): Sc204ModelData {
  return {
    logoUrl: LOGO_DATAURL,
    entidadNombre: 'ENERVIDA-VITALLCONS',
    entidadCodigo: '2',
    almacenNombre: 'ENERVIDA-VITALLCONS',
    almacenCodigo: '2',
    fechaEmision: '25/11/2026',
    proveedorNombre: 'Laudelina Olivera (Lary)',
    proveedorCodigo: 'J-31015873-2',
    documentoNombre: 'Entrada',
    documentoNumero: 'ENT-000004-2026',
    fechaRecepcion: '24/11/2026',
    transportadorNombre: '',
    transportadorCarne: '',
    transportadorChapa: '',
    transportadorCasilla: '',
    transportadorGuiaAerea: '',
    lineas: lineas(n, conValores),
    importesTotales: conValores
      ? [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '3 012.75 CUP' }]
      : [],
    numeroConsecutivo: '',
    identificadorRecepcion: id,
    // CP-RECEP-001 §1: sin nota de saldo (todas las líneas derivadas del ledger)
    saldoNota: '',
    incluirValoresEconomicos: conValores,
  };
}

const CASOS: Array<{ id: string; model: Sc204ModelData }> = [
  { id: 'con-valores', model: baseModel(true, 6, 'cd921832') },
  { id: 'sin-valores', model: baseModel(false, 6, 'cd921832') },
  { id: 'con-valores-largo', model: baseModel(true, 40, '47380573') },
  { id: 'sin-valores-largo', model: baseModel(false, 40, '47380573') },
];

for (const { id, model } of CASOS) {
  const doc = await renderSc204Pdf(model);
  const bytes = doc.output('arraybuffer') as ArrayBuffer;
  const name = `${PREFIX}_${id}_${sc204FileName(model.identificadorRecepcion)}`;
  const out = join(DEST, name);
  writeFileSync(out, Buffer.from(bytes));
  console.log(`OK: ${name} (${bytes.byteLength} bytes)`);
}
console.log(`Evidencias en ${DEST}`);
