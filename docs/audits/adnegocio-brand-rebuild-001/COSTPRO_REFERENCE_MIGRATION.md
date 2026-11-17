# COSTPRO REFERENCE MIGRATION — ADN-BRAND-REBUILD-001

**2026-11-18** · Inventario de migración por categorías (misión §14)

## 1. Migrado a ADNegocio (categorías 1-2 y superficies visibles)

| Categoría | Detalle |
|---|---|
| Metadatos raíz | `layout.tsx` (title/template/description/OG/Twitter/JSON-LD ×2, keywords), `page.tsx` (metadata + noscript), `manifest.json`, `robots.txt`, `offline.html`, `sw.js` (notificación), `system_architecture.json`, `widgets/summary.json`, `sitemap` comentario |
| Landing | Hero, header, selector, drawer, data.ts, FAQ, Features, ServicesStory, MultiStoreVisual, FinalCTA, Footer, Modals, FooterModals, InteractiveDemoModal, demo scenes, FloatingElements, BrandWordmark |
| Shell | Sidebar (wordmark + rail), CostProLoader, ViewLoadingSplash, ParticleBackground, TerminalShell label, view-tips, KeyboardShortcutsModal, not-found, global-error, ChatBot/Darian (×2), viewRegistry (×2), ApiDocsViewer, HealthLayout, ExecutiveDemoView, Report* (×5), FloatingCalculator, ExchangeIntelligence («Captura ADNegocio:»), MaterialRequest, FCPreviewModal, FCTemplatePicker, StoreTemplateSelector, BulkApply (labels), i18n es/en (appName, seo, landing, copyright, plantillas FC) |
| Auth | LoginForm (×2), RegisterForm |
| Fichas de costo | Banner ADNEGOCIO, Preview, TemplateExplorer (×5), SaveAsTemplateDialog (×3), Narrative (Word footer), ArenaFC |
| Ayuda | 42 archivos md (194→12 menciones) + cabeceras HelpLayout/HelpContent/HelpSidebar/AccessibilityStatement + glosario (entrada ADNegocio) |
| Documentos generados | cash-report PDF/DOCX/XLSX (pies, fila OFICIAL, filenames `ADNegocio_Reporte_Entrega_*`), pdf-generator/standard/res148/bilingual/special/shared, ot/comprobante-cobro (author/creator), sales-history, pdf-export (`adnegocio_audit_*`), backup PDF, ReleaseGatePdfExporter, legales Res.11 sc201/204/208/209/212/213/216 («EN ADNEGOCIO»/«Identificador ADNegocio»), sc-logo (monograma CP→ADN), pi-pdf, inventory-stock, ipv-ventas, ticket térmico, ofertas export |
| Legales web | terms/privacy/legal (marca + nota histórica; correos intactos) |
| OpenAPI | título, contacto, descripciones |
| PWA/Favicon | logo.svg, icon.svg, 7 PNG, apple-touch-icon |
| FC sub-app | FC.html (120), index.html, manifest.webmanifest, release-manifest.json (SHA256 regenerado, nota de historia), parcheador con R23 reproducible |
| Código muerto | `CostProLogo.tsx` eliminado (0 importadores) |

## 2. NO migrado — identificadores técnicos justificados (categorías 3-5)

| Identificador | Motivo |
|---|---|
| ~30 claves localStorage/IndexedDB (`costpro:*`, `costpro-*`, `costpro_*`, BD IndexedDB `'CostPro'`) | Renombrar pierde preferencias/consentimiento de usuarios reales |
| Cachés SW `costpro-next-static-v4`, `costpro-release-*`, patrón de purga `'costpro-'` | Forzaría re-cache masivo / rompería purga |
| Redis `costpro_rl`, idempotencia `costpro_idem*` | Claves compartidas en producción |
| IDs de plantillas FC `costpro-reinicio`/`costpro-ejemplo`/`costpro-lavar` (+ placeholder `costpro-reinicio`) | Persistidos en BD y usados por API/E2E; los NOMBRES visibles sí cambiaron |
| `service: 'costpro-enterprise'` en `/api/health` + example OpenAPI | Contrato observado por `e2e/health-api.spec.ts` y evidencias de despliegue |
| Formato `costpro-store-backup` | Contrato de formato de respaldos |
| `FC_JSON_FORMAT="costpro-ficha"` 1.0 | Formato de intercambio de fichas |
| Dominios `costpro4.vercel.app` / `costpro.onrender.com` / `metadataBase` | Sin cambio de DNS (misión §14); `tienda.adnegocio.app` solo en mock labels decorativos |
| Protocolo `web+costpro`, TWA `app.vercel.costpro4.twa`, assetlinks | Registrados en SO/TWA |
| Sentry `org: costpro` / `project: costpro-enterprise` | Proyecto real de Sentry |
| Proyectos Supabase `CostproBD` / `CostproE2E` | Infraestructura |
| Correos `@costpro.app` (`privacy@`, `privacidad@`, `soporte@`, `support@`) | Buzones operativos — migración de buzones pendiente del propietario |
| PM2 `costpro`, package name, workflow `CostproE2E`, `CostproE2E`/`CostproBD` en AGENTS.md | Infraestructura/despliegue |
| Clase `.bg-costpro-branding`, testid `path-costpro`, testid `costpro-captured`, `costpro:skip-splash` | Anclados por tests; invisibles al usuario |
| Tiendas/usuarios protegidos (`TIENDA CENTRAL COSTPRO`, `admin@costpro.com`, `E2E PILOT X CostPro`, `landing.demo@costpro-e2e.com`) | Fail-closed E2E — renombrarlos sin sincronizar BD = hard-delete accidental (incidente 2026-10-09) |
| Comentarios históricos de misiones (`COSTPRO-XXX-NNN`, `CP-…`), expedientes `docs/audits/*`, `WORKLOG_RESOLUCION_TAREAS_COSTPRO.md` | Historial de auditoría (ruta fijada por test de registro) |
| Nombres de archivos de tests (`entrar-costpro-cta.test.ts`, etc.) | Convención histórica |

## 3. Pendientes FUERA del repositorio (propietario)

1. Plantillas de email de Supabase Auth (dashboard) — rebrand a ADNegocio.
2. Buzones `@adnegocio.*` y actualización posterior de los correos legales/ayuda.
3. Regeneración de capturas de ayuda (`scripts/help-captures.mjs`) y landing
   (`scripts/landing-captures.mjs`) contra BD aislada/aprobada — las actuales
   muestran el shell anterior en sus bordes.
4. Repo GitHub/URL producción/Sentry/TWA: sin cambio por mandato §14.

## 4. Búsqueda final de residuales

`rg -i costpro` en superficies visibles (`src/` sin tests, sin técnicos) → **0
menciones de marca visible**. Los restantes son técnicos/históricos documentados
en §2. En `knowledge/help` quedan 12 (11 correos operativos + 1 nota histórica).
