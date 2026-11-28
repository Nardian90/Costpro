# CP-FIN-REM-001 — REMEDIACIÓN DE LA REVISIÓN FINANCIERA INDEPENDIENTE (F1–F7) · PR-A

**Misión:** CP-FIN-REM-001 · **PR-A:** `fix/cp-fin-hardening-f2-f5` · **Fecha:** 2026-11-28
**Repositorio:** Nardian90/Costpro · **Rama base:** `main` @ `170a9f9be` (2026-11-28)
**SHA de referencia de la misión original:** `3916809` (2026-11-22) — main avanzó; se usa el SHA vigente y se reporta (regla 3.1).
**Producción:** CostproBD (`wthkddeleylijmonclxg`) — SOLO LECTURA (compuertas G1/G2/G3 NO recibidas).
**Pruebas aisladas:** CostproE2E (`lguovmvrozxgssupkwpf`) — batería de contrato transaccional (BEGIN…ROLLBACK, cero residuos).

---

## 1. Alcance de este documento

Remediación F2, F3, F4, F5 y freno de TRUNCATE (PR-A, desarrollo y pruebas en BD aislada; **aplicación en producción PENDIENTE de la compuerta G1**). F1 (monitor, instrumentación, causa raíz operativa e informe de impacto) es PR-B y NO se desarrolló en esta fase por la regla de orden de la misión («termina y entrega PR-A completo ANTES de empezar PR-B»); la REVALIDACIÓN de F1 (mediciones en vivo) y la resolución de UUIDs completos de las tiendas sí se hizo y se documenta aquí.

## 2. Entorno y estado inicial (T0 — revalidación en vivo)

- Expediente: `audit-evidence/CP-FIN-REVIEW-001/` (creado por T0 el 2026-11-23 en esta misma rama; revalidado el 2026-11-28 con `revalida-20261128-*`).
- Estado del repo en main: 0 coincidencias de `fin_coverage_report`, `ERR_FIN_INMUTABLE`, `CP-FIN-REVIEW-001` (confirmado con greps acotados a `supabase/ src/ scripts/ docs/`).
- **La rama `fix/cp-fin-hardening-f2-f5` EXISTÍA** con 1 commit (T0 expediente, 2026-11-23, solo lectura) — nunca continuada ni con PR. Se rebasó sobre main vigente y se continuó aquí.
- Libro de migraciones (producción, [MEDIDO 2026-11-28]): 79 filas; última aplicación `20261121200100` (2026-11-21 16:22 UTC, `management_api`). **34 migraciones del repo posteriores a esa entrada NO están registradas; 27 verificadas APLICADAS por marcador de catálogo en vivo** (script `cp-fin-ledger-gap.mjs`, salida `revalida-20261128-ledger-gap.json`); 6 sin marcador distintivo (ACL/ALTER), de las cuales varias tienen evidencia documental de aplicación (§11g del worklog: R-03, §0.2, FASE 4, R-15, transfer identity). **Hueco de gobierno N1 confirmado y AMPLIADO.**
- Conteos generales [MEDIDO 2026-11-28]: asientos 4 423; tiendas 7; funciones SECURITY DEFINER en public 406; tablas públicas sin RLS **1** (`exchange_rates_backup_cpfx001`, artefacto de respaldo de una misión FX — hallazgo nuevo reportado; el revisor había medido 0); productos sin costo 0/453 (cost_average NULL o ≤0: 0; cost_price NULL: 0).

## 3. Hallazgos revalidados en vivo (2026-11-28) — tabla archivo:línea

Detalle fila a fila en `audit-evidence/CP-FIN-REVIEW-001/findings-file-line.md` (T0, 2026-11-23, con evidencia EN VIVO). Revalidación 2026-11-28: **todos los hallazgos F2, F3, F4, F5 y TR siguen presentes** (policies/triggers/prosrc en `revalida-20261128-policies.json`, `revalida-20261128-triggers-fin.json`, `revalida-20261128-rpc-pattern.json`):

