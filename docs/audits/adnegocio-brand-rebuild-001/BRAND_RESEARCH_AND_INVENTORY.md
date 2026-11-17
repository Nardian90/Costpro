# ADN-BRAND-REBUILD-001 — BRAND RESEARCH AND INVENTORY

**Misión:** ADN-BRAND-REBUILD-001 · Rebranding integral COSTPRO → ADNegocio
**Fecha:** 2026-11-18 · **Rama:** `feat/adnegocio-brand-rebuild-001-20261118`
**Método:** exploración exhaustiva con 3 agentes de investigación + verificación directa de los archivos contractuales (HeroSection, landing-page.spec, landing-brand-enhanced.test, auth-resilience-persistent.spec, data.ts).

---

## 1. Decisión de marca

| Elemento | Valor |
|---|---|
| Nombre oficial del producto | **ADNegocio** |
| Símbolo compacto | **ADN** |
| Descriptor del símbolo | **NEGOCIO** (bajo ADN) |
| Marca anterior (solo referencias históricas) | COSTPRO |
| Transmisión | Plataforma empresarial integral, moderna, sólida, profesional y tecnológica |

`COSTPRO` (nombre original, herramienta de fichas de costo) deja de ser identidad visible. El nombre refleja la evolución del producto hacia un universo completo de operaciones empresariales.

## 2. Arquitectura del landing actual

- El landing vive en la ruta `/` — **no** en `/landing`:
  - `src/app/page.tsx` — Server Component con `metadata` + `<noscript>` SEO.
  - `src/app/HomePageClient.tsx` — gate de sesión: no autenticado → `LandingPage` (dynamic import, `ssr:false`); autenticado → `CyberShell` + `TerminalShell`.
  - `src/app/LandingPage.tsx` (577 líneas) — composición real: barra de progreso de lectura, dots laterales, `HeroSection` (envuelve todas las secciones como children), `MultiStoreVisualSection`, `ServicesStorySection`, `FeaturesSection`, `PricingSection`, `FAQSection`, `FinalCTASection`, `FooterSection`, `FloatingElements`, modales (`ShortcutsModal`, `InteractiveDemoModal`, `ContactModal`, `LoginModal`, `FooterModals`), `CommandPalette`, drawer móvil.
- Login: **modal único** (`LoginModal` en `src/components/landing/Modals.tsx`), abierto por:
  - CTA `entrarACostpro()` (contrato probado `src/__tests__/lib/entrar-costpro-cta.test.ts`: HeroSection debe contener `entrarACostpro` y NO puede usar `hasCostproSession()` ni `window.location.assign()`).
  - Evento puente `open-login` (detalle `register` → pestaña de registro).
  - Deep link `/?login=1&returnTo=%2Ffc%2F` (allowlist `safeReturnTo` en `src/lib/navigation.ts`).
- Selector de 3 caminos en el hero (FIX-ENTRY): `path-ficha-costo` (Ficha de Costo gratis `/fc/`), `path-costpro` (plataforma completa), `path-demo` (demostración).

## 3. Aislamiento visual del landing (landing-shield, 2026-10-06)

- Raíz `#landing-root` + tokens propios fijados en `src/styles/landing-shield.css` con selectores `html/body:has(#landing-root)` — sin depender de `html.dark` ni de next-themes.
- `@custom-variant dark` incluye `#landing-root *`.
- Los temas internos `.mode-performance` / `.mode-enhanced` quedan acotados con `html:not(:has(#landing-root))` → **el landing no hereda los temas internos**. El rediseño debe conservar este blindaje.
- `handleToggleTheme` del landing es un no-op (no muta `<html>` ni localStorage de tema).

## 4. Inventario de apariciones de COSTPRO (categorías del §14 de la misión)

