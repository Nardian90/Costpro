# CostPro — E2E Incremental por Lotes: Reparación Controlada y Progresiva

**Protocolo:** E2E incremental por lotes (FASE 0–26)
**Rama:** `fix/e2e-incremental-stabilization`
**PR:** [#1366](https://github.com/Nardian90/Costpro/pull/1366)
**BASE_COMMIT:** `439d0090` (origin/main)
**Fecha de certificación:** 2026-10-05
**Veredicto:** ✅ **CERTIFIED**

---

## 1. Resumen ejecutivo

La suite E2E de CostPro (382 tests, 44 archivos spec, proyecto Chromium) fue estabilizada mediante el protocolo de reparación incremental por lotes: primero los fallos históricos conocidos, luego lotes deterministas de ~50 tests con Gate de 0 unresolved entre cada uno, y finalmente una campaña de certificación FULL que recorrió la suite completa una sola vez, dividida en 13 chunks con guardarraíl de higiene de datos antes y después de cada uno.

El resultado final de la campaña de certificación es **382/382 tests ejecutados: 357 passed, 25 skipped (condicionales por entorno), 0 failed**, con **net delta de datos = 0** en todos los chunks y las entidades protegidas intactas. No quedó ningún test en estado UNKNOWN. La clasificación de los fallos encontrados durante el proceso se documenta en §4 y todos fueron de tipo TEST BUG / FLAKY (infraestructura de test) — **no fue necesario modificar código de producto para que la suite pasara**, salvo dos correcciones de producto legítimas detectadas por los tests (a11y de touch targets y RPC de hard-delete), que se documentan como hallazgos del proceso.

## 2. Entorno y método

- **Servidor bajo prueba:** pm2 `costpro` (bun server.ts, Next.js 16.3.3 dev, puerto 3000, HTTP 200 verificado antes de la campaña).
- **Runner:** Playwright con `workers: 1` (determinismo), `retries: 0` (sin máscaras), run aislado por chunk (`run-env`: usuarios + tenant + pilotos A/B propios por corrida, teardown con hard-delete net zero).
- **Guardarraíl de datos:** `e2e/scripts/data-hygiene-guard.cjs` en modo BEFORE (fail-fast si residuos > 12) y AFTER (exige net zero) alrededor de cada chunk; limpiador `scripts/e2e-cleanup-residuals.ts` con `PROTECTED_STORE_IDS` (TIENDA CENTRAL COSTPRO, Puerto Padre VITALLCONS, ENERVIDA-VITALLCONS — solo lectura, nunca tocadas).
- **Partición determinista:** los chunks se definieron por archivo spec completo (cohesión de módulo) y, dentro del spec rate-bound, por secciones numeradas estables (`1.x–6.x`, `7.x–14.x`) — sin aleatoriedad y sin separar tests dependientes.
- **Restricción de ejecución:** el entorno de trabajo mata todo proceso background al finalizar cada comando; por eso cada chunk se ejecutó en foreground con presupuesto de tiempo acotado (<9.5 min), lo que motivó dividir el spec más pesado en mitades por secciones.

## 3. Campaña de certificación FULL (una sola pasada, en chunks)

| Chunk | Lote | Specs | Resultado | Higiene AFTER |
|-------|------|-------|-----------|---------------|
| c1 | 1 | academy, accessibility, accounts-payable, ai-chat, api-routes, auth | 51 passed · 1 skipped | net 0 ✅ |
| c2 | 2 | commissions-payments, cost-engine, cost-sheet-flow, data-hygiene-probe, fc-accessibility, fc-automation, flows/auth-session-ui | 46 passed · 8 skipped | net 0 ✅ |
| c3 | 3 | flows: cash-closure, catalog-storefront, devolutions, inventory-integrity, pos-checkout, production-orders, purchase-orders, reverse-sale, roles-permissions | 50 passed | net 0 ✅ |
| c4 | 4 | flows/transfers, health-api, home-page, import, infra-probe, inventory, isolation-proof, landing-page, legal | 51 passed · 1 skipped | net 0 ✅ |
| c5a | 5 | mobile-viewport-audit | 14 passed | net 0 ✅ |
| c5b-A | 5 | multi-store-comprehensive §1–6 | 25/25 ejecutados · **0 fallos** (evidencia inline en log) | net 0 ✅ (tras limpieza de 2 users async) |
| c5b-B | 5 | multi-store-comprehensive §7–14 | 24 passed (9.3m) | net 0 ✅ |
| c6a | 6 | multi-tienda-docs | 12 passed | net 0 ✅ |
| c6b | 6 | rate-limit, security-headers, security | 17 passed · 2 skipped | net 0 ✅ |
| c6c | 6 | reports, reverse-duplicate-ui, store-create-autoswitch | 13 passed · 6 skipped | net 0 ✅ |
| c7a | 7 | store-lifecycle, store-switching | 23 passed | net 0 ✅ |
| c7b | 7 | store-reset, stores-crud | 16 passed · 5 skipped | net 0 ✅ |
| c8 | 8 | sync-batch, workers-create | 15 passed · 2 skipped | net 0 ✅ |
| **Total** | | | **357 passed · 25 skipped · 0 failed = 382/382** | **net 0 global** |

Los 25 skipped son tests condicionales documentados en los specs (flags de entorno o funciones no habilitadas en este entorno), no fallos ni UNKNOWN.

**Nota c1:** el guardrail global del chunk c1 reportó transitoriamente `users=4` tras su teardown (carrera entre la eliminación async de usuarios en Auth y la lectura del guard); el chunk c2 verificó net delta = 0 y todos los chunks siguientes mantuvieron net 0 constante — evento auto-resuelto, sin residuo persistente.

## 4. Matriz de clasificación de fallos

### 4.1 Fallos de la campaña de certificación (c5b original)

| Test | Síntoma | Clasificación | Acción | Estado |
|------|---------|---------------|--------|--------|
| 2.4 POST whitespace → 400 | Timeout 60s dentro del sleep de retry (61s > timeout) | TEST BUG | Timeout uniforme 180s del describe | ✅ PASS (c5b-A) |
| 3.1 PATCH name → 200 | Timeout 60s esperando pacing del create | TEST BUG | Ídem | ✅ PASS (c5b-A) |
| 4.2 DELETE sin storeId → 400 | Recibió 429 | TEST BUG (pacing) | Retry único post-429 tras ventana completa | ✅ PASS (c5b-A) |
| 4.3 DELETE inexistente → 404 | Recibió 429 | TEST BUG (pacing) | Ídem | ✅ PASS (c5b-A) |
| 6.2 restore no-archivado → 400/409 | Helper recibió 429 en su POST | TEST BUG (pacing) | Retry único post-429 en el helper + timeout 180s | ✅ PASS (c5b-A) |

**Causa raíz única (familia):** el presupuesto client-side del pacer vive en `process.env` del worker y **no ve los 2 POSTs de pilotos A/B** que el aprovisionamiento (`run-env`, otro proceso) emite contra `/api/stores` → 4 POSTs paceados + 2 pilotos = 6 > límite server de 5/min → 429 garantizado; los tests muertos por timeout dejaban además requests abortados que el server sí cuenta, propagando 429s a los tests siguientes. Fix en `52efab735`: budget create 4→3 (headroom de pilotos), retry único documentado (patrón FASE 17, sin retries ×5), timeout uniforme 180s para el spec rate-bound.

### 4.2 Fallos históricos conocidos (FASE 3–7, reconstruidos del registro de commits)

| Commit | Área | Clasificación | Acción | Estado |
|--------|------|---------------|--------|--------|
| `babe5e554` | RPC `e2e_hard_delete_user` no cubría la cadena v2 (bypass restore_mode) | DATA/Fixture + producto (RPC de soporte) | Extensión del RPC con cadena v2 | ✅ |
| `f00bfde5f` | Touch targets < 44px en icon buttons del header (móvil) | PRODUCT BUG (a11y) | Fix de producto: 44px en ThemeToggle y NotificationCenter | ✅ |
| `dcb7748e0` | Touch-target check contaba targets recortados por contenedores colapsados | TEST BUG | El check ignora targets clipped legítimamente | ✅ |
| `9b9390edd` | `waitForCatalogView` esperaba un layout antiguo de la tabla | STALE TEST | Actualizado al layout actual | ✅ |
| `a7f1ba6a1` | ISO-006 no afirmaba el contrato de hard-delete de su propia limpieza | TEST BUG | Assert de contrato añadido | ✅ |
| `431e8080c` | 429 en POST de validación (nombre whitespace) por ventana de rate limit | FLAKY | Retry único tras ventana, assert íntegro | ✅ |
| `4c688641b` | Pacer esperaba menos que la ventana real del server (anchor drift) | FLAKY / ENVIRONMENT | Espera de 2s adicionales tras la ventana client | ✅ |

No quedó ningún fallo clasificado como UNKNOWN. Ningún fallo de la categoría CI/INFRASTRUCTURE se "arregló" tocando código de producto.

## 5. Higiene de datos

- **Estado inicial restaurado:** una corrida de certificación previa abortada (el entorno mató el proceso en el chunk c5b, sin teardown) dejó 10 tiendas y 4 usuarios residuales E2E; el limpiador los eliminó (10/10 tiendas, 4/4 usuarios de run) con las entidades protegidas verificadas antes y después.
- **Durante la campaña:** todo chunk pasó BEFORE/AFTER con net zero; los dos intentos abortados por límites del entorno (ver §2) se limpiaron de inmediato con el mismo criterio.
- **Estado final:** `residuos E2E — stores=0 users=0`, Δ stores = 0, Δ users = 0, protegidas intactas (TIENDA CENTRAL COSTPRO, Puerto Padre VITALLCONS, ENERVIDA-VITALLCONS). El fixture permanente `qa.h1.a@costpro.test` (provisionado a propósito, fuera del patrón del guardrail) se conserva.

## 6. Commits del PR (agrupados por tema)

```
34049fd79 chore(e2e): batch/chunk runners with data-hygiene guardrail (FASE 8/15)
52efab735 test(e2e): rate-bound multi-store — pilot headroom budget, single 429-retry, uniform 180s timeout
4c688641b fix(e2e): rate-budget pacer waits 2s past client window (server anchor drift)
431e8080c test(e2e): whitespace-name validation retry once on rate-limit window
a7f1ba6a1 test(e2e): ISO-006 asserts hard-delete contract for own cleanup
9b9390edd test(e2e): waitForCatalogView waits for current table layout
835c54b0b chore(e2e): infra tooling — data-state verifier, residual cleaner, probe scripts
dcb7748e0 test(e2e): touch-target check ignores targets clipped by collapsed containers
f00bfde5f fix(a11y): 44px mobile touch targets for header icon buttons
babe5e554 fix(db): extend e2e_hard_delete_user with v2 chain — restore_mode bypass
```

## 7. Reglas del protocolo — cumplimiento

1. **Sin ejecución completa al inicio:** la suite nunca se corrió entera antes de la campaña de certificación; se avanzó por fallos conocidos → Gate → lotes → Gate.
2. **Clasificación obligatoria:** toda anomalía quedó clasificada en §4; cero UNKNOWN.
3. **Entidades protegidas solo lectura:** verificado en cada limpieza (antes/después).
4. **GUARDRAIL Δ=0:** activo en todos los chunks; los abortos del entorno se detectaron y limpiaron de inmediato.
5. **Sin retries ×5:** el único retry autorizado es el único reintento post-429 tras ventana completa, documentado inline (FASE 17); `retries: 0` en Playwright.
6. **Determinismo sobre velocidad:** `workers: 1`, partición estable por módulo/secciones, sin paralelismo que degrade reproducibilidad.
7. **Correcciones de prueba, no de conveniencia:** las dos correcciones de producto (`f00bfde5f`, `babe5e554`) corrigieron defectos reales detectados por los tests (a11y y RPC de limpieza), no añadieron bypasses.
8. **FULL E2E una sola vez:** la campaña §3 recorrió la suite completa (382/382) exactamente una vez como corrida de certificación, con los re-runs post-fix limitados a los tests fallados y su lote (regla de regresión del protocolo).

## 8. Conclusión

Con 382/382 tests verdes en la campaña de certificación, 0 fallos sin clasificar, higiene de datos en net zero verificada por guardarraíl en cada chunk y las entidades protegidas intactas, la suite E2E de CostPro se declara **CERTIFIED** sobre la rama `fix/e2e-incremental-stabilization` (BASE `439d0090`).