| Hallazgo | Estado 2026-11-28 | Migración que lo corrige |
|---|---|---|
| F2 lecturas amplias (4 tablas + 6 RPC con `has_store_access_as` y patrón `v_caller IS NOT NULL AND NOT`) | PRESENTE | `20261128153000` (tablas) + `20261128153100` (RPC) |
| F3 reglas globales reasignables (USING permisivo, sin trigger de ámbito) | PRESENTE | `20261128153200` |
| F4 libro sin inmutabilidad (solo trigger INSERT de generación) | PRESENTE | `20261128153300` |
| F5 residual en moneda original (4 × `sum(m.amount)`) y T12 sin filtro de generación | PRESENTE | `20261128153400` |
| TR freno de TRUNCATE: 34 tablas, 0 de fin_*/nómina | PRESENTE | `20261128153500` |
| F1 cobertura: 282/1 023 ventas completadas sin asiento en generación activa; 0 filas en `fin_posting_errors` | PRESENTE (deriva leve del total: 1 013→1 023; las 10 nuevas ventas de los últimos días SÍ contabilizadas: 5 completadas en 72 h, 5 con asiento activo) | PR-B (pendiente) |
| F6 aperturas sin movimientos; F7 72,8 % superseded | documentación | documentación (§9.2/9.3) |

## 4. Qué hace cada migración (resumen técnico)

1. **`20261128153000` (F2 tablas)** — SELECT de `fin_entries`, `fin_movements`, `fin_opening_balances` pasa a `is_admin() OR has_store_role(store_id, ARRAY['admin','manager','encargado'])` (espejo de `can_manage_store_as`). `fin_posting_errors` SELECT/UPDATE: filas globales SOLO `is_admin()`; filas de tienda: gestión (SELECT) / admin de tienda (UPDATE). Guard fail-closed contra deriva (verifica el estado previo); postcheck de 5 políticas.
2. **`20261128153100` (F2 RPC)** — las 6 `fin_get_*`: `v_caller` = `p_user_id` para service_role (obligatorio, NULL → `ERR_UNAUTHORIZED`) y `auth.uid()` para authenticated; gate INCONDICIONAL `is_admin_check(v_caller) OR can_manage_store_as(v_caller, p_store_id)`. Firmas y resultados intactos; regeneradas desde las definiciones VIVAS (`pg_get_functiondef`) con transformación quirúrgica verificada. ACL intacto (4 ejecutables por authenticated+service_role; `fin_get_category_detail`/`fin_get_reconciliation` solo service_role; `can_manage_store_as` NO se concede a authenticated).
3. **`20261128153200` (F3)** — política UPDATE de `fin_rule_versions` con USING = WITH CHECK estrictos (global→`is_admin()`; tienda→`has_store_role(admin)`); trigger BEFORE UPDATE `fin_rule_scope_immutable` que bloquea `NEW.store_id IS DISTINCT FROM OLD.store_id` (`ERR_FIN_RULE_SCOPE_IMMUTABLE`), ENABLE ALWAYS.
4. **`20261128153300` (F4)** — triggers ENABLE ALWAYS en `fin_entries`/`fin_movements`: DELETE de asientos bloqueado SIEMPRE; UPDATE de asientos solo (A) posted→reversed con contraasiento enlazado ya insertado, (B) relleno de generation_id NULL→generación ACTIVA de la misma tienda, (C) reparación controlada de `movements_snapshot`/`description`; UPDATE de movimientos bloqueado SIEMPRE; DELETE de movimientos solo bajo mantenimiento. Ventana de mantenimiento: `set_config('costpro.fin_maintenance'…)` fijada SOLO por `fin_rectification_apply`, acotada con `costpro.fin_rectification_entry` AL asiento concreto (no existe registro de autorización previa — inspeccionado; se limita a la fila conforme a la misión 5.3-iii) y cada uso audita en `audit_logs` (`FIN_MAINTENANCE_*`, sin importes). **Documentado con honestidad: el parámetro es un FRENO, no un candado** (cualquier sesión privilegiada puede fijarlo a mano; por eso el bypass exige el asiento concreto y audita — demostrado en la batería f4s/f4t/f4u).
5. **`20261128153400` (F5)** — `fin_entry_reversal_residual` suma `amount_cup` en las 4 sumas (manteniendo sentidos, tolerancia 0,01 CUP de los llamadores, idempotencia); `fin_t12_block_receipt_annulment` filtra por `fin_active_generation(NEW.store_id)` con el tratamiento canónico de NULL (una reversión parcial SOLO en generación superseded ya no bloquea la anulación).
6. **`20261128153500` (TR)** — extiende el freno `block_truncate` (ENABLE ALWAYS, bypass documentado por `costpro.allow_truncate`) a las 16 tablas del libro y nóminas, reutilizando el instalador idempotente fail-closed `cp_infra_020_install_breaker(text[])`. **NO se revoca TRUNCATE a service_role** (imposible demostrar que ningún flujo de plataforma lo use; el freno queda como única barrera — decisión documentada de la misión 5.4).