### Categoría 1 — Marca comercial visible (actualizar)
| Superficie | Archivos clave |
|---|---|
| Landing (textos) | `HeroSection.tsx` (aria-labels L492/526/573, «COSTPRO · Ficha de Costo» L508, «Entrar a COSTPRO» L558/564), `LandingPage.tsx` (texto drawer L567), `BrandWordmark.tsx` («Cost»+«Pro»), secciones (`data.ts` L16 «CostPro incorpora…», FAQ L111-118), `page.tsx` (metadata + noscript, 7 apariciones) |
| Shell interno | `Sidebar.tsx` L525-547 (texto `COST+PRO`, rail `CP`, aria-labels), `CostProLoader.tsx` L263 (splash `Cost/Pro`), `ViewLoadingSplash.tsx` L188 (`CP`), `ParticleBackground.tsx` L277-279 (`COSTPRO` fondo, clase técnica `.bg-costpro-branding` se conserva), `TerminalShell.tsx` L371 (`label="COSTPRO"`) |
| Auth | `LoginForm.tsx` L309-310, `RegisterForm.tsx` L233 |
| Estado | `not-found.tsx` L206, `global-error.tsx` L87, `public/offline.html` L6/19, `KeyboardShortcutsModal.tsx` L29 |
| Ayuda UI | `HelpLayout.tsx` L116/230/296, `HelpContent.tsx` L131/221/300/362, `HelpSidebar.tsx` L491, `AccessibilityStatement.tsx` L18/27 |
| Reportes/docs generados | `ReportPreview.tsx` L183/324, `ReportShareModal.tsx` L57/59, `ReportScheduleModal.tsx` L184, `cash-report-pdf.ts` (L925/958/1001/2057), `cash-report-docx.ts` (L228/654/709/838/1371/1404), `pi-pdf.ts` L85/104, `inventory-stock-pdf.ts` L173, `ipv-ventas-pdf.ts` L307, `sales-history-pdf.ts` L474, `pdf-export.ts` L12/36, `pdf-format-standard.ts` L457/670, `pdf-format-res148.ts` L427, `pdf-format-bilingual.ts`, `pdf-generator.ts` L338-341, `pdf-format-special.ts` L588, `ot-pdf-generator.ts`, `comprobante-cobro-pdf-generator.ts`, `pdf-shared.ts`, `backup-service.ts` L758, legales Res.11 (`sc201/sc204/sc208/sc209/sc212/sc213/sc216` «Identificador COSTPRO de…», `sc-logo.ts` monograma CP) |
| Vistas de negocio | `CostSheetTemplateExplorer.tsx`, `CostSheetSaveAsTemplateDialog.tsx`, `CostSheetPreview.tsx` L26/57, `CostSheetActionsPanel.tsx` L354, `CostSheetNarrative.tsx` L609, `FCPreviewModal.tsx` L617, `FCTemplatePicker.tsx` L99, `StoreTemplateSelector.tsx` L18/35 (nombre visible de plantillas sistema), `BulkApplyTemplateModal.tsx` L166 (placeholder), `RestoreBackupModal.tsx` L123-124 (formato — técnico, se conserva), `MaterialRequestFormModal.tsx` L669, `ExchangeIntelligenceView.tsx` L1533/1546, `ExecutiveDemoView.tsx` L119/343, `HealthLayout.tsx` L114, `ApiDocsViewer.tsx` L580, `FloatingCalculator.tsx` L115/163/179/809, `ChatBot.tsx` L1322 + `system-prompt-builder.ts` L31 («Darian, asistente de CostPro»), `viewRegistry.ts` L24 |
| Legal | `src/app/terms/page.tsx` (36+), `src/app/legal/page.tsx`, `src/app/privacy/page.tsx`, i18n `privacy.contactEmail` |
| i18n | `src/messages/es.json` / `en.json`: `common.appName`, `seo.*`, `landing.nav.cta`, `landing.whyCostPro`, `landing.footer.copyright`, claves de plantillas FC (999-1027) |
| Técnico visible al usuario | `public/manifest.json` (name/short_name/labels), `public/sw.js` L54 (título de push), `src/app/layout.tsx` metadata (L46-267), `src/app/page.tsx`, `sitemap.ts` (comentario), `openapi-spec.ts` (contacto/support email — mantener dominio de correo), `public/system_architecture.json`, `public/widgets/summary.json`, `robots.txt` (comentario) |
| FC sub-app | `public/fc/index.html` (title), `public/fc/manifest.webmanifest` (name/short_name), `public/fc/FC.html` (title, appbar, gate texts, watermark, pie de PDF «Documento generado con COSTPRO») — vía parcheador `scripts/fc-identity-patch.py` + regeneración de `release-manifest.json` (SHA256) + `scripts/fc-syntax-check.cjs` |

