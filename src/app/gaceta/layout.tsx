import { headers } from 'next/headers';
import { Source_Serif_4 } from 'next/font/google';
import type { ReactNode } from 'react';

/**
 * ADNEGOCIO-GACETA-EDITORIAL-UX-001 — layout de la gaceta pública.
 *
 * Monta el contenedor raíz #gaceta-root con sistema de tema PROPIO,
 * independiente del tema global de la app (next-themes, default dark):
 *   · Default de primera visita = CLARO (papel marfil), exigido por la
 *     misión; jamás se adopta el tema del sistema operativo sin elección
 *     explícita del usuario.
 *   · El tema elegido (Claro / Oscuro / Sistema) se persiste en
 *     localStorage['gaceta-theme'] sin exigir sesión.
 *   · El script inline anti-flash aplica `data-theme="dark"` ANTES del
 *     primer paint cuando corresponde (misma técnica que next-themes:
 *     ejecuta durante el parseo, sin esperar la hidratación).
 *   · Los tokens de color están escopados en src/styles/gaceta.css; el
 *     resto de la aplicación nunca monta #gaceta-root (patrón #landing-root).
 *
 * La voz tipográfica serif (Source Serif 4, pesos reales 400–900) se carga
 * aquí: es exclusiva de la publicación y no altera la tipografía de la app.
 */

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  style: ['normal', 'italic'],
  variable: '--font-gaceta-serif',
  display: 'swap',
});

/** Aplica el tema oscuro antes del primer paint si hay preferencia guardada. */
const NO_FLASH_THEME_SCRIPT = `(function(){try{
var t=localStorage.getItem('gaceta-theme');
var oscuro=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
if(oscuro&&document.currentScript&&document.currentScript.parentElement){
document.currentScript.parentElement.setAttribute('data-theme','dark');
}
}catch(e){}})();`;

export default async function GacetaLayout({ children }: { children: ReactNode }) {
  // FIX-CSP: nonce inyectado por proxy.ts; con 'strict-dynamic' el CSP de
  // producción ignora 'unsafe-inline', así que el script DEBE llevar nonce
  // (mismo patrón que el root layout).
  const nonce = (await headers()).get('x-csp-nonce') || '';

  return (
    <div id="gaceta-root" className={sourceSerif.variable} suppressHydrationWarning>
      <script
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }}
      />
      {children}
    </div>
  );
}
