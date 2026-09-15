# REM-INV-5 — Informe Final: SECURITY REGRESSION PERMANENCE + HYGIENE + CONCURRENCY HARDENING

**Baseline:** `31ebd4b9` · **Proyecto:** CostPro/Multi-Tienda · **Fecha:** 2026-09-15
**Producción:** Supabase `wthkddeleylijmonclxg` — READ ONLY durante diagnóstico; única
excepción autorizada: 1 migración DDL (CREATE OR REPLACE FUNCTION) tras aprobar staging,
contrato, regresión, secret scan y precondiciones.

---

## Respuestas explícitas (§27)

**1. ¿`security-contract-test.cjs` quedó realmente integrado a CI?**
SÍ — mediante `scripts/security-contract-test-static.cjs`, un gate estático CI-safe de dos
capas que reproduce fielmente el contract LIVE (que requiere `SUPABASE_ACCESS_TOKEN` y por
restricción del ticket NO puede entrar a CI). El paso "Security contract (static, CI-safe)"
fue añadido al job `security` del workflow existente `.github/workflows/ci.yml` (sin
duplicar workflows, sin secrets). El contract LIVE queda intacto para ejecución manual
con credenciales.

**2. ¿CI falla si el security contract falla?**
SÍ, demostrado: (a) inyección controlada de una función SECURITY DEFINER vulnerable en
migraciones → exit 1 y BUILD BLOQUEADO (función detectada `ci_validation_vulnerable_fn/2`,
CRITICAL+HIGH); (b) tamper del snapshot Capa A → exit 1; restaurados ambos → exit 0.
CRITICAL/HIGH siempre bloquean; no hay `continue-on-error`; los warnings MEDIUM/LOW
conservan la semántica del contract LIVE original.

**3. ¿Los 134 checks siguen pasando?**
SÍ — LIVE: 134/134 PRE y POST (evidencias 16/17). Capa A estática: 134/134, 0 violaciones.

**4. ¿Qué garantías permanentes quedan protegidas por CI?**
Las 4 reglas + pin sobre las 134 funciones SECURITY DEFINER de escritura:
anti-spoofing guard V2.12.9 (`auth.role()='service_role'`), patrones fail-open
(IS NOT NULL AND NOT / THEN), anon EXECUTE en funciones de negocio, SET search_path
explícito, y el pin REM-INV-2R (receive_purchase(uuid) no reintroducida). Cualquier PR
que introduzca una violación nueva bloquea el build.

**5. ¿El PAT/documentary fragment quedó eliminado de `docs/`?**
SÍ — `docs/ITERATION_8_FINAL_HANDOFF.md:20` y `docs/ITERATION_8_FREEZE.md:18`:
`sbp_b3e5db...` → `[sbp_*** REDACTADO (REM-INV-5)] ***` (significado documental preservado).

**6. ¿Había un secreto real o solamente un fragmento truncado?**
SOLO un fragmento truncado: 13 chars con elipsis literal (`sbp_b3e5db...`), no
autenticable. Scan final repo completo: 0 REAL_SECRET (174 hits clasificados:
placeholders, fragmentos históricos de evidence packs —no alterados—, falsos positivos
de lecturas env/template literals).

**7. ¿Se encontró evidencia de exposición de un token completo?**
NO — ni en working tree ni en el scan de contenido; en git history el fragmento truncado
solo fue introducido en `418f04a0`. No procede rotación; NO se reescribió history.

**8. ¿`create_store_with_membership` tenía una carrera reproducible?**
SÍ — reproducida sin ninguna duda: C2 (8 llamadas concurrentes, mismo tenant, max=1)
creó **6/2/6 tiendas** en 3 rondas naturales; C3 (carrera determinista con interleaving
forzado) persistió **2 tiendas con max=1**.

**9. ¿Qué condición exacta generaba la carrera?**
TOCTOU sobre el invariante "active stores del tenant < p_max_stores": el
`SELECT COUNT(*)` y el `INSERT INTO stores` no estaban serializados; en READ COMMITTED
dos sesiones concurrentes observan el mismo pre-count y ambas insertan. Los UNIQUE
existentes (name-active, slug) solo impiden duplicar el MISMO nombre — con nombres
distintos la carrera queda abierta. No existe constraint expresable para "count < max".

**10. ¿Por qué el advisory lock es la solución correcta?**
Serializa check+insert como unidad transaccional sobre el recurso lógico exacto (el
conteo por tenant), siguiendo la convención ya establecida del codebase
(`pg_advisory_xact_lock(hashtext('<prefijo>:' || id))` en transfers/vales/pagos/
producciones). El re-check dentro del lock ve el commit del primero → ERR_STORE_LIMIT_REACHED.
Un UNIQUE no puede expresar la regla agregada; no hay dependencia de aplicación.

