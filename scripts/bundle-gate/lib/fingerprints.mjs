/**
 * Bundle Gate — fingerprint registry for watched heavy libraries.
 *
 * Cada librería vigilada se identifica en los chunks compilados mediante
 * múltiples señales (nunca una sola coincidencia de texto):
 *   - `primary`: literales altamente específicos del código de la librería.
 *   - `secondary`: literales confirmatorios (nombres de API/propiedades que
 *     sobreviven a la minificación).
 * Regla de matching: al menos UN marcador primary Y (`minTotal` señales en
 * total). Esto evita falsos positivos por menciones textuales (p. ej. un
 * mensaje de error de la app que dice "html2canvas") y reduce falsos
 * negativos si Turbopack divide el paquete entre varios chunks.
 *
 * Nota sobre @e965/xlsx: es un fork con scope de SheetJS CE. Los marcadores
 * (book_append_sheet/sheet_add_aoa/cptable) son del núcleo SheetJS y podrían
 * coincidir con otro fork de la misma familia; para el propósito del gate
 * (impedir que un núcleo xlsx entre en la carga inicial) eso es correcto y
 * se documenta en el README.
 */

/** @typedef {{name: string, primary: string[], secondary: string[], minTotal: number}} LibSignature */

/** @type {LibSignature[]} */
export const LIB_SIGNATURES = [
  {
    name: 'jspdf',
    // WinAnsiEncoding: tabla de codificación de fuentes estándar PDF —
    // exclusiva del generador de PDF; no aparece como texto de app.
    primary: ['WinAnsiEncoding'],
    secondary: ['getCharWidthsArray', 'AcroForm', 'StandardFonts'],
    minTotal: 2,
  },
  {
    name: 'html2canvas',
    // data-html2canvas-ignore: atributo DOM que la librería busca al clonar.
    primary: ['data-html2canvas-ignore'],
    secondary: ['createElementClone', 'html2canvas'],
    minTotal: 2,
  },
  {
    name: 'jspdf-autotable',
    // applyPlugin: función que registra autoTable en el prototype de jsPDF.
    primary: ['applyPlugin'],
    secondary: ['drawTable', 'cellPadding', 'autoTable'],
    minTotal: 2,
  },
  {
    name: '@e965/xlsx',
    // book_append_sheet + sheet_add_aoa: nombres de API de SheetJS que
    // sobreviven como propiedades de objeto.
    primary: ['book_append_sheet'],
    secondary: ['sheet_add_aoa', 'cptable', 'SheetJS'],
    minTotal: 2,
  },
];

/**
 * Detecta qué librerías vigiladas tienen código ejecutable dentro de `code`.
 * @param {string} code
 * @returns {string[]} nombres de librerías detectadas
 */
export function detectLibs(code) {
  const hits = [];
  for (const lib of LIB_SIGNATURES) {
    let total = 0;
    let primaryHit = false;
    for (const s of lib.primary) {
      if (code.includes(s)) { primaryHit = true; total++; }
    }
    if (!primaryHit) continue; // sin señal primaria no hay match
    for (const s of lib.secondary) if (code.includes(s)) total++;
    if (total >= lib.minTotal) hits.push(lib.name);
  }
  return hits;
}

/**
 * Filtra el registro de firmas a las librerías vigiladas por configuración.
 * @param {string[]} watchedNames
 * @returns {LibSignature[]}
 */
export function signaturesFor(watchedNames) {
  const known = new Map(LIB_SIGNATURES.map(l => [l.name, l]));
  const out = [];
  for (const name of watchedNames) {
    const sig = known.get(name);
    if (!sig) throw new Error(`Librería vigilada desconocida: "${name}". Firmas disponibles: ${[...known.keys()].join(', ')}`);
    out.push(sig);
  }
  return out;
}
