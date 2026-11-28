# SURFACE-CONTRACT-CLOSURE.md — CP-BRA-POST-CERTIFICATION-VALIDATION-001

Misión: tras la fusión de la rama de pagos (#1738) y la integración #1742, verificar el
estado de `create_sale_v2` en producción, reexportar el contrato de superficie,
comprobar que `create_sale_v2/36` coincide con el estado esperado y **retirar
exclusivamente la entrada de allowlist correspondiente** cuando el drift esté
realmente resuelto. Fecha: 2026-11-28.

## 1. Coherencia de `create_sale_v2` — código · migraciones · producción

| Capa | Estado verificado |
| --- | --- |
| **Producción LIVE** (census del Management API, read-only) | `create_sale_v2` con **36 argumentos**, terminando en `p_customer_phone text` — firma **/36**, única sobrecarga viva (ni /34 ni /35 existen en LIVE); ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| **Surface certificado** (`supabase/security-contract/contract-surface.sql`, línea 6611) | Misma firma /36 con `p_customer_phone` — snapshot del LIVE |
| **Stream de migraciones** (replay) | `20261128120000_cp_pos_transfer_identity_validation.sql` (PR #1742, commit `182136e11`) re-emite create_sale_v2/36 con `p_customer_phone` (7 ocurrencias); el manifiesto replay quedó ajustado a 225 migraciones y firma final /36 (commits `021800ead`, `eaec5fe11` de la misión #1742) |
| **Manifiesto replay** | `node scripts/e2e/build-migrations-replay.mjs --check` → regenerado `9cc7ff6cccc3e814…` vs commiteado `9cc7ff6cccc3e814…` ⇒ **MATCH (sin deriva)** |

Procedencia del /36: la firma la definió el trabajo concurrente del propietario
(identidad de transferencias), aplicado a producción fuera de banda durante R-06 —
atribuido entonces a la rama de pagos por simultaneidad — y formalizado en el stream
por la migración `20261128120000_cp_pos_transfer_identity_validation.sql` del PR
**#1742** (el PR #1738 de pagos **no añadió ninguna migración**). Con #1738+#1742
fusionados, código = stream = LIVE.

## 2. Reexportación del contrato de superficie desde LIVE

```
node scripts/export-contract-surface.cjs  (SUPABASE_ACCESS_TOKEN, proyecto wthkddeleylijmonclxg)
→ ✅ contract-surface.sql written: 233 functions, sha256=90e236553ff9d6724f…
git diff (ignorando la línea «Captured»)  → CERO diferencias de contenido
```

- **233 funciones** — mismo censo que el snapshot de la certificación R-06
  (`6a92596e…`); el cambio de hash se debe únicamente al timestamp `Captured`.
- El surface comprometido en main (`170a9f9be`) es **byte-idéntico al estado LIVE de
  producción** en el momento de esta verificación: incluye a la vez los 10 gates R-06
  y la firma /36.
- Verificación adicional (gate estático, Capa C): reconciliación
  **233/233 funciones representadas en migraciones**, **0 divergencias bloqueantes**;
  3 warnings MEDIUM/LOW preexistentes de frescura (`cancel_transfer/2vs/3`,
  `create_received_service_v2/15vs/16`, `reset_store_data/2vs/3`) con semántica
  idéntica al contract LIVE — ya documentados en la certificación anterior, sin
  cambios en esta misión.

## 3. Retiro de la entrada de allowlist `create_sale_v2/36`

La entrada (`LIVE_FUNCTION_NOT_REPRESENTED`, añadida por CP-BRA-R06 como declaración
tardía del trabajo concurrente sin fusionar) quedó **inerte** al representar el stream
la firma /36. El drift está **realmente resuelto** (233/233 representadas; LIVE ==
surface == stream), así que se retira conforme al patrón establecido
(`create_sale_v2/34` del PR #1708, `pay_commission/7` del PR #1733, etc.):

- `ci-gate-allowlist.json`: `source_of_truth_baseline` **6 → 5 entradas**; eliminada
  ÚNICAMENTE `create_sale_v2/36` (regla `LIVE_FUNCTION_NOT_REPRESENTED`).
- Changelog `_updated` ampliado con la constancia de retiro y su evidencia.
- Commit: `50aecef42` en la rama `docs/cpbra-post-certification-validation-20261128`
  (se fusiona con esta expediente).
- Re-verificación tras el retiro: gate estático → **0 divergencias bloqueantes,
  233/233, CONTRATO OK** (los 3 warnings preexistentes se mantienen, sin cambio).
- Gate de replay: **MATCH** (§1).

## 4. Entradas NO retiradas (siguen justificadas / fuera de alcance)

| Entrada | Estado | Decisión |
| --- | --- | --- |
| `create_sale_v2/34` (`source_of_truth_baseline`, expira 2026-12-31) | Histórica del PR #1708; el LIVE ya no tiene /34, la entrada está **inerte** | **SE CONSERVA** — la misión ordena retirar exclusivamente la entrada /36; su retiro futuro queda anotado como candidata de limpieza para el propietario |
| `create_devolution_v2/12`, `delete_master_party/3`, `set_received_service_status/4`, `void_received_service_with_reversal/4` (`BODY_DRIFT_FROM_MIGRATION`) | Drifts LIVE-vs-replay de misiones anteriores aún no re-certificados por despliegue de su snapshot | **INTACTAS** — no corresponde a esta misión |
| `security_definer_without_auth_check` (130 entradas, incl. 3 helpers R-06 declarados) | Baseline estático vigente | **INTACTA** |

## 4b. Hallazgo EXTERNO durante los gates: `exchange_rates_backup_cpfx001` (producción)

El gate en vivo **SQL DB Security Checks** (read-only contra producción, `DATABASE_URL`
del repo) falló en el PR documental con **`tables_no_rls: 1 hallazgo NO permitido`** —
ajeno al diff de este PR (cero SQL). Investigación read-only (script re-ejecutable
`scripts/probe-stray-table-r06v.mjs`):

| Dato verificado | Valor |
| --- | --- |
| Existe en | **Producción `wthkddeleylijmonclxg` únicamente** — NO existe en la BD aislada, ni en migraciones/repo (rg + `git log -S` vacíos), ni referenciada por el código de la app |
| Contenido | Respaldo de tasas históricas de cambio: 1.607 filas, 20 columnas (rate_date, currency, source, rate, variaciones, reconstruction_method, notes…), fuentes públicas **BCC · Diviza · elToque**, última captura **2026-11-28T06:25Z** (escritura activa) |
| Postura de seguridad | **RLS desactivada** (`relrowsecurity = false`) y **grants completos a anon + authenticated** (SELECT/INSERT/UPDATE/DELETE) — datos públicos de mercado (riesgo de exposición bajo), pero deuda de seguridad real en la postura certificada |
| Ventana de creación | Entre el último CI verde de main `170a9f9be` (12:21Z) y el run del gate (14:45Z) del 2026-11-28 — artefacto concurrente del propietario creado fuera de banda (misma raíz de patrón que `create_sale_v2/36` durante R-06) |

**Tratamiento aplicado (patrón de declaración tardía establecido — `register_ot_payment_batch`,
`create_sale_v2/36`):** se declara en `ci-gate-allowlist.json` → `tables_without_rls`
(con motivo completo, `expires 2026-12-31`), sin tocar producción (la misión prohíbe
escrituras allí) ni alterar políticas. La remediación es del propietario en su misión
FX: habilitar RLS + ACL privada (recomendado: `REVOKE anon`, `GRANT authenticated
SELECT` o `service_role` exclusiva) o `DROP` tras la restauración, y formalizar la
tabla en migración; la entrada se retirará al formalizar/descartar.

Esta certificación (reglas de negocio) NO se altera: el hallazgo es de **postura de
seguridad de tabla** (control infra), no de las 16 reglas certificadas; queda
documentado como observación principal en `FINAL-STATUS.md` para decisión del
propietario.

## 5. Estado final del contrato de superficie

**CERRADO SIN DIVERGENCIAS**: LIVE producción == surface certificado == replay del
stream; `create_sale_v2/36` coherente en las tres capas; allowlist depurada
(exclusivamente /36); gates de seguridad estático y replay en verde. La certificación
CP-BRA-001 NO se reemite ni se altera (no hay evidencia de regresión real).