Consumidores (F2, misión 5.1): `/api/fin/statements` YA mapeaba `ERR_UNAUTHORIZED`→403 (sin cambios); `/api/fin/opening-balances` (hallazgo N6) ahora exige `canManageStore` en GET y en TODO POST (create/apply/void usaban cliente admin sin gate → eludían RLS); `DocumentConfigView` lee `fin_posting_errors` por cliente de sesión y su entrada de navegación ya está restringida a admin/manager (el filtrado RLS la devuelve vacía para no-gestión sin romperse).

## 5. Pruebas ejecutadas (BD aislada CostproE2E)

**Batería de contrato** (`scripts/e2e/cp-fin-hardening-battery.mjs` + SQL y resultado en `audit-evidence/CP-FIN-REVIEW-001/cp-fin-hardening-battery*`): UNA transacción BEGIN…ROLLBACK con la centinela `e2e_is_isolated_db()` verificada dentro; verificación de residuo cero tras la corrida (0 tiendas/usuarios/asientos/generaciones BAT). Estructura: **PRE** (vulnerabilidades demostradas en el estado vigente: clerk lee el libro y llama `fin_get_dashboard`; admin de tienda reasigna regla global; UPDATE/DELETE/TRUNCATE directos del libro funcionan; residual 60 CUP con el bug; T12 bloquea por superseded) → **M1..M6** (aplicadas dentro de la transacción) → **POST** → **rollbacks R6..R1** → **RESTORE** (el estado vulnerable vuelve: prueba los rollbacks). Casios POST principales:

- **F2 matriz RLS** (SELECT con sesiones `SET LOCAL ROLE` + claims reales): clerk D/D (entradas, movimientos, saldos, errores globales+tienda), usuario sin membresía D, encargado P, manager P (errores globales D), admin de tienda P, admin global P (2 tiendas + 2 errores), otro tenant D (sobre S1) y P (sobre su tienda), anon D (ni privilegio de tabla).
- **F2 RPC por llamada directa**: clerk → `ERR_UNAUTHORIZED`; manager/encargado → OK; service_role SIN p_user_id → `ERR_UNAUTHORIZED`; service_role CON p_user_id válido → OK; ACL sin ampliación (verificado por catálogo).
- **F3**: RLS deniega en silencio (0 filas) al admin de tienda sobre regla global y al manager sobre regla de tienda; trigger bloquea reasignación de ámbito (simple y multi-columna) como postgres; admin global conserva capacidad; admin de tienda modifica SU regla.
- **F4**: UPDATE/DELETE bloqueados (`ERR_FIN_INMUTABLE`) en todas las variantes; (A) válida con contraasiento (y rechazada sin él); (B) relleno válido y variantes bloqueadas (NULL de vuelta, otra tienda, no-activa); `fin_rectification_apply` crea y repara (con auditoría `FIN_MAINTENANCE_*` en ambos bypass); bypass manual: asiento/columna equivocados bloqueados, asiento+columnas permitidas pasa Y AUDITA (freno no candado, documentado); borrado duro de tienda bloqueado (primero por FK de `audit_logs` — barrera preexistente; el bloqueo del trigger se demuestra directamente); `soft_delete_store` sigue funcionando.
- **F5**: residual 120 CUP (antes 60) y multimoneda 167 CUP; T12 no bloquea con residual solo en superseded; sigue bloqueando con residual en la activa.
- **TR**: TRUNCATE bloqueado por el freno; bypass documentado (parámetro + rol administrativo) funciona; 16/16 triggers ENABLE ALWAYS verificados.
- **Rollbacks probados**: restauración política a política, función a función, trigger a trigger (verificación `RESTORE` completa en la misma corrida).