### Categoría 2 — Documentación y ayuda (actualizar)
- `knowledge/help/` — **194 menciones en 42 archivos md** (servidos por fs vía `/api/help-docs`). Top: `compliance/incident-response-plan.md` (21), `compliance/international-transfers.md` (19), `01-empezar/introduccion.md` (15), `01-tutoriales/01-primer-inicio.md` (11), `04-explicacion/06-como-funciona-offline.md` (11), `02-gestion/herramientas-globales.md` (10), glosarios (9+7), inventario (9).
- `README.md` (título, footer), `AGENTS.md` (solo referencias técnicas a proyectos Supabase — conservar).

### Categoría 3 — Código y nombres técnicos (NO renombrar)
- localStorage/IndexedDB (~30 claves): `costpro-ui-storage`, `costpro-visited`, `costpro:*` (recent-stores, pinned-nav, adaptive-nav, inventory, cash-report, work-date, thermal…), `costpro_cookie_consent`, BD IndexedDB `'CostPro'` (offline-storage).
- Service Worker: cache `costpro-next-static-v4` + patrón de purga `costpro-` (ServiceWorkerRegister L44), FC cache `costpro-release-*`.
- Redis/idempotencia: `costpro_rl`, `costpro_idem_lock:`.
- IDs de plantillas FC persistidos en BD y API: `costpro-reinicio`, `costpro-ejemplo`, `costpro-lavar`.
- Sentry (`org: costpro`, `project: costpro-enterprise`), protocolo `web+costpro`, TWA `app.vercel.costpro4.twa`, dominio `costpro4.vercel.app`/`costpro.onrender.com` (metadataBase — sin cambio de DNS).
- `service: 'costpro-enterprise'` en `/api/health` — contrato observado por `e2e/health-api.spec.ts:15` y evidencias (se conserva; documentado).
- Clase técnica `.bg-costpro-branding` y testid `path-costpro` (anclados por tests; invisibles al usuario).
- Proyectos Supabase `CostproBD` (wthkddeleylijmonclxg) y `CostproE2E` (lguovmvrozxgssupkwpf).
- `ecosystem.config.js` (nombre PM2 `costpro`), `package.json` name, `docker-compose.yml` container, workflow `E2E Aislado (CostproE2E)`.

### Categoría 4 — Datos históricos (NO renombrar)
- `TIENDA CENTRAL COSTPRO` (UUID d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576), `admin@costpro.com`, pilotos `E2E PILOT X CostPro`, `landing.demo@costpro-e2e.com`, correos `@costpro.test` — fijados en `e2e/config/protected-resources.json` + fallback `e2e/fixtures/protected-resources.ts` (fail-closed; renombrar sin sincronizar BD = hard-delete accidental).
- Historial contable, documentos ya emitidos, `docs/audits/WORKLOG_RESOLUCION_TAREAS_COSTPRO.md` (ruta fijada por `src/__tests__/docs/ipv003-registry-consistency.test.ts`).
- Comentarios de misión `COSTPRO-XXX-NNN` / `CP-...` (metadatos de auditoría histórica).

### Categoría 5 — Configuraciones e integraciones (NO renombrar)
- Variables de entorno, `.env*`, CSRF_ALLOWED_DOMAINS, `NEXTAUTH_SECRET`, refs Supabase, `assetlinks.json`, verificación Google, plantillas de email de Supabase Auth (fuera del repo — nota para el propietario).

### Categoría 6 — Referencias externas (fuera de alcance)
- Repo GitHub `Nardian90/Costpro`, URL de producción, proyecto Sentry, TWA Android, plantilla de correos en dashboard Supabase.

## 5. Contratos de test que fijan marca (a actualizar en el mismo PR)

