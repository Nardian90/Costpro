# FASE F0 — 03 E2E ANALYSIS (R-E2E-1)

**Fecha**: 2026-09-27 · **Método**: logs CI reales (GitHub API GET-only) + repro local controlado. Cero mutaciones contra tiendas protegidas.

## 3.1 Número real de fallos y su fuente

| Fuente | Número | Estado |
|---|---|---|
| CI E-SEC (`6022ae85`) vs baseline FASE D (`6ac52feb`) | **171 failed / 97 passed** — idéntico en ambos SHAs | completado (evidencia FASE-E-SEC/12-ci.md) |
| CI E-SEC-FINAL (`cad8e446`) y HEAD (`892bcd6b`) | **job CANCELLED a los 30 min** (timeout de job), con **156 tests únicos** reportados como fallidos antes del corte | cancelado — no llegó a totales finales |
| Repro local HEAD (muestra read-only) | landing-page **6/6 PASS**, security-headers **PASS**, store-switching **10/12 FAIL** | completado |

El histórico «171 failed / 97 passed» es la cifra completa; en `cad8e446`/`892bcd6b` el job E2E fue cancelado por timeout (22:15:57Z tras iniciar 21:45:28Z) — la diferencia (171 vs 156) son tests que no llegaron a ejecutarse, **no** mejoras.

## 3.2 Agrupación por causa raíz (no por archivo)

Análisis programático del log del job E2E de `cad8e446` (job id 108493153752, log 494 KB — `scripts/e2e-ci-cad8e446.log`):

```text
156 tests únicos fallidos  →  3 causas raíz  +  0 bugs de producto

RC-1  75 tests   secrets E2E vacíos en CI → API responde 401
RC-2  77 tests   UI sin sesión autenticada → timeouts/assertions
RC-3   4 tests   URL Supabase ficticia en CI → fetch failed (login/DNS)
```

### RC-1 — Secrets E2E no configurados en CI (75 tests)

`ci.yml`: `E2E_TEST_ADMIN_TOKEN: ${{ secrets.E2E_TEST_ADMIN_TOKEN || '' }}` → vacío.
`e2e/fixtures/auth.fixture.ts:getAuthHeaders()` devuelve `null` sin token; los specs (p.ej. `multi-store-comprehensive.spec.ts:24` `headers = getAuthHeaders('admin')!`) proceden igualmente sin `Authorization`.

**Prueba**: en el log CI, `Expected: 200 / Received: 401` aparece **154 veces**; los `toContain` fallidos también reciben 401 (p.ej. academy `[BUG-013]` espera `[400,200,502]` y recibe 401).
**Contra-prueba local (mismo endpoint, mismo HEAD)**: login real contra Supabase con credenciales de test documentadas (`admin@costpro.com`, exitoso, rol admin) → `GET /api/stores` con `Authorization: Bearer <jwt>` → **HTTP 200** con datos. El API funciona; el fallo es de configuración de entorno CI.

### RC-2 — Fixture de autenticación UI obsoleto (77 tests: 31 timeouts + 46 aserciones)

`e2e/fixtures.ts:96-118` (`authedPage`): navega a `/auth/signin` (ruta que **no existe** → 404; el login real es un modal en la landing, documentado desde fases previas), intenta `e2e-admin@costpro.test` / `E2eTest123!` (usuario **inexistente**: `signInWithPassword` → `400 Invalid login credentials` verificado contra Supabase real), y con `catch(() => {})` continúa silenciosamente SIN sesión.

**Repro local (browser real, chromium v1234, Supabase real, sin mutaciones)**:
```text
store-switching.spec.ts: 10 failed / 2 passed
TimeoutError: page.waitForSelector('[role="article"], [data-testid="stores-empty"]') 15s
Page snapshot → el test queda en la LANDING PÚBLICA (no autenticado), /terminal → 307
```
Las 46 aserciones restantes (`toBeVisible`, `toContain`, etc. en accounts-payable, academy UI, ai-chat UI, reports…) son specs que navegan sin sesión (0 usos de `authedPage` en 10 de las 12 suites revisadas) — misma familia: UI anónima no renderiza lo esperado.

### RC-3 — Fallback de URL Supabase ficticia (4 tests)

`ci.yml`: `NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co' }}` — dominio inexistente → `signInWithPassword` lanza `fetch failed` (DNS) en `security.spec.ts` (3) y `reverse-duplicate-ui.spec.ts` (1, `Login failed`).

## 3.3 Comparación histórica (¿regresión de E-SEC-FINAL?)

| Evidencia | Conclusión |
|---|---|
| `FASE-E-SEC/12-ci.md`: 171/97 **idéntico** en `6ac52feb` (FASE D, pre-E-SEC) y `6022ae85` (E-SEC) | el fracaso E2E es 100% preexistente a las fases de precio |
| Suites fallidas (multi-store, fc-automation, academy, accounts-payable, reports, legal, PWA…) | **ninguna cubre precio/checkout** (verificado: no existe spec dedicado a POS/checkout/ventas — sólo `sync-batch.spec.ts`, que **no falla** en CI) |
| `cad8e446` (E-SEC-FINAL) tocó política de precio server-side + modal POS | los 3 mecanismos de fallo (secrets CI, fixture auth, URL fallback) son independientes de esos cambios |
| Repro local: RC-2 reproduce en HEAD con browser real | confirmación directa de que el modo de fallo persiste y es de infraestructura |

**Clasificación por test**: REPRODUCIBLE (RC-2, repro local) / ENVIRONMENTAL (RC-1, RC-3 — dependen de secrets/fallback CI) / STALE TEST (fixture `authedPage` y specs sin auth, rotos frente a la app actual) / REAL PRODUCT BUG: **0**.

## 3.4 Conclusión

- Causas raíz reales: **3** (más 1 ambiental local: browser mismatch, resuelto instalando chromium v1234).
- Tests afectados: 156 en job cancelado (171 en runs completos históricos).
- Preexistente: 100% (idéntico desde FASE D). Regresión de E-SEC/E-SEC-FINAL: **0**.
- Deuda adicional detectada: el flujo de negocio crítico (venta/checkout) **carece de spec E2E propio**; su protección actual son los 2278 tests unit/integration + evidencias browser de E-SEC/E-SEC-FINAL.
- El job E2E en CI además **no completa** (cancelado por timeout a los 30 min) — el suite es demasiado lento o el job demasiado corto: deuda de tooling.
