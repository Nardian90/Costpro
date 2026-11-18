# ADN-BRAND-HERO-REFINEMENT-002 — Regresiones y verificación

**Fecha:** 2026-11-18 · **Sandbox local** (PM2 `costpro`, `.env` principal, health 200)

## 1. Batería local

| Verificación | Comando | Resultado |
|---|---|---|
| TypeScript | `bunx tsc --noEmit` (heap 2600MB) | **exit 0** |
| ESLint (archivos tocados) | `bunx eslint …` (6 archivos) | **0 errores**, 9 warnings pre-existentes (patrón `<button>` crudo del landing, ya presente en 001) |
| Suite unitaria completa | `bunx vitest run` | **453 archivos · 6167 tests passed · 0 failed** (95 skipped estructurales) |
| Validación visual responsive | `scripts/validate-hero-002.mjs` | **PASS** — 6 viewports sin overflow, wordmark único, 3 caminos, reduced-motion estático, 0 errores de consola |
| Salud del servidor | `GET /api/health` | `{"status":"ok"}` con `.env` principal restaurado |

Nota OOM (conocida del worklog de 001): el sandbox de 3-4GB no completa el paso TS interno de `next build`; `tsc --noEmit` cubre la verificación de tipos local y el build completo corre en CI.

## 2. Tests actualizados por el cambio (intencional, documentado)

| Test | Cambio | Motivo |
|---|---|---|
| `landing-brand-enhanced.test.tsx` → «identidad única» | `hero` ya no debe contener `BrandWordmark`/`AdnIsotipo`; debe contener `AdnWordmark` | El hero ya no repite la marca (misión §3) |
| `landing-brand-enhanced.test.tsx` → «3 caminos» (nuevo) | Testid + handlers FIX-ENTRY blindados | Proteger los caminos de entrada en futuros rediseños |
| `e2e/landing-page.spec.ts` | Regex del titular `/menos malabares\|más negocio/i` | Nuevo titular monumental |
| `e2e/auth-resilience-persistent.spec.ts:288` | Regex ampliada (titulares nuevos o ADNegocio) | Idem |
| `e2e/fc-template-picker.spec.ts:516` | «…en COSTPRO» → «…en ADNegocio» | **Corrección del fallo E2E del PR #1651**: la UI se rebrandeó en 001 y la aserción quedó obsoleta (50/51 pasaban; el 1 fallo era este residuo) |

## 3. Contratos que NO cambiaron (verde en la suite completa)

- `entrar-costpro-cta.test.ts` (CP-AUTH-RESILIENCE-003): `entrarACostpro` sin recargas — **18/18** (incluye contratos de fuente sobre HeroSection).
- FIX-ENTRY: `path-ficha-costo` / `path-costpro` / `path-demo` presentes con sus handlers.
- `MultiStoreVisualSection` (catálogo demo, imágenes, fallback) — intacto.
- `ParticleBackground` (contrato enhanced-layer / loading-branding) — intacto.
- Motor financiero, shell, help center, documentos: **0 archivos de negocio tocados** en esta misión.

## 4. Escaneo de secretos del diff

`git diff 7aa3ead1c..HEAD` examinado: sin `github_pat_`, `sb_secret_`, `sbp_`, `sb_publishable_`, `eyJhbGciOi`, ni credenciales de BD. El PAT se usó solo en URL efímera de push (nunca en `.git/config` ni archivos commiteados).

## 5. CI del PR al cierre de esta misión

- Fase A push `e1fa659bf` y fase B push `09bddb187` disparan los checks estándar (Allowlist, Security Audit, TS Security, TypeCheck+Lint+Build, Unit & Integration, Vercel).
- El workflow «E2E Aislado (CostproE2E)» es manual (workflow_dispatch) — no bloquea merge; su fallo anterior quedó explicado y corregido (§2).