| Test | Contrato actual | Acción |
|---|---|---|
| `src/__tests__/components/landing-brand-enhanced.test.tsx` | BrandWordmark `Cost` verde + `Pro` blanco (source-contract sobre BrandWordmark.tsx/HeroSection/FooterSection/LandingPage); ParticleBackground `.bg-costpro-branding` (clase técnica) | Actualizar contrato del wordmark a ADNegocio; clase técnica se conserva |
| `src/__tests__/lib/entrar-costpro-cta.test.ts` | HeroSection contiene `entrarACostpro`, sin `hasCostproSession`/`window.location.assign` | Se conserva (función `entrarACostpro` es código; el texto visible cambia) |
| `e2e/landing-page.spec.ts` | heading `/costpro/i`; testids `path-ficha-costo`/`path-costpro`/`path-demo`; `#features` con h3; `#footer-section` con «Política de Privacidad» | Actualizar heading a `/adnegocio/i`; resto se conserva |
| `e2e/auth-resilience-persistent.spec.ts` | `getByTestId('path-costpro')` o heading `/COSTPRO/i` | testid se conserva; heading → `/ADNegocio/i` |
| `e2e/flows/auth-session-ui.spec.ts` | `[aria-label*="Entrar a COSTPRO"]` | → «Entrar a ADNegocio» |
| `src/__tests__/lib/fc-system-templates.test.ts` L87, `fc-generate-from-template.test.ts` L240, `e2e/fc-vistazo-pdf.spec.ts` | nombre visible de plantilla `'CostPro — Reinicio (General)'` | → `'ADNegocio — Reinicio (General)'` (id `costpro-reinicio` intacto) |
| Tests de PDF/DOCX/XLSX (`cash-report-*`, `sc204-pdf-ux-004`, `sales-history-pdf`) | «CostPro — Reporte…», «fórmula completa COSTPRO», «Identificador COSTPRO de…», filenames `COSTPRO_Reporte_Entrega_*` | Rebrand a ADNegocio en documentos NUEVOS + actualización de aserciones |
| `e2e/landing-shield/*.py` | 12+2+2+1 menciones (nombres de archivo/tokens) | Verificar y actualizar si fijan cadenas visibles |

## 6. Sistema visual actual (base a conservar)

- Negro profundo `#020617`/`#0a0f1a`, verde neón `#22c55e` (+`#4ade80`/`#2dd4bf` en FC), superficies glass `white/[0.04-0.08]`.
- Tipografía: Space Grotesk (`--font-space-grotesk`) para display; body Inter/Geist (layout raíz).
- Capturas reales: `public/landing/capturas/*.webp` (15), demo products (6 webp), `public/help/capturas/*.webp` (24).
- Fuentes de captura: `scripts/landing-captures.mjs`, `landing-captures-mobile.mjs`, `help-captures.mjs`.

## 7. Riesgos identificados

1. **Fail-closed E2E**: renombrar tiendas/usuarios protegidos sin sincronizar JSON+BD = hard-delete accidental (incidente 2026-10-09 documentado). → No se renombra ningún dato protegido.
2. **FC release canónico**: `FC.html` tiene SHA256 en `release-manifest.json`; toda edición exige el parcheador + regeneración del manifest + syntax check.
3. **Claves de persistencia**: renombrar storage keys pierde preferencias/consentimiento de usuarios reales. → Se conservan todas.
4. **`/api/health` `service: 'costpro-enterprise'`**: observado por E2E y evidencias de despliegue. → Se conserva (identificador técnico).
5. **Emails**: la plantilla de correo vive en el dashboard de Supabase (fuera del repo) — pendiente del propietario, documentado en el informe final.

## 8. Conclusión

El rebranding se ejecuta en **6 superficies** (landing, shell, ayuda, documentos generados, técnico/metadatos, legal) manteniendo intactos los identificadores técnicos, datos históricos, gobernanza E2E y la funcionalidad de negocio. La configuración central de marca se crea en `src/config/brand.ts` (los `BRAND_NAME` existentes en `src/config/app.ts` no tenían consumidores) y los activos vectoriales en `public/brand/` + componentes `src/components/brand/`.
