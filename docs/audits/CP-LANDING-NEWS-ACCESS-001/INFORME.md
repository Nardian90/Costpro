# CP-LANDING-NEWS-ACCESS-001 — Informe final

**Misión:** hacer visible el acceso a Novedades (Gaceta Oficial de Cuba + Actualizaciones de ADNegocio) desde el Landing Page.
**Repo:** Nardian90/Costpro · **Rama:** `feat/novedades-landing-20261125` · **Fecha:** 2026-11-25
**REGLA FUNDAMENTAL cumplida:** la vista ya existía — se localizó, recuperó y conectó. No se reconstruyó ni duplicó nada (cero cambios en vista, BD, APIs o permisos).

---

## 1. Dónde estaba implementada originalmente la vista

| Pieza | Ubicación | Origen |
|---|---|---|
| Portada pública | `src/app/gaceta/page.tsx` | PR #1699 · `feat/gaceta-diario-20261124` (24/11) |
| Artículo individual | `src/app/gaceta/[slug]/page.tsx` + `ShareButton.tsx` | PR #1699 |
| Tabla base | `gaceta_posts` (RLS, cero policies; escritura solo service_role) | Migración ADN-011 `20261124120000` |
| Superficie pública | vista `public_gaceta_v` (`security_barrier`, WHERE `estado='publicada'`, GRANT SELECT a anon/authenticated, REVOKE escrituras — patrón CP-SEC-027) | Migración ADN-011 |
| Categorías | `tipo='gaceta'` (Gaceta Oficial de Cuba) y `tipo='costpro'` (Actualizaciones de ADNegocio) | Migración ADN-011 |
| SEO | `generateMetadata` + OpenGraph + JSON-LD (CollectionPage/NewsArticle) + canonical + sitemap `/gaceta` (daily 0.9) + ShareButton (Web Share API con fallback de copia) | PR #1699 |

## 2. Por qué no era visible desde el Landing Page

**Causa raíz: la vista quedó aislada — ningún punto de entrada.**
- `LandingHeader.tsx` (`navLinks`): solo 3 anclas internas (`#features`, `#como-funciona`, `#faq`) — cero rutas reales.
- Drawer móvil (`LandingPage.tsx`): solo `sectionLabels` (Inicio/Plataforma/Funcionalidades/Precios/Ayuda).
- `FooterSection.tsx`: ninguna referencia a `/gaceta`.
- El único descubrimiento posible era conociendo la URL. Además, el landing renderiza client-side (`HomePageClient.tsx` → `dynamic(..., { ssr: false })`), así que tampoco había enlace en el HTML SSR para crawlers.

No fue eliminado ni oculto: **nunca se incorporó** el acceso al fusionarse el PR #1699.

## 3. Ruta pública definitiva

- Portada: **`/gaceta`** — «El Diario Contable» (pública, sin autenticación).
- Artículos: **`/gaceta/[slug]`** — enlaces directos y permanentes (ej. `/gaceta/gaceta-2026-11-24-pensiones-cotizaciones-cambian`).

## 4. Componentes y archivos modificados (solo conexión del acceso)

| Archivo | Cambio |
|---|---|
| `src/components/landing/NovedadesCard.tsx` (**nuevo**) | Tarjeta destacada del capítulo 5 (modo flujo): nombre «Novedades», descripción exacta de la misión, CTA «Ver las novedades», categorías diferenciadas. |
| `src/components/landing/LandingHeader.tsx` | «Novedades» primera entrada de la nav de escritorio — ruta real `/gaceta` (`next/link`) con punto vivo verde. |
| `src/app/LandingPage.tsx` | «Novedades» primera entrada del drawer móvil (icono Newspaper, acento verde) + tarjeta en el capítulo 5 del modo flujo. |
| `src/components/landing/cinema/SceneContent.tsx` | Tira compacta «Novedades — Gaceta Oficial de Cuba y actualizaciones de ADNegocio» en la escena de cierre del modo cine. |

Tres accesos complementarios y no redundantes: **nav** (siempre visible en escritorio), **drawer** (menú móvil, sin desplazamientos) y **tarjeta/tira** (dentro del contenido). Nada escondido exclusivamente en el footer; cero cambios en `/gaceta`, base de datos, APIs, permisos o temas internos.

