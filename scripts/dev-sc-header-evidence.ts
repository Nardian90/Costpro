/**
 * CP-DOC-SC-HEADER-UX-005 — Generador de evidencias visuales del encabezado
 * de los modelos SC (Res. No. 11/2007 MFP).
 * ============================================================================
 * Produce PDFs REALES con el generador de producción (sin mocks de librería)
 * para los casos de prueba de la misión §7:
 *
 *   1. Organización con logo y nombre corto.          → caso corto
 *   2. Organización con logo y nombre extenso.        → caso nombre-largo
 *   3. Organización sin logo.                         → caso sin-logo
 *   4. Título documental extenso (SC-2-04).           → caso titulo-largo
 *   5. Campos administrativos completos.              → caso corto (fecha + consecutivo)
 *   6. Consecutivo disponible y ausente.              → caso consecutivo / resto
 *   7. Documentos de varias páginas.                  → caso multipagina
 *   9. Organizaciones diferentes.                     → cada caso usa su tienda
 *
 * Uso (desde la raíz del repo):
 *   bun scripts/dev-sc-header-evidence.ts <prefijo> [destino]
 *
 * El prefijo permite etiquetar la tanda (p. ej. «antes» / «despues») y comparar
 * ANTES/DESPUÉS con IDÉNTICOS datos de entrada.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { renderSc204Pdf, sc204FileName } from '../src/lib/legal/sc204';
import { renderSc201Pdf, buildSc201ModelData } from '../src/lib/legal/sc201';
import type { Sc204ModelData } from '../src/lib/legal/sc204';

const PREFIX = process.argv[2] || 'antes';
const DEST = process.argv[3] || '/home/z/my-project/download/evidencias_sc_header';
mkdirSync(DEST, { recursive: true });

// Logo real de la app (512×512) como dataURL — misma fuente que usa el navegador.
const logoBytes = readFileSync(resolve(process.cwd(), 'public/logo.png'));
const LOGO_DATAURL = `data:image/png;base64,${logoBytes.toString('base64')}`;

const RECEPCION = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  reference_doc: 'FC-2026-1188',
  supplier: 'Empresa de Materiales de la Construcción',
  reception_date: '2026-11-07T10:30:00Z',
  status: 'completed' as const,
  store_id: 'store-demo',
};

function lineas(n: number): Sc204ModelData['lineas'] {
  return Array.from({ length: n }, (_, i) => ({
    codigo: `MAT-${String(1000 + i)}`,
    descripcion: `Cemento P-350 saco 50 kg — lote ${i + 1} (material de construcción para obra civil)`,
    unidadMedida: 'saco',
    cantidad: String(10 + i),
    precioUnitario: `${(38.5 + i * 0.25).toFixed(2)} CUP`,
    importe: `${((10 + i) * (38.5 + i * 0.25)).toFixed(2)} CUP`,
    saldoExistencia: String(120 + i * 7),
  }));
}

const CASOS: Array<{ id: string; model: Sc204ModelData }> = [
  {
    id: 'corto',
    model: {
      logoUrl: LOGO_DATAURL,
      entidadNombre: 'Constructora del Este',
      entidadCodigo: '',
      almacenNombre: '',
      almacenCodigo: '',
      fechaEmision: '08/11/2026',
      proveedorNombre: RECEPCION.supplier,
      proveedorCodigo: '',
      documentoNombre: '',
      documentoNumero: RECEPCION.reference_doc,
      fechaRecepcion: '07/11/2026',
      transportadorNombre: '',
      transportadorCarne: '',
      transportadorChapa: '',
      transportadorCasilla: '',
      transportadorGuiaAerea: '',
      lineas: lineas(6),
      importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '3 012.75 CUP' }],
      numeroConsecutivo: '',
      identificadorRecepcion: 'a1b2c3d4',
    },
  },
  {
    id: 'nombre-largo',
    model: {
      logoUrl: LOGO_DATAURL,
      entidadNombre:
        'Empresa de Construcción e Instalación de Obras Civiles, Ingeniería y Arquitectura «Granma» del Este',
      entidadCodigo: '',
      almacenNombre: '',
      almacenCodigo: '',
      fechaEmision: '08/11/2026',
      proveedorNombre: RECEPCION.supplier,
      proveedorCodigo: '',
      documentoNombre: '',
      documentoNumero: RECEPCION.reference_doc,
      fechaRecepcion: '07/11/2026',
      transportadorNombre: '',
      transportadorCarne: '',
      transportadorChapa: '',
      transportadorCasilla: '',
      transportadorGuiaAerea: '',
      lineas: lineas(4),
      importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '1 886.40 CUP' }],
      numeroConsecutivo: '',
      identificadorRecepcion: 'a1b2c3d4',
    },
  },
  {
    id: 'sin-logo',
    model: {
      logoUrl: null,
      entidadNombre: 'Comercializadora Holguín',
      entidadCodigo: '',
      almacenNombre: '',
      almacenCodigo: '',
      fechaEmision: '08/11/2026',
      proveedorNombre: RECEPCION.supplier,
      proveedorCodigo: '',
      documentoNombre: '',
      documentoNumero: RECEPCION.reference_doc,
      fechaRecepcion: '07/11/2026',
      transportadorNombre: '',
      transportadorCarne: '',
      transportadorChapa: '',
      transportadorCasilla: '',
      transportadorGuiaAerea: '',
      lineas: lineas(4),
      importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '1 542.20 CUP' }],
      numeroConsecutivo: '',
      identificadorRecepcion: 'a1b2c3d4',
    },
  },
  {
    id: 'consecutivo',
    model: {
      logoUrl: LOGO_DATAURL,
      entidadNombre: 'Constructora del Este',
      entidadCodigo: '',
      almacenNombre: '',
      almacenCodigo: '',
      fechaEmision: '08/11/2026',
      proveedorNombre: RECEPCION.supplier,
      proveedorCodigo: '',
      documentoNombre: '',
      documentoNumero: RECEPCION.reference_doc,
      fechaRecepcion: '07/11/2026',
      transportadorNombre: '',
      transportadorCarne: '',
      transportadorChapa: '',
      transportadorCasilla: '',
      transportadorGuiaAerea: '',
      lineas: lineas(3),
      importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '998.10 CUP' }],
      numeroConsecutivo: '000148',
      identificadorRecepcion: 'a1b2c3d4',
    },
  },
  {
    id: 'multipagina',
    model: {
      logoUrl: LOGO_DATAURL,
      entidadNombre: 'Constructora del Este',
      entidadCodigo: '',
      almacenNombre: '',
      almacenCodigo: '',
      fechaEmision: '08/11/2026',
      proveedorNombre: RECEPCION.supplier,
      proveedorCodigo: '',
      documentoNombre: '',
      documentoNumero: RECEPCION.reference_doc,
      fechaRecepcion: '07/11/2026',
      transportadorNombre: '',
      transportadorCarne: '',
      transportadorChapa: '',
      transportadorCasilla: '',
      transportadorGuiaAerea: '',
      lineas: lineas(42),
      importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '41 233.60 CUP' }],
      numeroConsecutivo: '',
      identificadorRecepcion: 'a1b2c3d4',
    },
  },
];

// Caso hermano (coherencia de familia): SC-2-01 «SOLICITUD DE COMPRA».
const sc201 = buildSc201ModelData({
  order: {
    id: 's1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    supplier_name: 'Suministros Técnicos Industriales S.A.',
    status: 'completed',
    total_amount: 3137.5,
    notes: 'Materiales para la obra del policlínico (fase II).',
    expected_date: '2026-11-15',
    created_by: 'u-demo',
    created_at: '2026-11-08T09:00:00Z',
  },
  items: [
    { sku: 'MAT-1001', product_name: 'Cemento P-350 (saco 50 kg)', unit_of_measure: 'saco', quantity_ordered: 40, unit_cost: 38.5 },
    { sku: 'MAT-1002', product_name: 'Varilla de acero corrugada 12 mm', unit_of_measure: 'm', quantity_ordered: 120, unit_cost: 12.75 },
    { sku: 'MAT-1003', product_name: 'Arena de río', unit_of_measure: 'm³', quantity_ordered: 8, unit_cost: 45.0 },
  ],
  entidadNombre: 'Constructora del Este',
  creadorNombre: 'Usuario Demo',
  logoUrl: LOGO_DATAURL,
});

async function main() {
  for (const caso of CASOS) {
    const doc = await renderSc204Pdf(caso.model);
    const bytes = doc.output('arraybuffer') as ArrayBuffer;
    const file = join(DEST, `${PREFIX}_SC-2-04_${caso.id}.pdf`);
    writeFileSync(file, Buffer.from(bytes));
    console.log(`✓ ${file} (${Math.round(bytes.byteLength / 1024)} KB)`);
  }
  // SC-2-01 hermano (coherencia del encabezado institucional en la familia)
  try {
    const docHermano = await renderSc201Pdf(sc201 as never);
    const bytesH = docHermano.output('arraybuffer') as ArrayBuffer;
    const fileH = join(DEST, `${PREFIX}_SC-2-01_hermano.pdf`);
    writeFileSync(fileH, Buffer.from(bytesH));
    console.log(`✓ ${fileH} (${Math.round(bytesH.byteLength / 1024)} KB)`);
  } catch (e) {
    console.warn('SC-2-01 omitido (firma de build distinta):', (e as Error).message);
  }
  void sc204FileName; // exportado por sc204; el nombre oficial lo usa generateSc204Pdf
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
