# LANDING REDESIGN REPORT — ADNegocio

**ADN-BRAND-REBUILD-001 · 2026-11-18**

## 1. Alcance

Rediseño desde la estructura (no recolor) del landing público `/`:
`src/app/LandingPage.tsx` + `src/components/landing/*` + SSR SEO
(`src/app/page.tsx`, `layout.tsx`). Verificado en navegador (Chromium real).

## 2. Composición final

| Bloque | Contenido |
|---|---|
| Header (fixed) | Marca compacta (isotipo → wordmark al scroll) · Funcionalidades · Plataforma · Ayuda · **Acceder** (único CTA del header) · menú móvil (drawer) |
| Hero | Lockup ADN/NEGOCIO + **«Todo tu negocio. En un solo lugar.»** + subtítulo de la misión + accesos principal («Acceder a la plataforma») y secundario («Conocer las funcionalidades») + selector de tres caminos (Ficha de Costo gratis · Entrar a ADNegocio · Ver demostración) |
| Plataforma (`#como-funciona`) | Historias editoriales con capturas reales (multitienda, vitrina, inventario, POS, fichas de costo, reportes, seguridad) |
| Funcionalidades (`#features`) | Índice editorial de las **9 áreas funcionales reales** (numeración grande, tipografía protagonista): Finanzas y EEFF · Ventas · Inventario y almacén · Compras y recepciones · Proveedores y clientes · Fichas de costo Res.148/2023 · Multitienda · Reportes y análisis · Auditoría y control documental — confirmadas contra `navigation-definition.ts` |
| Pricing | Planes existentes (honestos, sin inventar datos) |
| Ayuda (`#faq`) | FAQ rebrandeada |
| Cierre | **«Tu negocio merece una visión completa.»** + ADNegocio + Acceso a la plataforma (+ WhatsApp) |
| Footer | Marca, enlaces legales, © 2024–2026 ADNegocio |

## 3. Decisiones clave

1. **Sin estadísticas/clientes/premios inventados**: eliminados del render los
   `statsData`/`testimonials`/`differentiators` (marcados DEPRECATED hace meses;
   sus componentes consumidores no forman parte de la composición).
2. **Header fixed** (no sticky): `html/body` llevan `overflow-x:hidden` (anti
   scroll-horizontal) que rompe `position:sticky` en Chromium — diagnosticado con
   navegador real y resuelto con fixed + espaciador de flujo. Transformación al
   scroll: fondo profundo + blur + borde; marca compacta solo cuando la marca del
   hero no está visible (sin duplicación de logotipo).
3. **Contratos preservados**: `entrarACostpro()` y su test de fuente; testids
   `path-ficha-costo` / `path-costpro` (técnico) / `path-demo`; ids de sección;
   `open-login` puente; LoginModal único; deep link `/?login=1&returnTo=`;
   `#landing-root` + landing-shield (aislamiento de temas) intactos.
4. **Área financiera anunciada con evidencia**: «Estados financieros con partida
   doble» es real (módulo fin en producción) — no se promociona nada incompleto.
5. Capturas: las 15 `.webp` existentes son capturas reales anonimizadas (datos de
   demostración); los `frameLabel` mock pasaron de `costpro.app` a `adnegocio.app`.

## 4. Resultado responsive (misión §12)

Sin scroll horizontal en 360/390/768/1024/1440/1920 (medido:
`scrollWidth−clientWidth = 0px` en las seis tallas). Detalles en
`RESPONSIVE_VALIDATION.md`.

## 5. Accesibilidad y rendimiento

- Navegación por teclado intacta (1–5 secciones, Ctrl+K paleta, ?, Esc).
- `prefers-reduced-motion` respetado (partículas off, transiciones cortas).
- aria-labels actualizados a ADNegocio; jerarquía h1 (titular editorial) → h2/h3.
- `landing-page.spec` actualizado: espera el titular editorial del hero.

## 6. Verificación visual

Capturas Chromium revisadas: 1440 top/features/cierre, 1920, 390, 360,
header-scrolled. Consola limpia tras corregir keys React duplicadas en el
wordmark («ADNegocio» tiene dos «o»).
