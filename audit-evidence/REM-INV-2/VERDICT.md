# REM-INV-2 — GATE REVIEW Y VEREDICTO FINAL

## PHASE 15 — PRE-RETIREMENT REVIEW (antes de modificar código)

| Campo | Evaluación |
|---|---|
| Candidate | `public.receive_purchase(p_purchase_id uuid)` (SECURITY INVOKER, prod) |
| Direct callers (app) | **0** — 04-static-reachability S1–S13, S18 |
| Indirect callers | **0** — no hay wrappers, RPC maps, offline, replay, flags, dynamic imports que la alcancen |
| Dynamic callers | **0** — 3 handlers reales interceptados; `receive_purchase` 0 invocaciones (05) |
| Callers internos DB | **0** — prosrc exacto, triggers ∅, pg_depend ∅ (01) |
| Datos que consume | `purchase_items` (legacy): **0 filas**; sin políticas INSERT/UPDATE para authenticated → no poblatable vía app |
| V2/canonical replacement | **EXISTE y demostrado**: `receive_against_po` → `register_reception` (+ `confirm_pending_reception`), ESCENARIO B (equivalente canónico, no denominada `_v2`) — 03 |
| Parity | **16/16 V2 ≥ V1** (14 superiores, 2 iguales) — 14 |
| Security de la migración | retiro no abre caminos inseguros: la única superficie es EXECUTE directo (S17), cerrada por REVOKE diferido con guard |
| Offline/replay | correcto por diseño existente + pin dinámico (W2) |
| Tests | 0 tests dependen de la V1; pin permanente añadido (4 casos) |
| DB dependencies | **0** (funciones, triggers, vistas, reglas) |
| Riesgo residual | P2 (pre-existente, no introducido por el gate): EXECUTE a `authenticated` permite **status-flip directo de OC** (draft/sent/cancelled → `received`, sin stock pues `purchase_items` vacío; RLS SECURITY INVOKER limita a OCs de tiendas del caller) — cierre preparado en assets/deferred-db-remediation.sql |
| **Recommendation** | **SAFE TO RETIRE** (capa aplicación ya muerta; REVOKE+DROP diferidos a canal DDL autorizado) |

### Criterios de autorización del protocolo (evaluados)

| Criterio | Estado |
|---|---|
| Candidate DEAD | ✅ aplicación+DB+datos (direct-EXECUTE residual declarado y tratado) |
| V2 superior/equivalente demostrada | ✅ 16/16 |
| 0 active/dynamic/offline/replay callers | ✅ |
| 0 internal dependencies | ✅ |
| Security PASS | ✅ (sin cambios ejecutados; residual documentado con cierre preparado) |
| Regression PASS | ✅ (29/29, tsc 0, eslint 0 errors, vitest 2068/24/0; build OOM = infra pre-existente) |

### Acciones de retiro ejecutadas (PHASE 16 — quirúrgicas, mínimas)

- Migración de callers: **vacía por evidencia** (0 callers). Cualquier "limpieza oportunista" fue descartada.
- Único cambio de código: instrumento permanente de regresión dinámica (4 pins). Cero toques a negocio/WAC/otras RPC.
- DB REVOKE EXECUTE + DROP: **DEFERIDOS** con guard de dependencias (assets/deferred-db-remediation.sql) — requiere canal DDL autorizado; precedente idéntico: REM-V2-3 (`90dce25f`) difirió los DROP de `reverse_receipt`/`reverse_adjustment` por la misma limitación externa. **No se ejecutó ninguna operación DDL/ACL contra producción.**

## Respuestas obligatorias del protocolo

1. ¿Existe ruta V2/canónica de recepción de compras? **SÍ** — familia `register_reception` / `receive_against_po` / `confirm_pending_reception` (03). Demostrada por definiciones de prod + callers activos + interceptación dinámica + datos (63 receipts; 4 vinculadas a PO).
2. ¿`NEXT_PUBLIC_USE_V2_REVERSE=true` prueba recepción V2? **NO** — declarado expresamente en 03 §4; la demostración se hizo independiente de las flags.
3. ¿Se confundió REVERSE V2 con PURCHASE RECEPTION V2? **NO** — el mapa de dominios (checkout/reverse/reception) está explícito en 03 §1.

