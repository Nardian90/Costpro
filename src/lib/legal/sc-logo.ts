import type { jsPDF } from 'jspdf';

/**
 * Logo de tienda para los comprobantes oficiales de la familia SC-2-xx
 * (Resolución No. 11/2007, MFP — Anexo Único).
 *
 * Prioridad (modo multitienda): logo_url de la TIENDA del documento → logo
 * por defecto de la aplicación (/logo.png, rasterizado de public/logo.svg)
 * → nada (el comprobante se genera igual, sin logo). Una descarga fallida
 * nunca bloquea la emisión del modelo.
 */
export interface ScLogoResolution {
  dataUrl: string | null;
  source: 'store' | 'default' | 'none';
}

const DEFAULT_LOGO_PATH = '/logo.png';
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
 * Resuelve el dataURL del logo: primero el de la tienda emisora del
 * documento (storeLogoUrl), si no el default de la app bajo `appOrigin`
 * (por defecto window.location.origin en el cliente). Devuelve 'none' si
 * ninguna fuente está disponible — el comprobante sale sin logo.
 */
export async function resolveScLogoDataUrl(
  storeLogoUrl?: string | null,
  appOrigin?: string,
): Promise<ScLogoResolution> {
  const origin = appOrigin ?? injectedAppOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const candidates: Array<{ url: string; source: 'store' | 'default' }> = [];
  if (storeLogoUrl) candidates.push({ url: storeLogoUrl, source: 'store' });
  if (origin) candidates.push({ url: `${origin}${DEFAULT_LOGO_PATH}`, source: 'default' });
  for (const candidate of candidates) {
    try {
      return { dataUrl: await toDataUrl(candidate.url), source: candidate.source };
    } catch {
      // siguiente fuente
    }
  }
  return { dataUrl: null, source: 'none' };
}

export interface ScLogoBox {
  /** Recuadro disponible en mm; el logo se ajusta preservando el aspecto. */
  x: number;
  y: number;
  maxW: number;
  maxH: number;
}

/**
 * Dibuja el logo alineado a la izquierda del recuadro y centrado
 * verticalmente. Silencioso por diseño: un logo roto no impide el comprobante.
 */
export function drawScLogo(doc: jsPDF, logo: ScLogoResolution, box: ScLogoBox): void {
  if (!logo.dataUrl) return;
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
    // sin logo
  }
}
