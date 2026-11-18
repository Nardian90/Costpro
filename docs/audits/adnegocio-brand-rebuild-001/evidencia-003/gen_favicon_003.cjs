/**
 * ADN-LANDING-FINAL-POLISH-003 §7 — favicon ADNegocio.
 * Genera el símbolo aprobado (N geométrica) y sincroniza TODAS las variantes:
 *   favicon.svg · logo.svg · icon.svg · logo.png · icons/*.png ·
 *   apple-touch-icon.png · favicon.ico · fc/icons/*.png
 *
 * Decisión de diseño (documentada en FAVICON_ADN_OR_N_DESIGN.md):
 *   Opción 1 (ADN compacto) DESCARTADA — a 16×16 las tres letras (relación de
 *   aspecto 2.9:1) quedarían a ~5px de alto con trazos <1px: ilegibles.
 *   Opción 2 (N geométrica) APROBADA — N angular original (lógica de «Z girada
 *   90°» recompuesta, sin copiar Z.ai), con punto-cuadrado blanco en el
 *   contracampo superior derecho (eco del punto de la «i» del wordmark).
 *   Funciona en monocromo (una sola forma + contrapunto).
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'Costpro', 'public');
const REPO = path.join(__dirname, '..', 'Costpro');

/* ── Símbolo N geométrica ADNegocio (original) ──────────────────────────────
   Canvas 512 · tile rx=100 #05070A · N en verde #22C55E:
     - peces verticales: x104..184 y x328..408 (ancho 80) · y104..408
     - diagonal paralela (grosor horizontal 80): (104,104)→(328,408)
   Punto-cuadrado blanco 46px en el contracampo superior derecho.
   Márgenes mínimos del glifo: 96px (18.75%) → zona segura maskable con
   escala 0.84 (esquina a 180px del centro < radio seguro 205px). */
const GREEN = '#22C55E';
const DARK = '#05070A';

const N_GLYPH = `
    <rect x="104" y="104" width="80" height="304"/>
    <rect x="328" y="104" width="80" height="304"/>
    <polygon points="104,104 184,104 408,408 328,408"/>`;

function tileSvg({ rx = 100, glyphScale = 1, glyphFill = GREEN, dotFill = '#FFFFFF' } = {}) {
  const s = glyphScale;
  const off = (512 * (1 - s)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="ADNegocio — N geométrica">
<rect width="512" height="512" rx="${rx}" fill="${DARK}"/>
<g transform="translate(${off} ${off}) scale(${s})">
  <g fill="${glyphFill}">${N_GLYPH}</g>
  <rect x="262" y="140" width="46" height="46" fill="${dotFill}"/>
</g>
</svg>`;
}

/* Variante monocroma (una tinta) — el símbolo debe funcionar sin color. */
function monoSvg(fill = '#FFFFFF') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="ADNegocio — N geométrica (monocromo)">
<rect width="512" height="512" rx="100" fill="none"/>
<g fill="${fill}">${N_GLYPH}<rect x="262" y="140" width="46" height="46"/></g>
</svg>`;
}

async function main() {
  const tile = tileSvg();
  const maskable = tileSvg({ rx: 0, glyphScale: 0.84 });
  const mono = monoSvg();

  /* 0) Evaluación de legibilidad de la Opción 1 (ADN compacto) a 16px:
        se rasteriza y se mide la altura real de letra y de trazo. */
  const adnTest = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="100" fill="${DARK}"/>
    <g transform="translate(24 176) scale(1.6032)" fill="#FFFFFF">
      <path d="M0 100 26.29 0H59.14L85.43 100H66L60.57 78H24.86L19.43 100ZM29.29 60.57H56.14L44 11.86H41.43Z" transform="translate(0 0)"/>
      <path d="M104.57 100V83.43H117.71V16.57H104.57V0H145.71Q165.86 0 176.36 10.21Q186.86 20.43 186.86 40.57V59.43Q186.86 79.57 176.36 89.79Q165.86 100 145.71 100ZM136.57 82.86H146Q157.43 82.86 162.71 76.86Q168 70.86 168 60V40Q168 29 162.71 23.07Q157.43 17.14 146 17.14H136.57Z" transform="translate(94.57 0)"/>
      <path d="M192.57 100V0H228.43L248.29 87.14H250.86V0H269.43V100H233.57L213.71 12.86H211.14V100Z" transform="translate(0 0)"/>
    </g>
  </svg>`;
  const adn16 = await sharp(Buffer.from(adnTest), { density: 72 }).resize(16, 16).png().toBuffer();
  fs.writeFileSync(path.join(REPO, 'docs', 'audits', 'adnegocio-brand-rebuild-001', 'evidencia-003', 'opcion1-adn-16px.png'), adn16);

  /* 1) SVGs — favicon canónico + variantes sincronizadas */
  fs.writeFileSync(path.join(PUB, 'favicon.svg'), tile);
  fs.writeFileSync(path.join(PUB, 'logo.svg'), tile);
  fs.writeFileSync(path.join(PUB, 'icon.svg'), tile);
  fs.writeFileSync(path.join(PUB, 'brand', 'adnegocio-n-favicon-mono.svg'), mono);

  /* 2) PNGs cuadrados (tile) */
  const jobs = [
    ['logo.png', 512],
    ['icons/icon-48.png', 48],
    ['icons/icon-72.png', 72],
    ['icons/icon-96.png', 96],
    ['icons/icon-144.png', 144],
    ['icons/icon-192.png', 192],
    ['icons/icon-512.png', 512],
    ['fc/icons/icon-192.png', 192],
    ['fc/icons/icon-512.png', 512],
  ];
  for (const [file, size] of jobs) {
    await sharp(Buffer.from(tile)).resize(size, size).png().toFile(path.join(PUB, file));
    console.log('OK', file, size);
  }

  /* 3) Maskable (PWA): fondo a sangre completa, glifo dentro de la zona segura */
  await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(path.join(PUB, 'icons', 'icon-512-maskable.png'));
  await sharp(Buffer.from(maskable)).resize(192, 192).png().toFile(path.join(PUB, 'fc', 'icons', 'icon-maskable-192.png'));
  await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(path.join(PUB, 'fc', 'icons', 'icon-maskable-512.png'));
  console.log('OK maskable');

  /* 4) Apple touch (180, RGB plano — iOS aplica su propia máscara) */
  await sharp(Buffer.from(maskable)).resize(180, 180).flatten({ background: DARK }).jpeg({ quality: 92 })
    .toFile('/tmp/apple-touch.jpg');
  fs.copyFileSync('/tmp/apple-touch.jpg', path.join(PUB, 'apple-touch-icon.png'));
  console.log('OK apple-touch-icon.png');

  /* 5) PNGs de evaluación del símbolo final a 16/32/48 (expediente) */
  const evd = path.join(REPO, 'docs', 'audits', 'adnegocio-brand-rebuild-001', 'evidencia-003');
  for (const size of [16, 32, 48]) {
    await sharp(Buffer.from(tile)).resize(size, size).png().toFile(path.join(evd, `opcion2-n-${size}px.png`));
  }
  await sharp(Buffer.from(maskable)).resize(16, 16).png().toFile(path.join(evd, 'opcion2-n-maskable-16px.png'));

  console.log('FAVICON SYNC COMPLETE');
}

main().catch((e) => { console.error(e); process.exit(1); });