## SALIDA FINAL OBLIGATORIA

```text
BASELINE:
90dce25f

V2 CHECKOUT:
true

V2 REVERSE:
true

PURCHASE RECEPTION V2:
FOUND

CANONICAL RECEPTION PATH:
receive_against_po (PO flow, SECURITY DEFINER, FOR UPDATE, over-receive guard, audit_logs 'po_received')
  → register_reception (auth.uid(), has_store_access_as, B2-B5/C1 validations, fn_recalc_wac, receipts/receipt_items)
  [+ confirm_pending_reception para el ciclo pending→active; void_reception_with_reversal para anulación]

receive_purchase V1:
DEAD-BUT-REACHABLE → retiro de aplicación certificado (0 callers); EXECUTE directo residual con REVOKE diferido (sin canal DDL)
Estado operativo final: DEAD (application layer) / RETIRED (de facto) con superficie ACL residual documentada

F-01:
FIXED (funcionalmente — la ruta ejecutable de recepción es la canónica con guards; V1 inalcanzable por cualquier camino de la app; defecto certificado como contenido en el binario V1 pendiente de REVOKE/DROP)

DOUBLE RECEPTION:
V1: FAIL (reproducido) · CANÓNICA: PASS (status guard + over-receive + FOR UPDATE) · RETIRO: PASS

STATUS GUARD:
V1: FAIL (reproducido) · CANÓNICA: PASS · RETIRO: PASS

STORE ISOLATION:
V1: FAIL (reproducido) · CANÓNICA: PASS · RETIRO: PASS

AUTHORIZATION:
V1: FAIL (reproducido) · CANÓNICA: PASS · RETIRO: PASS

WAC:
V1: FAIL (jamás actualiza) · CANÓNICA: PASS (fn_recalc_wac, W62-01) · RETIRO: PASS

ATOMICITY:
V1: PASS · CANÓNICA: PASS · RETIRO: PASS

IDEMPOTENCY:
V1: FAIL (×N aplica ×N) · CANÓNICA: PASS · RETIRO: PASS

CONCURRENCY:
V1: FAIL (double stock) · CANÓNICA: PASS · RETIRO: PASS

REGRESSION:
PASS (contract 29/29 · tsc 0 · eslint 0 errors · vitest 2068/24/0 · build OOM=infra pre-existente documentada)

PRODUCTION ZERO-TOUCH:
PASS (fingerprints bitwise identical, sha256 canónico c17762aa…)

SECURITY:
PASS (0 secretos; sin cambios ACL/RLS ejecutados; REVOKE diferido con guard)

EVIDENCE:
PASS (20 archivos + assets; SHA256SUMS bidireccional verificado)

GIT:
PASS (commit+push verificados en remoto; worktree clean; reset survival PASS — ver 18-git-closure.md)

FINAL VERDICT:
CONDITIONAL
```

## Justificación del veredicto CONDITIONAL

**F-01 queda resuelto funcionalmente**: la ruta ejecutable de recepción de compras es íntegramente la canónica (demostración estática + dinámica), que bloquea doble recepción y cumple los 16 controles; `receive_purchase` V1 está muerta en la capa de aplicación (0 callers de cualquier naturaleza) y este gate certificó el retiro a ese nivel.

**Limitación no crítica documentada (la única)**: la superficie residual `EXECUTE → authenticated` no pudo revocarse porque produciría una mutación ACL en producción (REVOKE es DDL), prohibida por el zero-touch de este gate y sin canal DDL autorizado — limitación **externa** idéntica a la ya aceptada en REM-V2-3. El riesgo residual está acotado (status-flip de OC vía llamada directa, sin stock, sin WAC, limitado por RLS a tiendas del caller; double-reception de stock NO triggerable: `purchase_items` vacía y no-poblatable) y su cierre queda preparado y guardado (`assets/deferred-db-remediation.sql`) para el gate DDL futuro.

**No existe P0/P1 residual introducido por este gate.** No se parcheó `receive_purchase` automáticamente (regla del protocolo: no hay V2 que parchear; hay retiro de ruta muerta). No se ejecutaron F-02…F-08 ni ningún otro finding (regla final respetada).

Limitación conocida adicional (infraestructura, no del gate): build OOM exit 137, pre-existente y documentado en 15.
