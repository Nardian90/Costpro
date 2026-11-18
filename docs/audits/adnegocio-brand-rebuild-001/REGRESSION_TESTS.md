# REGRESSION TESTS — ADN-BRAND-REBUILD-001

**2026-11-18** · La misión no altera funcionalidad de negocio (§10/§15): identidad,
textos y metadatos. Evidencia local completa.

## 1. TypeCheck y Lint

| Check | Resultado |
|---|---|
| `tsc --noEmit` (heap 6GB) | **OK — 0 errores** |
| `eslint .` (repo completo) | **0 errores** (1576 warnings preexistentes del código heredado; sin errores) |
| `next build` | **Compilación ✓** (Turbopack, 63–68s). El paso TS interno del build es OOM-killed por el sandbox (3 GB RAM física, verificado 3 veces); cobertura equivalente ejecutada por separado (`tsc --noEmit` ✓). El build completo corre en CI (TypeCheck+Lint+Build). |

## 2. Unit & Integration (vitest)

- Suite completa: **459 archivos → 6166/6166 tests PASS** (95 skipped, 6 skipped files,
  los mismos que en main antes del PR — skips por entorno).
- 1 fallo inicial corregido: `sc-header-ux-005` fijaba el monograma `(CP)` →
  actualizado a `(ADN)` (contrato de identidad, mismo patrón que los demás).

## 3. Suites directamente afectadas por el rebranding (verde)

| Suite | Tests |
|---|---|
| `landing-brand-enhanced` (contrato BrandWordmark ADN/egocio) | 8 ✓ |
| `entrar-costpro-cta` (contrato funcional del CTA) | 9 ✓ |
| `fc-system-templates` (nombres visibles de plantillas) | 11 ✓ |
| `fc-generate-from-template` | ✓ |
| `exchange-intelligence-view` («Captura ADNegocio:») | ✓ |
| `sidebar-superadmin-navigation` (labels/estructura intactos) | 6 ✓ |
| `cash-report-docx/pdf-period/pdf-enervida/export-selection/excel/word-button` (documentos rebrandeados) | 7 archivos ✓ |
| `sc204-pdf-ux-004`, `sc-header-ux-005` (legales) | ✓ |
| **Total full-suite** | **6166 ✓** |

## 4. E2E (specs actualizados en el PR; ejecución en CI)

- `e2e/landing-page.spec.ts` — heading del hero actualizado (testids intactos).
- `e2e/auth-resilience-persistent.spec.ts` — condición heading `/ADNegocio|Todo tu negocio/i`.
- `e2e/flows/auth-session-ui.spec.ts` — aria-label «Entrar a ADNegocio».
- `e2e/fc-vistazo-pdf.spec.ts` — nombre de plantilla sistema «ADNegocio — Reinicio (General)».
- Gobernanza intacta: `protected-resources.json` sin cambios (fail-closed),
  `health-api.spec` sin cambios (`service: costpro-enterprise` se conserva).

## 5. Verificación funcional manual (navegador real)

- Landing renderiza (SSR + cliente), splash y sesión sin rebotes; CTA abre el
  modal de acceso; navegación por secciones y drawer móvil operativos.
- Header fijo con transformación al scroll (verificado con getComputedStyle y captura).
- Consola sin errores (`console.error`/`pageerror` = 0).

## 6. Seguridad / infraestructura (sin cambios por la misión)

- Auth/RLS/multi-tenant/permisos: sin toques (0 cambios en backend de negocio).
- `ci-gate-allowlist.json` y writers manifest: sin nuevos escritores fuera de
  `scripts/` del sandbox; el parcheador FC (`scripts/fc-identity-patch.py`) ya
  existía y solo recibió el post-pase R23 documentado.
- Sin secretos en el diff (escaneo `github_pat_|sb_secret_|sbp_|sb_publishable_|eyJhbGciOi` = 0).