## 5. Evidencia visual (escritorio y móvil)

Capturas en `docs/audits/CP-LANDING-NEWS-ACCESS-001/evidencia/` (9):
1. `01-desktop-header-nav.png` — nav de escritorio con «Novedades» y punto verde.
2. `02-desktop-cine-cierre.png` — escena de cierre (modo cine) con la tira Novedades visible.
3. `03-gaceta-portada-desktop.png` / `03b-full` — portada con ambas categorías y artículos reales.
4. `04-gaceta-articulo-desktop.png` — artículo individual con cuerpo y compartir.
5. `05-movil-drawer-novedades.png` — drawer 390px con «Novedades» primera entrada.
6. `06-movil-gaceta-portada.png` — portada en móvil.
7. `07-movil-tarjeta-novedades.png` — tarjeta del capítulo 5 en móvil.
8. `08-desktop-tarjeta-novedades.png` — tarjeta destacada en escritorio.

## 6. Comprobación de permisos públicos y privados

| Comprobación | Resultado |
|---|---|
| Tabla `gaceta_posts` con anon | **HTTP 401** (denegada — RLS sin policies) |
| Vista `public_gaceta_v` con anon | **200, 2 filas** (solo `estado='publicada'`; tipos `gaceta` + `costpro`) |
| INSERT/UPDATE/DELETE sobre la vista con anon | **HTTP 401** (read-only garantizado) |
| Borradores | No existen en la vista pública (filtro del WHERE); la tabla solo es accesible a service_role |
| Administración/edición | Intacta: escritura solo service_role (editor automático); cero cambios |
| Público por defecto | NO se hizo pública ninguna publicación adicional (no se tocaron datos) |

## 7. Pruebas realizadas y resultados

**Playwright 20/20 PASS** (`scripts/landing-novedades-verify.mjs` — persistido en el sandbox del agente, re-ejecutable):
- Escritorio (1280×800): enlace visible en nav → clic navega a `/gaceta` → datos reales (5 enlaces a artículos) → ambas categorías visibles → artículo **gaceta** individual (len 4154) → botón compartir presente → artículo **costpro** individual (len 2321) → vuelta al landing con nav intacta → tarjeta/tira presente → SEO (title + description + OG) verificado.
- Móvil (390×844): drawer → «Novedades» primera entrada, sin scroll → navegación a `/gaceta` con datos → artículo individual legible → tarjeta del capítulo 5.
- Privacidad: los 4 checks de permisos de la sección 6.

**Unitarias:** 35/35 en los suites del landing (`landing-brand-enhanced`, `landing-pager-contract`). `tsc --noEmit` limpio; ESLint 0 errores en los 4 archivos modificados.

**Modo cine sin degradación:** el stage persistente sigue activo en escritorio (la sonda de ajuste de contenido no cayó a modo flujo); la tira de cierre es visible en la escena final.

**Producción (preexistente, verificado):** `https://costpro4.vercel.app/gaceta` HTTP 200 con las 2 publicaciones reales cargándose (1 Gaceta + 1 CostPro).

## 8. Commit, PR y CI

- Commit: `feat(landing): CP-LANDING-NEWS-ACCESS-001 — acceso visible a Novedades (/gaceta) desde el Landing Page` (rama `feat/novedades-landing-20261125`).
- PR: hacia `main` desde la rama de la misión. Escaneo de secretos en el diff: **cero coincidencias** (`github_pat_`, `sb_secret_`, `sbp_`, `sb_publishable_`, `eyJhbGciOi`, credenciales de BD).
- CI: checks automáticos del repo (Unit & Integration, TypeCheck+Build, SQL Static/Security, Vercel). El workflow «E2E Aislado» es solo manual (workflow_dispatch) — no aplicable a esta misión (sin cambios de BD).

## 9. Despliegue de producción

El despliegue público ocurre vía Vercel al fusionar el PR. La vista `/gaceta` YA está desplegada y funcionando en producción; el acceso landing se activará con el merge. Verificación post-merge: abrir `https://costpro4.vercel.app`, confirmar «Novedades» en la nav (escritorio) y en el drawer (móvil).