**11. ¿Cuál es la granularidad del lock?**
Por tenant: `pg_advisory_xact_lock(hashtext('tenant_stores:' || v_tenant::text))`,
namespaced para evitar colisiones con las demás claves hashtext del repo.

**12. ¿Existe riesgo de deadlock?**
No demostrado: un único lock por transacción, adquirido una vez, sin otra adquisición
en orden distinto; ninguna otra función usa claves 'tenant_stores:'; el RPC es standalone.

**13. ¿Existe impacto de throughput?**
Mínimo: solo serializa creación concurrente de stores del MISMO tenant (operación
administrativa rara). C4: cross-tenant en paralelo sin degradación (3ms paralelo vs 2ms
secuencial en staging). Liberación automática al COMMIT/ROLLBACK.

**14. ¿La prueba concurrente PRE falla?**
SÍ — exactamente como predice la hipótesis (14: C2 6/2/6; C3 2 tiendas; evidencia 11).

**15. ¿La prueba concurrente POST pasa?**
SÍ — 10/10 casos con el resultado esperado (evidencia 14): C2 = 1 creada + 7
ERR_STORE_LIMIT_REACHED en las 3 rondas; C3 = RACE CLOSED con 1 sola tienda.

**16. ¿Los casos legítimos continúan pasando?**
SÍ — C1/C4/C5/C6/C7/C8 idénticos PRE→POST (evidencia 15); firma/ACL del RPC sin cambios
→ el único caller (API route admin, service_role) intacto; tsc 0 errores.

**17. ¿El security-contract sigue 134/134?**
SÍ — LIVE PRE y POST (16/17); estático Capa A 134/134; el contrato NO se redujo.

**18. ¿Producción sufrió exclusivamente los cambios previstos?**
SÍ — catalog diff de 484 funciones: **changed=1** (cuerpo del target,
da512cbc…→a6477c1b…), added=0, removed=0, ACL/secdef/owner/search_path intactos
(evidencia 20). HTTP 201, 1 transacción.

**19. ¿Zero-touch fue demostrado?**
SÍ — 15 tablas de negocio (devolutions, transactions, payment_transactions,
stock_movements, inventory, audit_logs, business_events, purchase_orders, receipts,
transfers, inventory_adjustments, products, stores, user_store_memberships, profiles):
rows + max(created_at) PRE==POST → **15/15 IDENTICAL** (evidencia 21).

**20. ¿Git terminó limpio y sincronizado?**
Ver 24-final-verification.txt y 22-ci-final-verification.txt (estado final tras
commit/push: HEAD == origin/main, WORKTREE CLEAN).

**21. Estado final:** CERTIFIED — PERMANENT SECURITY REGRESSION
(CI integrado y demostrado bloqueante; higiene cerrada; carrera demostrada y corregida
con re-attack POST; staging/producción/zero-touch/regresiones/evidencia/git closure OK).

**22. Residuales fuera de alcance (documentados, no corregidos):**
- RES-5-1 (informativo): 62 funciones LIVE del contract no existen en el stream de
  migraciones (drift estructural pre-existente; fixes out-of-band históricos). La Capa A
  del CI gate mitiga su riesgo de regresión; la normalización del stream (sync-migration)
  fue evaluada y RECHAZADA en este ticket (md5 churn en producción). Candidata a gate futuro.
- RES-5-2 (informativo): el DCL de REM-INV-4C sigue sin migración capturada; misma
  candidate-sync que RES-5-1.
- RES-5-3 (informativo): `scripts/apply-sql-migration.js:10` contiene ilustración de
  formato `SUPABASE_ACCESS_TOKEN=sbp_...` (falso positivo seguro, fuera de docs/).
- RES-5-4 (pre-existente): build local con OOM del host (exit 137) — limitación de
  infraestructura conocida, no oculta.

## Verificación previa a producción (Gate N)
Staging PG17.6 fidelidad md5/ACL/constraints PASS · contrato 134/134 · tsc/vitest/lint
delta 0 · secret scan REAL_SECRET=0 · migración revisada (delta exacto 5 líneas,
reversible) · fingerprint PRE == fingerprint 4C (484 funciones) · drift concurrente 0.

## Cadena de certificación
REM-INV-4A/4A-R → 4B → 4C (`31ebd4b9`) → **REM-INV-5**: los hardenings de seguridad ya
no dependen de la memoria del auditor: CI los re-ejecuta en cada PR de forma permanente.

Apéndice — salida del gate estático al cierre:
exit=0
════════════════════════════════════════════════════════════════════════════════
🎉 CONTRATO OK — Capa A: 134/134 · Capa B: 86 verificadas, 9 baseline, 0 nuevas
════════════════════════════════════════════════════════════════════════════════
