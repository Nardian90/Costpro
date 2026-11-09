/**
 * CP-DOC-SC-HEADER-UX-005 — Encabezado institucional de la familia SC-2-xx
 * (Res. No. 11/2007 MFP): composición horizontal de tres áreas.
 * ========================================================================
 * Verificación del rediseño del encabezado a DOS niveles:
 *  · CONTENIDO: el logo/nombre/bloque documental provienen de los datos
 *    reales del documento (nada fijo); la denominación oficial «MODELO
 *    SC-2-04» y la referencia normativa se conservan íntegras.
 *  · RENDER (renderSc204Pdf + decodificación del stream PDF): las etiquetas
 *    del encabezado y del CUERPO conviven — el cuerpo (bloques A–F, tabla,
 *    totales, firmas) no cambia respecto a la misión anterior.
 *
 * Casos de la misión (§7): nombre corto, nombre extenso (ajuste automático
 * sin recortes), sin logo (composición no rota), consecutivo disponible y
 * ausente (comportamiento actual: valor o línea de cumplimentación manual),
 * documento multipágina.
 */

import { describe, it, expect } from 'vitest';
import { renderSc204Pdf, type Sc204ModelData } from '@/lib/legal/sc204';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { drawRes11Header } from '@/lib/legal/res11-shared';
import { resolveScLogoDataUrl } from '@/lib/legal/sc-logo';


/** Texto EFECTIVAMENTE dibujado: une los operandos de texto del stream
 * (un título que envuelve a dos líneas sigue siendo un único rótulo). */
function pdfDrawnText(bytes: ArrayBuffer): string {
  const raw = decodePdf(bytes);
  return (raw.match(/\(((?:\\.|[^\\()])*)\)\s*T[jJ]/g) ?? [])
    .map((m) => m.slice(1, m.lastIndexOf(')')))
    .join(' ');
}

function decodePdf(bytes: ArrayBuffer): string {
  return new TextDecoder('latin1').decode(bytes);
}

/**
 * Extrae el texto DIBUJADO del stream PDF (operadores «(…) Tj»), desescapa
 * los literales y colapsa espacios: permite comparar contenido independiente
 * del envoltorio de líneas (nombre largo en dos líneas) y del escapado de
 * paréntesis de jsPDF («\(CUP\)»).
 */
function extractPdfText(bytes: ArrayBuffer): string {
  const stream = decodePdf(bytes);
  const parts: string[] = [];
  const re = /\(((?:\\.|[^\\)])*)\) Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stream)) !== null) {
    parts.push(m[1].replace(/\\([()\\])/g, '$1'));
  }
  return parts.join(' ').replace(/\s+/g, ' ');
}

/** PNG 1×1 transparente como dataURL: logo PRESENTE sin depender de la red. */
const LOGO_DATAURL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function mkModel(overrides: Partial<Sc204ModelData> = {}): Sc204ModelData {
  return {
    logoUrl: LOGO_DATAURL,
    entidadNombre: 'Constructora del Este',
    entidadCodigo: '',
    almacenNombre: '',
    almacenCodigo: '',
    fechaEmision: '08/11/2026',
    proveedorNombre: 'Empresa de Materiales de la Construcción',
    proveedorCodigo: '',
    documentoNombre: '',
    documentoNumero: 'FC-2026-1188',
    fechaRecepcion: '07/11/2026',
    transportadorNombre: '',
    transportadorCarne: '',
    transportadorChapa: '',
    transportadorCasilla: '',
    transportadorGuiaAerea: '',
    lineas: [
      {
        codigo: 'MAT-1000',
        descripcion: 'Cemento P-350 saco 50 kg',
        unidadMedida: 'saco',
        cantidad: '10',
        precioUnitario: '38.50 CUP',
        importe: '385.00 CUP',
        saldoExistencia: '120',
      },
    ],
    importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '385.00 CUP' }],
    numeroConsecutivo: '',
    identificadorRecepcion: 'a1b2c3d4',
    ...overrides,
  };
}