**Regresión local** (sandbox): vitest `src/__tests__/migrations` 775/775 · `api` 632/632 · `contracts` 53/53 · ESLint 0 errores en archivos cambiados · tsc focalizado (subárbol de la ruta cambiada) 0 errores · `ci-gate-ts-checks` PASS · `security-contract-test-static` OK (3 warnings preexistentes; 1 entrada de deriva intencional en `ci-gate-allowlist.json → source_of_truth_baseline` por `fin_rectification_apply/9` — pendiente de aplicación G1, con justificación y vencimiento 2026-12-31, precedente create_sale_v2/34) · `build-migrations-replay --check` MATCH (stream 232; 5 tests de posición de manifiesto actualizados conforme a la convención existente de totales congelados) · `check-writers` OK (batería declarada en `isolationProtected`).

**Declaración de límites:** el build de producción completo y `tsc --noEmit` MONOLÍTICO no caben en el sandbox (restricción documentada de 4 GB — PERF-AUDIT §4.2); los cubre el CI del PR. La matriz 6.1 completa por RUTA DE LA APP y con todos los pares de tienda se cubrió a nivel SQL directo; no se ejecutó la app local en esta fase.

## 6. F1 — mediciones, UUIDs y decisión pendiente

[MEDIDO 2026-11-28] Tiendas con ventas completadas sin asiento en generación activa:

| Tienda | UUID completo | Completadas | Sin asiento |
|---|---|---|---|
| COSTPRO (Prueba) | `43a4dabc-b8b4-4b66-82b3-0c75335ca5d1` | 213 | 213 |
| PUERTO PADRE | `899d2503-d000-41d2-89f0-0827f4ac37ab` | 79 | 69 |
| ENERVIDA-VITALLCONS (principal) | `5e6fe821-5465-48b1-b3f1-3aa3182edc38` | 721 | 0 |

Causa raíz [CONFIRMADA en T0-2026-11-23, corte temporal + código]: las ventas de ambas tiendas terminan antes de la instalación del motor (2026-11-13); el trigger `fin_trg_transactions` solo contabiliza INSERT-completed o transición a completed; no hubo recorrido histórico. PUERTO PADRE tiene 10 ventas POST-instalación ya contabilizadas (el motor funciona para lo nuevo). La intuición del propietario («la de Puerto Padre») es correcta como tienda REAL afectada; COSTPRO (Prueba) es tienda de pruebas con 213 ventas 02-05→04-11. **La decisión de contabilizar (o no) cada tienda y la frase G2 correspondiente son del propietario.** Monitor, instrumentación e informe de impacto = PR-B (orden de la misión).

## 7. Compuertas de producción

| Compuerta | Estado |
|---|---|
| G1 `AUTORIZO FIN HARDENING PROD` | **PENDIENTE** — sin la frase literal NO se aplican M1..M6 a producción |
| G3 `AUTORIZO FIN MONITOR PROD` | **PENDIENTE** — y su desarrollo es PR-B |
| G2 `AUTORIZO FIN COBERTURA PROD: <UUID>` | **PENDIENTE** — y requiere la decisión de §6 |

Respaldo (misión §2): NO demostrado (no hay acceso pg directo a producción desde el sandbox, y ninguna escritura está autorizada sin compuerta). **Antes de G1 el propietario debe garantizar un respaldo cifrado independiente con restauración probada** — condición previa explícita de la misión.

## 8. Aplicaciones en producción (reales, esta misión)

**NINGUNA.** Producción quedó intacta (solo lectura). El registro diferido de las 34 migraciones no registradas del libro está PREPARADO con evidencia (`audit-evidence/CP-FIN-REVIEW-001/ledger-sync-pendiente.sql` + `revalida-20261128-ledger-gap.json`) y **requiere autorización expresa del propietario** (escritura no cubierta por ninguna compuerta de esta misión; se entrega como paquete ejecutable para su decisión).

## 9. F6/F7 (solo documentación)

