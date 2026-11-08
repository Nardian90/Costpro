import type { jsPDF } from 'jspdf';

/**
 * Logo de tienda para los comprobantes oficiales de la familia SC-2-xx
 * (Resolución No. 11/2007, MFP — Anexo Único).
 *
 * Prioridad (CP-DOC-SC-DATA-MAPPING-006 §9):
 *   1. logo_url de la TIENDA del documento (cuando existe y es rasterizable).
 *   2. Identificador tipográfico monocromático «CP» (vectorial, blanco y
 *      negro) cuando la tienda NO tiene logo propio.
 *
 * CAMBIO DE REGLA: el logo general de la aplicación (/logo.png) ya NO se usa
 * como sustituto — rompía la identidad visual del documento de la tienda.
 * Una descarga fallida nunca bloquea la emisión del modelo.
 */
export interface ScLogoResolution {
  dataUrl: string | null;
  /**
   * 'store' = logo propio de la tienda; 'cp' = identificador monocromático
   * CP (recurso alternativo cuando la tienda carece de imagen — NO es un
   * logo real de la tienda); 'none' = nada (comprobante sin marca).
   */
  source: 'store' | 'cp' | 'none';
}

const LOGO_TIMEOUT_MS = 8000;

/**
 * Origen de la app inyectable (SSR/pruebas): evita depender de window en
 * entornos donde no existe o su presencia confunde la detección de entorno
 * de jsPDF. En el navegador se usa window.location.origin.
 */
let injectedAppOrigin: string | null = null;
export function setScLogoAppOrigin(origin: string | null): void {
  injectedAppOrigin = origin;
}

async function toDataUrl(url: string): Promise<string> {
  // dataURL explícito (evidencias/pruebas): sin red.
  if (url.startsWith('data:')) return url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGO_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
    if (!res.ok) throw new Error(`logo HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || 'image/png').split(';')[0];
    // jsPDF no rasteriza SVG: se trata como fuente sin logo usable.
    if (/svg/i.test(type)) throw new Error('logo SVG no rasterizable en jsPDF');
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:${type};base64,${btoa(binary)}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resuelve la marca del documento: primero el logo de la tienda emisora
 * (storeLogoUrl); si la tienda NO tiene logo (o la imagen no está
 * disponible) el resultado indica el identificador monocromático CP
 * (source='cp'), que drawScLogo dibuja como composición vectorial. Nunca
 * usa el logo general de la aplicación como sustituto.
 */
export async function resolveScLogoDataUrl(
  storeLogoUrl?: string | null,
  _appOrigin?: string,
): Promise<ScLogoResolution> {
  if (storeLogoUrl) {
    try {
      return { dataUrl: await toDataUrl(storeLogoUrl), source: 'store' };
    } catch {
      // Imagen no disponible → identificador CP (nunca el logo de la app).
    }
  }
  return { dataUrl: null, source: 'cp' };
}

export interface ScLogoBox {
  /** Recuadro disponible en mm; el logo se ajusta preservando el aspecto. */
  x: number;
  y: number;
  maxW: number;
  maxH: number;
}

/**
 * Identificador monocromático «CP» (recurso alternativo cuando la tienda
 * carece de logo propio): composición VECTORIAL — marco fino negro y
 * monograma en negrita, blanco y negro puro, sin gradientes, efectos ni
 * color corporativo. Imprime con nitidez a cualquier resolución y ocupa un
 * tamaño compacto proporcionado al espacio del logo real. No es un logo de
 * la tienda: es la marca neutral de la familia documental SC.
 */
export function drawScMonogram(doc: jsPDF, box: ScLogoBox): void {
  const frameW = Math.min(box.maxW, 16);
  const frameH = Math.min(box.maxH, frameW * 0.72);
  const x = box.x;
  const y = box.y + (box.maxH - frameH) / 2;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, frameW, frameH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text('CP', x + frameW / 2, y + frameH / 2 + 1.6, { align: 'center' });
}

/**
 * Dibuja la marca del documento: el logo de la tienda (alineado a la
 * izquierda del recuadro y centrado verticalmente, preservando el aspecto)
 * o, en su defecto, el identificador CP. Silencioso por diseño: una marca
 * rota no impide el comprobante.
 */
export function drawScLogo(doc: jsPDF, logo: ScLogoResolution, box: ScLogoBox): void {
  if (!logo.dataUrl) {
    if (logo.source === 'cp') drawScMonogram(doc, box);
    return;
  }
  try {
    const props = doc.getImageProperties(logo.dataUrl);
    const ratio = props.width / props.height || 1;
    let w = box.maxW;
    let h = w / ratio;
    if (h > box.maxH) {
      h = box.maxH;
      w = h * ratio;
    }
    const y = box.y + (box.maxH - h) / 2;
    doc.addImage(logo.dataUrl, props.fileType, box.x, y, w, h);
  } catch {
    drawScMonogram(doc, box);
  }
}