describe('CP-DOC-SC-HEADER-UX-005 · Encabezado institucional de los modelos SC', () => {
  it('SC-2-04: las tres áreas conviven — denominación oficial, entidad y bloque documental', async () => {
    const doc = await renderSc204Pdf(mkModel());
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    // Área derecha: código del modelo con denominación oficial + título + referencia legal
    expect(text).toContain('MODELO SC-2-04');
    expect(text).toContain('INFORME DE RECEPCIÓN');
    expect(text).toContain('Uso obligatorio — Res. No. 11/2007 MFP');
    // Área central: nombre institucional REAL de la entidad del documento
    expect(text).toContain('Constructora del Este');
    // Datos administrativos compactos
    expect(text).toContain('No. Consecutivo: ______________');
    expect(text).toContain('Fecha de emisión: 08/11/2026');
  });

  it('nombre extenso: se representa COMPLETO (ajuste automático, sin recortes ni inventos)', async () => {
    const largo = 'Empresa de Construcción e Instalación de Obras Civiles, Ingeniería y Arquitectura «Granma» del Este';
    const doc = await renderSc204Pdf(mkModel({ entidadNombre: largo }));
    // El nombre puede envolver a varias líneas: se compara el texto dibujado
    // reconstruido (líneas contiguas unidas) con el nombre íntegro.
    const dibujado = extractPdfText(doc.output('arraybuffer') as ArrayBuffer);
    expect(dibujado).toContain(largo);
  });

  it('sin logo: el documento se genera igual y la composición no se rompe', async () => {
    const doc = await renderSc204Pdf(mkModel({ logoUrl: null }));
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    expect(text).toContain('Constructora del Este');
    expect(text).toContain('MODELO SC-2-04');
  });

  it('consecutivo: valor cuando existe; línea de cumplimentación cuando no (comportamiento actual)', async () => {
    const conValor = decodePdf(
      ((await renderSc204Pdf(mkModel({ numeroConsecutivo: '000148' }))).output('arraybuffer')) as ArrayBuffer,
    );
    expect(conValor).toContain('No. Consecutivo: 000148');
    const sinValor = decodePdf(
      ((await renderSc204Pdf(mkModel({ numeroConsecutivo: '' }))).output('arraybuffer')) as ArrayBuffer,
    );
    expect(sinValor).toContain('No. Consecutivo: ______________');
  });

  it('multipágina: el cuerpo continúa paginado sin perder la tabla ni los totales', async () => {
    const lineas = Array.from({ length: 42 }, (_, i) => ({
      codigo: `MAT-${1000 + i}`,
      descripcion: `Material de construcción ${i + 1}`,
      unidadMedida: 'saco',
      cantidad: String(10 + i),
      precioUnitario: '38.50 CUP',
      importe: `${(10 + i) * 38.5} CUP`,
      saldoExistencia: '120',
    }));
    const doc = await renderSc204Pdf(mkModel({ lineas }));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    // La celda del encabezado de tabla envuelve a dos líneas en el stream.
    expect(text).toContain('Saldo en existencia');
    expect(text).toContain('según almacén');
    expect(text).toContain('IMPORTE TOTAL DEL MODELO');
  });

  it('el CUERPO del documento conserva su estructura (bloques A–E, tabla, cuadrícula de firmas)', async () => {
    const doc = await renderSc204Pdf(mkModel());
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    // Bloques de datos A–E (CP-DOC-PDF-UX-004). El bloque F «DATOS DEL
    // TRANSPORTADOR» ya no existe: sus datos acompañan a la firma (misión
    // CP-DOC-SC-DATA-MAPPING-006 §6) — «Carné de identidad:» sigue presente.
    for (const etiqueta of [
      'Nombre de la entidad:',
      'Nombre del almacén:',
      'Nombre o razón social:',
      'Número del documento:',
      'Fecha de la recepción:',
      'Fecha de emisión del modelo:',
      'Carné de identidad:',
    ]) {
      expect(text).toContain(etiqueta);
    }
    expect(text).not.toContain('DATOS DEL TRANSPORTADOR');
    // Tabla del dato 7 + dato 8 + el PIE DE FIRMA UNIFICADO (referencia de
    // diseño 2026-11-09): fila de tres firmas de empleados + sección
    // «TRANSPORTADOR:» con su cuadrícula de identificación.
    expect(text).toContain('Saldo en existencia');
    expect(text).toContain('según almacén');
    expect(text).toContain('IMPORTE TOTAL DEL MODELO');
    expect(text).toContain('385.00 CUP');
    expect(text).toContain('TRANSPORTADOR:');
    expect(text).toContain('FIRMA DEL EMPLEADO QUE RECEPCIONA');
    expect(text).toContain('FIRMA DEL EMPLEADO QUE CONTABILIZA');
    expect(pdfDrawnText(doc.output('arraybuffer') as ArrayBuffer)).toContain('FIRMA DEL EMPLEADO QUE ANOTA EN EL CONTROL DE INVENTARIO');
  });

  it('plantilla reutilizable: drawRes11Header adapta el ancho a la orientación (apaisado)', async () => {
    const docP = await createPDFDocument('p', 'mm', 'letter');
    const docL = await createPDFDocument('l', 'mm', 'letter');
    // Sin excepción en ninguna orientación; el área central usa el ancho disponible
    const yP = drawRes11Header(docP, { modelo: 'SC-2-13', titulo: 'SUBMAYOR DE INVENTARIO' });
    const yL = drawRes11Header(docL, { modelo: 'SC-2-13', titulo: 'SUBMAYOR DE INVENTARIO' });
    expect(yP).toBeGreaterThan(10);
    expect(yL).toBeGreaterThan(10);
    const textL = decodePdf(docL.output('arraybuffer') as ArrayBuffer);
    expect(textL).toContain('MODELO SC-2-13');
    expect(textL).toContain('SUBMAYOR DE INVENTARIO');
  });

  it('la marca se resuelve de la TIENDA del documento; sin logo propio → identificador CP', async () => {
    // resolveScLogoDataUrl: 1º logo de la tienda; 2º identificador CP
    // monocromático (source='cp') — NUNCA el logo general de la aplicación
    // (CP-DOC-SC-DATA-MAPPING-006 §9).
    const resuelto = await resolveScLogoDataUrl(LOGO_DATAURL, '');
    expect(resuelto.source).toBe('store');
    expect(resuelto.dataUrl).toBe(LOGO_DATAURL);
    // Tienda sin logo → el identificador CP (dibujado vectorialmente en el
    // render; la resolución solo indica la fuente).
    const cp = await resolveScLogoDataUrl(null, '');
    expect(cp.source).toBe('cp');
    expect(cp.dataUrl).toBeNull();
    // Logo de la tienda NO disponible (fetch roto) → también identificador CP.
    const roto = await resolveScLogoDataUrl('http://localhost:1/no-existe.png', '');
    expect(roto.source).toBe('cp');
    expect(roto.dataUrl).toBeNull();
  });

  it('sin logo: el identificador CP se dibuja (monograma vectorial en el stream)', async () => {
    const doc = await renderSc204Pdf(mkModel({ logoUrl: null }));
    const text = decodePdf(doc.output('arraybuffer') as ArrayBuffer);
    // El monograma CP es composición tipográfica vectorial (negrita helvetica)
    expect(text).toContain('(CP)');
    // y el documento sigue completo.
    expect(text).toContain('MODELO SC-2-04');
  });
});