- **F6** — las 4 aperturas sin movimientos pueden ser declaraciones documentadas de saldo cero (trazabilidad), no corruptas; efecto contable nulo; no se eliminan ni corrigen.
- **F7** — política de retención propuesta para generaciones superseded: (i) no borrar ni archivar físicamente en esta misión; (ii) consulta histórica y comparación de saldos permanece por `fin_posting_generations.status`; (iii) retención mínima recomendada ≥ 7 años (auditoría fiscal) con exportación anual verificada a almacenamiento externo de largo plazo y manifiesto SHA-256; (iv) las referencias de reversión (`reversal_of`) cruzan generaciones — toda política futura de archivado debe preservar el grafo asiento↔contraasiento.

## 10. Limitaciones y lo NO verificado

- PR-B (monitor `fin_coverage_report`, instrumentación de fallos, informe de impacto por tienda, ensayo local del backfill) NO desarrollado (orden de la misión).
- Batería ejecutada en SQL directo contra la BD aislada (no por la UI de la app); `SET LOCAL ROLE` + claims JWT simulan sesiones reales (el patrón exacto que usa PostgREST).
- La tabla sin RLS `exchange_rates_backup_cpfx001` (hallazgo nuevo) NO se corrige aquí (fuera del alcance enumerado) — reportada.
- Políticas amplias halladas N2 (`fin_reconciliation_snapshots_select`) y N3 (`fin_posting_generations_select`) reportadas, no corregidas (no enumeradas por la misión).
- N5 (formato histórico de `error_code` con identificadores) documentado; su cambio queda fuera de alcance.

## 11. Cierre por punto (regla 10 de la misión — sin optimismo)

| Punto | Estado |
|---|---|
| T0 Revalidación y expediente | PASS (2026-11-23 + revalidación 2026-11-28) |
| F2 RLS + 6 RPC | RESUELTA EN CÓDIGO — PENDIENTE DE APLICAR EN PRODUCCIÓN (G1) |
| F3 Ámbito de reglas | RESUELTA EN CÓDIGO — PENDIENTE DE APLICAR EN PRODUCCIÓN (G1) |
| F4 Solo-adición del libro | RESUELTA EN CÓDIGO — PENDIENTE DE APLICAR EN PRODUCCIÓN (G1) |
| F5 Reversión residual y generación | RESUELTA EN CÓDIGO — PENDIENTE DE APLICAR EN PRODUCCIÓN (G1) |
| TR Freno de TRUNCATE ampliado | RESUELTA EN CÓDIGO — PENDIENTE DE APLICAR EN PRODUCCIÓN (G1) |
| F1 Monitor e instrumentación | PENDIENTE (PR-B — orden de la misión) |
| F1 Causa raíz | CONFIRMADA (T0 2026-11-23, corte temporal + código) |
| F1 Impacto por categoría | NO DESARROLLADO (PR-B) |
| G1 / G3 / G2 | PENDIENTE / PENDIENTE / PENDIENTE |
| F6, F7 | DOCUMENTADO (§9) |
| Producción | SOLO LECTURA (0 escrituras) |
| PR-A / PR-B | CREADO (este PR) / PENDIENTE |
| Respaldo verificable | NO DEMOSTRADO — obligatorio antes de G1 |

## 12. Checklist del propietario

1. Revisar el CI de este PR y fusionarlo tras verificar.
2. Garantizar respaldo cifrado independiente con restauración probada antes de cualquier G1.
3. Decidir si PUERTO PADRE (`899d2503-d000-41d2-89f0-0827f4ac37ab`) y/o COSTPRO (Prueba) (`43a4dabc-b8b4-4b66-82b3-0c75335ca5d1`) se contabilizan (determina PR-B y la frase G2).
4. Decidir la sincronización del libro de migraciones (paquete preparado con evidencia; escritura que requiere autorización expresa).
5. Decidir qué roles de gestión ven el libro (implementado por defecto: admin, manager, encargado).
6. Escribir `AUTORIZO FIN HARDENING PROD` solo tras leer este informe; después `AUTORIZO FIN MONITOR PROD` (PR-B) y/o `AUTORIZO FIN COBERTURA PROD: <UUID completos>`.
7. Saldo de otros activos corrientes y efectivo USD con el contador; conteo físico pendiente.
