# EXPEDIENTE — CP-SECURITY-AND-BACKLOG-CLOSURE-001
**Misión:** Cierre integral de seguridad, integridad de datos y pendientes técnicos de COSTPRO
**Fecha (UTC):** 2026-11-14 · **Rama:** `fix/cp-security-backlog-closure-20261114` · **Operador:** agente, bajo el mandato explícito del propietario (misión CP-SECURITY-AND-BACKLOG-CLOSURE-001).
**Producción:** CostproBD (`wthkddeleylijmonclxg`). Canal: Management API `/v1/projects/wthkddeleylijmonclxg/database/query` + `NOTIFY pgrst 'reload schema'` (patrón m002–m017). Guard: CP-INFRA-019 doble flag (`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`).

## 0. Base de autorización (interpretación documentada)

La misión autoriza en §1.2 cambios en producción «dentro del procedimiento aprobado del proyecto»
(PROCESO_CAMBIOS_PRODUCCION.md: archivo versionado + fila en el libro + evidencia + informe de
deriva) y exige en sus criterios de aceptación (§3, §5, §6, §7, §9) estados VERIFICADOS tras la
aplicación, priorizando en §12 «privacidad de nóminas». La única exclusión explícita de
autorización es el FRENO DE TRUNCATE («No interpretes esta misión, por sí sola, como autorización
para ejecutar esa operación en producción»), que quedó PREPARADO Y PROBADO sin aplicar. Las 5
migraciones aplicadas son no destructivas, idempotentes, validadas en la BD aislada antes de la
aplicación y con verificación fail-closed y delta 0 tras ella.

## 1. Resumen ejecutivo

- **VULNERABILIDAD DE PRIVACIDAD DE NÓMINAS CERRADA EN PRODUCCIÓN**: cualquier miembro
  autenticado de una tienda (1 clerk + 8 encargados + 4 usuarios + 1 warehouse + 4 costo +
  10 tenant_admin con membresía) podía leer nóminas, líneas y tarifas salariales, y además
  confeccionar/confirmar/pagar/anular nóminas vía RPC. Corregido con RLS por rol + gates en
  los 7 RPC (verificado por matriz de 36 pruebas en BD aislada con impersonación REAL de RLS).
- **MÍNIMO PRIVILEGIO APLICADO**: 924 privilegios TRUNCATE/TRIGGER/REFERENCES de
  anon/authenticated sobre el esquema public revocados (tablas actuales) + defaults del
  creador real (postgres, 178/178 tablas [MEDIDO]) revocados para tablas futuras. Residual
  inerte documentado: defaults de supabase_admin (postgres no puede alterarlos — pg_has_role
  false [MEDIDO]; 0/178 tablas de public son suyas).
- **RESTRICCIÓN DUPLICADA DE COMISIONES ELIMINADA**: ambas EXCLUDE idénticas convivían HOY en
  producción [MEDIDO, contradictoriamente al expediente del 8/11]; queda SOLO
  `commission_payments_no_overlap` (la canónica: guard, libro, convención de nombres).
- **REGRESIÓN REAL DE BUG-024 DESCUBIERTA Y CORREGIDA**: el POST /api/legal/incidents fallaba
  con 500 desde que `audit_logs_store_id_check` se endureció (legal_incidents ausente de la
  whitelist). El `test.skip` obsoleto lo ocultaba. Corregido (whitelist + legal_incidents) y
  cerrado con prueba de regresión real (8/8).
- **RATE LIMIT DISTRIBUIDO OPERATIVO**: almacén compartido PostgreSQL con incremento atómico
  (UPSERT) + política de fallo explícita (fail-open general / fail-closed autenticación).
  Probado entre 4 procesos independientes: exactamente el límite compartido (10/32), contador
  atómico exacto. El código muerto `auth-rate-limit.ts` (solo-memoria, sin uso) fue eliminado.
- **LIBRO DE MIGRACIONES RECONCILIADO Y CON CONTROL DE REINCIDENCIA**: 32 → 52 filas
  (9 de regularización con efectos verificados por catálogo [MEDIDO], 5 de la misión, 6
  correcciones de versiones truncadas, 3 de regularización adicional por sonda). Nuevo control
  `scripts/ops/ledger-sync-check.mjs` (read-only, exit 1 ante desincronización) integrado al
  procedimiento. DERIVA repo↔prod documentada: `20261110090000` (default 'venta') NO está
  aplicada (requiere decisión/aplicación del propietario); `20261106120000` es no-op en
  producción por diseño (SEC-005).
- **FRENO DE TRUNCATE (CP-INFRA-020) PREPARADO Y PROBADO, NO APLICADO** (compuerta
  `AUTORIZO BREAKER PROD` pendiente): defecto fail-closed corregido (RAISE WARNING →
  EXCEPTION con lista exacta), bypass endurecido (roles de aplicación JAMÁS pueden eludirlo),
  instalador testeable, batería de 6 pruebas en BD aislada, procedimiento de aplicación
  actualizado a la familia v2.

## 2. Matriz de cierre (los 9 frentes)

| ID | Frente | Estado | Evidencia |
|---|---|---|---|
| CP-INFRA-020 | Freno de TRUNCATE | **BLOQUEADO** (compuerta `AUTORIZO BREAKER PROD` pendiente; migración corregida, probada y procedimiento listo) | §6 de este expediente; `supabase/migrations/20261114180300` + `supabase/tests/infra020_breaker_v2_test.sql` (HTTP 201); BYPASS_FRENO_TRUNCATE.md actualizado |
| CP-SEC-PAYROLL | Privacidad de nóminas | **CERRADO** (aplicado y verificado en producción) | §3; matriz 36/36 (verify-payroll-privacy-pg.mjs), regresión 54/54, verificación §12 |
| CP-MIGRATION-LEDGER | Libro de migraciones | **CERRADO** (reconciliado con evidencia + control de reincidencia) | §5; ledger-sync-check exit 0; 52 filas |
| CP-SEC-PRIVILEGES | Privilegios PostgreSQL | **CERRADO** (aplicado y verificado; residual inerte documentado) | §4; verificación: 0 residuos, service_role intacto |
| CP-SEC-RATELIMIT | Rate limit distribuido | **CERRADO** (aplicado y verificado) | §7; concurrencia 4 procesos PASS, unit 7/7, E2E smoke |
| BUG-024 | Incidencia funcional | **CERRADO** (regresión real corregida + prueba de regresión + verificación) | §8; legal.spec 8/8; migración 20261114180500 |
| IPV-003 | Texto de inventario | **CERRADO** (definición original localizada; texto aplicado a los 3 registros vivos + prueba de consistencia) | §9; ipv003-registry-consistency.test.ts 4/4 |
| CP-COMMISSION-CONSTRAINT | Restricción de comisiones | **CERRADO** (duplicación comprobada HOY y eliminada con guard) | §10; verificación: 1 EXCLUDE (la canónica) |
| CP-COST-RECONCILIATION | 36 productos sin costo | **BLOQUEADO** (decisión del propietario pendiente sobre matriz ya entregada el 13/11; conciliación individual entregada sin valores inventados) | §11; Matriz-Conciliacion-Productos-Sin-Costo-2026-11-14.xlsx (115 filas) |

## 3. CP-SEC-PAYROLL — privacidad de nóminas (CERRADO)

**Defecto verificado [MEDIDO 2026-11-14]:** las 4 políticas de 20261112180000 comprobaban solo
membresía de tienda; `GRANT SELECT` a authenticated → cualquier miembro leía salarios; los 7 RPC
gateaban con `has_store_access_as` (cualquier miembro activo) → un clerk podía confeccionar y
pagar nóminas. Sin exposición por Realtime (0 tablas en la publicación) ni vistas (0 vistas que
tomen payrolls).

**Corrección (migración `20261114180000_cp_sec_payroll_privacy.sql`, aplicada a producción):**
- Helpers `can_read_payroll_store(store)` (RLS, usa auth.uid()) y
  `can_manage_payroll_as(user, store)` (RPC, identidad resuelta server-side; anti-spoofing
  v2.12.9 del patrón original intacto en cada caller).
- 4 políticas SELECT restringidas + 4 ALL restrictivas (defensa en profundidad):
  superadmin global; admin de plataforma SOLO tiendas de su tenant; admin de tienda por
  membresía activa 'admin'; encargado/clerk/usuario/warehouse/costo/tenant_admin: NADA.
- Los 7 RPC con gate administrativo (cuerpos regenerados POR SCRIPT desde 20261112180000 con
  SOLO la línea del gate sustituida; verificación automática de que quedan 0 gates antiguos).
- postgres/service_role tienen bypassrls [MEDIDO] → RPC SECURITY DEFINER y canal admin intactos.

**Matriz obligatoria (36/36 PASS en CostproE2E, impersonación REAL: BEGIN; SET LOCAL ROLE
authenticated; claims):** lectura C1–C22 (superadmin ×2 permitido; admin plataforma su tenant
permitido / otro tenant denegado; admin de tienda su tienda permitido / otras denegado;
encargado/clerk/usuario denegado en ambas columnas; sobre payrolls, payroll_items,
payroll_item_concepts y worker_salary_rates; anon permission denied) + RPC D1–D8 (encargado,
clerk y usuario NO pueden confeccionar, confirmar, contabilizar, pagar, anular ni fijar
tarifas: ERR_UNAUTHORIZED) + D9–D11 (admin de plataforma, admin de tienda y superadmin SÍ
operan con normalidad). Regresión del módulo: verify-nominas-pg.mjs 54/54.

**Producción [MEDIDO]:** payrolls_admin_privacy=1, rpc_gateados=7, policies_viejas=0.
La equivalencia REST: PostgREST ejecuta como authenticated con los claims del JWT — las
consultas REST pasan por la MISMA política; sin vistas ni RPC alternativos que expongan
importes (verificado por catálogo); `commission_rules.salary_amount` sin datos (NULL en el
único registro).

## 4. CP-SEC-PRIVILEGES — mínimo privilegio (CERRADO)

**Estado inicial [MEDIDO]:** anon TRUNCATE×149/TRIGGER×152/REFERENCES×152; authenticated
TRUNCATE×155/TRIGGER×158/REFERENCES×158; defaults arwdDxtm para tablas futuras de postgres y
supabase_admin. Propietarios reales: 178/178 tablas de postgres. Roles con CREATE: postgres y
supabase_admin. `pg_has_role(postgres, supabase_admin, MEMBER)` = false.

**Corrección (`20261114180100`, aplicada):** REVOKE TRUNCATE/TRIGGER/REFERENCES ON ALL TABLES
IN SCHEMA public FROM anon, authenticated + ALTER DEFAULT PRIVILEGES FOR ROLE postgres (y
supabase_admin con intento controlado: insufficient_privilege → residual inerte documentado:
0/178 tablas suyas; nota en el DO de verificación).

**Producción [MEDIDO]:** residuos=0; defaults postgres=0; service_role intacto (12/12 en la
muestra); la app sigue operativa (E2E smoke 67/67 verde tras el cambio). La corrección de
sintaxis (`ON TABLES` obligatorio) y el descubrimiento de los defaults arwd de tablas nuevas
quedaron documentados tras fallos reales del replay contra la BD aislada (evidencia
apply-replay.json).

## 5. CP-MIGRATION-LEDGER — libro reconciliado (CERRADO)

**Investigación:** el libro tenía 32 filas (al día hasta 20261114140000 por la regularización
m017 del 14/11) PERO el cruce por catálogo contra el repo detectó 9 migraciones posteriores al
baseline con efectos en producción y SIN fila, más 1 no aplicada (deriva):

| Versión | Archivo | Estado real | Evidencia de aplicación | Fila en el libro |
|---|---|---|---|---|
| 20261106100000 | cp_contract_surface_reconcile | Aplicada | ACL create_sale_v2→authenticated presente [MEDIDO] | regularizada (id 50) |
| 20261106120000 | sec005_drop_dead_overloads | No-op en producción POR DISEÑO (solo CostproE2E — SEC-005_CIERRE_SOBRECARGAS.md: «Cero escrituras en producción») | expediente | NO lleva (no fue aplicada) |
| 20261107120000 | cp_catalogo_maestro_sync_register_reception | Aplicada | register_reception firma extendida presente [MEDIDO] | regularizada (id 51) |
| 20261108120000 | cp_catalogo_reconciliacion_datos_compartidos | Aplicada | reconcile_store_catalog_shared_data presente [MEDIDO] | regularizada (id 52) |
| 20261108141000 | sales_dashboard_analytics | Aplicada | get_sales_dashboard_* presentes [MEDIDO] | regularizada (ids 33+44) |
| 20261108150000 | cp_operational_classification | Aplicada | operational_class + enum + índice [MEDIDO] | regularizada (ids 34+45) |
| 20261108200000 | cp_doc_sc006_store_code | Aplicada | stores.store_code [MEDIDO] | regularizada (ids 35+46) |
| 20261108201000 | cp_doc_sc006_receipt_document_number | Aplicada | receipts.document_number [MEDIDO] | regularizada (ids 36+47) |
| 20261108220000 | sales_dashboard_stores_comparison | Aplicada | dashboard v2 presentes [MEDIDO] | regularizada (ids 37+48) |
| 20261110090000 | cp_operational_class_default_venta | **NO APLICADA (deriva repo↔prod)** | operational_class sigue NULLable/sin default; 274 NULL; RPC sin default 'venta' [MEDIDO] | NO lleva (no está aplicada) |
| 20261110120000 | cp_plantillas_privadas_propietario | Aplicada | 6 políticas de cost_sheet_templates [MEDIDO] | regularizada (ids 38+49) |
| 20261110120000 | cp_infra_020_truncate_breaker | NO APLICADA (compuerta) | block_truncate=0, triggers=0 [MEDIDO] | NO lleva (correcto) |
| 20261114180300 | cp_infra_020_breaker_v2 | NO APLICADA (compuerta) | — | NO lleva (correcto) |

Nota: los ids dobles (33-38 y 44-49) corresponden a un error tipográfico del aplicador
(version truncada a 13 caracteres) corregido insertando las filas canónicas de 14; las filas
originales permanecen como historial (el libro es solo-adición por diseño — trigger
LEDGER-GUARD verificado).

**Prevención de reincidencia:** regla operativa integrada al PROCESO (paso 5: fila del libro en
el MISMO ciclo que la aplicación) + control automático `scripts/ops/ledger-sync-check.mjs`
(sondas de efectos por catálogo, exit 1 ante «aplicada sin registrar» o «fila sin archivo»).
Estado actual: **exit 0** — 0 aplicadas sin registrar; SIN_APLICAR = 3, todas explicadas
(no-op por diseño, deriva pendiente de decisión, compuerta del freno).

**Producción [MEDIDO]:** 52 filas, 48 applied + 1 baseline + 3 explicadas fuera del libro.

## 6. CP-INFRA-020 — freno de TRUNCATE (BLOQUEADO: compuerta pendiente)

- Defecto D1 corregido: `20261114180300_cp_infra_020_breaker_v2.sql` convierte la comprobación
  de tablas ausentes en FAIL-CLOSED (RAISE EXCEPTION con lista exacta; nada se instala en
  parcialidad) mediante la función testeable `cp_infra_020_install_breaker(text[])`.
- Defecto D2 corregido: el bypass exige GUC `costpro.allow_truncate='on'` Y current_user ∉
  (anon, authenticated). Demostrado: authenticated con la GUC activa sigue sin poder truncar
  (doble defensa: ACL tras 180100 + condición de rol en la función).
- D3: verificación 34/34 (el array tiene 34 tablas; el comentario original decía 33).
- Pruebas (CostproE2E, batería `infra020_breaker_v2_test.sql`, HTTP 201 = todas las aserciones):
  TRUNCATE ordinario bloqueado; bloqueado con `session_replication_role='replica'` (ENABLE
  ALWAYS); bypass administrativo funcional y transaccional; GUC inútil para authenticated;
  instalador fail-closed ante tabla ausente (sin instalación parcial); catálogo 34/34 'A' sin
  duplicados.
- **NO se aplicó a producción** (la misión lo prohíbe expresamente sin `AUTORIZO BREAKER PROD`).
  Procedimiento actualizado en BYPASS_FRENO_TRUNCATE.md (familia v2 en dos archivos,
  verificación 34/34, rollback). Producción [MEDIDO]: fn=0, triggers=0 (correcto mientras
  penda la compuerta).

## 7. CP-SEC-RATELIMIT — rate limit distribuido (CERRADO)

**Implementación (`20261114180400` aplicada + `src/lib/rate-limit.ts`):** tabla
`rate_limit_buckets` (PK clave+ventana; RLS FORCED sin políticas; REVOKE ALL a
anon/authenticated) + RPC `rate_limit_take` (SECURITY DEFINER, UPSERT atómico, ventana fija
calculada en la BD, limpieza oportunista 1%/24h, solo service_role). Cadena de la app:
Upstash (si se configura) → PostgreSQL compartido → memoria como ÚLTIMO recurso según
`failMode`: 'open' (disponibilidad, aviso en logs) por defecto; **'closed' en
supervisor-check** (autenticación: si el almacén no puede verificar, se DENIEGA — coherente:
sin Supabase la ruta no puede completarse de todos modos). Los encabezados de IP solo se usan
como parte secundaria de la clave (el userId autenticado es la clave primaria).

**Pruebas:** unitarias 7/7 (cadena de almacenamiento, fail-open/fail-closed, truncado de
clave, respuestas inválidas); **concurrencia real entre procesos** PASS (4 procesos fork × 8
llamadas, límite 10 → exactamente 10 permitidas [la memoria por instancia habría permitido
~40], contador compartido exacto 32/32); E2E de la app operativo (inventory.spec rate-limit
429 ✓ dentro del smoke 67/67); `auth-rate-limit.ts` (brute-force solo-memoria, código muerto
sin importadores) ELIMINADO — la protección real de autenticación vive en las rutas con
rateLimit + failMode closed.

**Producción [MEDIDO]:** tabla presente, 0 políticas, 0 grants anon/authenticated, RPC solo
service_role. El código de la app se despliega con el merge del PR (Vercel) — hasta entonces
la BD ya está lista y la app actual funciona sin cambios (el RPC es aditivo).

## 8. BUG-024 — cierre formal (CERRADO)

**Investigación:** descripción original en PLAN_PRIORIZADO §CP-SEC-012 («Persistencia de
incidents — data/incidents.json FS efímero»); corrección por Decisión D del propietario
(2026-10-20, PR #1431: persistencia en audit_logs action='legal_incident' + índice
20261020000005). El registro decía «cierre formal pendiente».

**Hallazgo al reproducir:** el `test.skip` obsoleto de e2e/legal.spec.ts ocultaba que el fix
estaba ROTO en la versión actual: `audit_logs_store_id_check` (endurecido el 13/11 sin
contemplar legal_incidents) rechazaba el INSERT del endpoint → POST 500 (23514) —
reproducido en BD aislada y por POST directo. **La regresión existía también en producción**
(misma constraint aplicada).

**Corrección:** `20261114180500` (whitelist + legal_incidents, patrón aprobado de
20261113120600; idempotente; fail-closed) — aplicada a producción. Prueba de regresión REAL
sustituye al skip: POST persiste (201) → GET admin lo lista (persistencia demostrada) → GET
no-admin 403. legal.spec.ts 8/8 en BD aislada. Registro actualizado (tareas.csv CP-SEC-012:
cierre formal 2026-11-14). Producción [MEDIDO]: whitelist_ok=1.

## 9. IPV-003 — texto del inventario de tareas (CERRADO)

**Definición original localizada:** CP-IPV-003 = «4 WAC vigentes inflados 680x (SKU
67/68/107/121) + diluciones SKU 90/999» (INVENTARIO_MAESTRO §3.3, ENERVIDA-COST-PROVENANCE
§8-bis). La redacción de cierre exigida por FINAL-CYCLE-CLOSE-001 (T6, 8/11): «CERRADA POR
DECISIÓN DEL PROPIETARIO — COSTOS EN CUP DE PROCEDENCIA NO VERIFICADA (RIESGO ACEPTADO, SIN
CORRECCIÓN DE DATOS)».

**Defecto:** el commit b7d8a8f93 ANUNCIÓ esa redacción en su mensaje pero el diff real solo
tocó CP-POS-002 — el texto NUNCA llegó a los registros vivos (tareas.csv seguía
PENDIENTE CONFIRMADA/BLOQUEADA_DEPENDENCIA; INVENTARIO_MAESTRO línea 84 y ficha §3.3;
WORKLOG §2.3).

**Corrección:** los 3 registros actualizados con la redacción exacta + contexto medido (4 SKUs
×680 exactos, solo 107 con stock, margen 27.27% @935 aritmético) + nota de la divergencia del
commit. Prueba de consistencia `ipv003-registry-consistency.test.ts` (4/4) impide que la
divergencia reaparezca. Los documentos históricos con fecha (misiones pasadas) NO se tocaron.

## 10. CP-COMMISSION-CONSTRAINT — restricción duplicada (CERRADO)

**Comprobación (pg_constraint/pg_indexes, producción [MEDIDO 2026-11-14]):** DOS EXCLUDE
idénticas en definición (worker_id WITH =, daterange '[]' WITH &&, WHERE status <>
'cancelled'): `no_overlapping_periods` (20260714000001) y `commission_payments_no_overlap`
(20261022000002). Nota: el expediente del 8/11 documentaba que la de julio ya no existía —
HOY existían AMBAS (estado verificado de nuevo antes de actuar).

**Canónica elegida:** `commission_payments_no_overlap` (migración con guard fail-closed,
fila en el libro de la autorización «opción B», convención de nombres del esquema, y la
batería ui001 no depende del nombre antiguo [grep]). **Corrección**
(`20261114180200`, aplicada): guard que exige la canónica presente y con la semántica
exacta, verificación de equivalencia byte a byte de la duplicada antes de DROP (aborta si
difieren), verificación final = exactamente 1 EXCLUDE. Los flujos de comisiones no se tocan
(el índice de la canónica sigue validando); smoke E2E verde. Producción [MEDIDO]: solo
`commission_payments_no_overlap`.

## 11. CP-COST-RECONCILIATION — productos sin costo (BLOQUEADO: decisión pendiente)

**Investigación:** el «36» del informe anterior NO es reproducible exactamente (el informe no
quedó commiteado y los datos evolucionaron). Universo actual medible y reproducible
[2026-11-14]: 301 productos con cost_price<=0 (243 ENERVIDA, 57 Puerto Padre, 1 Prueba);
con existencia: **115** (71 ENERVIDA + 44 Puerto Padre) — el subconjunto económicamente
material. Matriz individual de los 115 entregada
(`download/Matriz-Conciliacion-Productos-Sin-Costo-2026-11-14.xlsx`):
39 con recepciones de costo documental (carga inicial tasa 680, ADVERTENCIA DE PLAUSIBILIDAD
documentada el 13/11 — posible importe por caja/lote), 67 con carga nominal 1 CUP (clase
C3/C6), 4 TAREA 2B (decisión 1 CUP nominal YA EJECUTADA en cost_average), 1 IPV-003 (riesgo
aceptado por el propietario), 4 sin recepciones (requieren facturas externas — bloqueo
CP-IPV-002).

**Política aplicada (misión §10):** NINGÚN costo inventado; NINGÚN precio de venta usado como
sustituto; ningún promedio arbitrario; monedas y precisión respetadas. Los grupos con decisión
YA TOMADA (TAREA 2B, IPV-003) se documentan como «mantener»; los grupos pendientes se
identifican con la decisión exacta que falta (matriz de costos ENERVIDA del 13/11 ya entregada
como insumo + facturas externas). **Estado: BLOQUEADO por decisión del propietario** — la
misión exige no declarar resueltos los que no tienen evidencia fiable.

## 12. Verificación final en producción (read-only, [MEDIDO 2026-11-14])

| Prioridad | Verificación | Resultado |
|---|---|---|
| 1. Privacidad de nóminas | payrolls_admin_privacy=1 · 7 RPC con gate · 0 políticas viejas | OK |
| 2. RLS | 179/179 tablas public con RLS habilitado | OK |
| 3. Privilegios | 0 TRUNCATE/TRIGGER/REFERENCES de anon/authenticated | OK |
| 4. Freno TRUNCATE | fn=0, triggers=0 (correcto: compuerta pendiente) | OK (estado esperado) |
| 5. Migraciones | 52 filas en el libro; ledger-sync-check exit 0 | OK |
| 6. Integridad de datos | DELTA 0 en 8 tablas de negocio tras la aplicación | OK |
| 7. Rate limit | tabla presente, 0 políticas, 0 grants, RPC service-only | OK |
| 8. Regresiones | E2E smoke 67/67 + legal 8/8 (aislada); contract LIVE: TODAS PASAN; app producción health 200 | OK |

## 13. CI y evidencias de la misión

- Suite unitaria completa: **6063 PASS / 0 FAIL** (445 archivos; 6 skipped preexistentes)
  — re-verificada tras integrar main (PR #1624 recepciones + PR #1626 cierre de
  recepciones) en esta rama.
- Contrato de seguridad: estático OK (208/208 representadas, 0 divergencias; 2 warnings
  MEDIUM/LOW preexistentes) + LIVE «TODAS LAS FUNCIONES PASAN». Snapshot re-certificado
  desde producción tras la aplicación (sha256 014cde7a…).
- Manifiesto de replay E2E: **167 migraciones** (166 de la misión + 1 de CP-RECEIPT-INTEGRITY-001
  llegada por el merge del PR #1624); manifiesto regenerado determinísticamente; test de conteo
  unificado a 167; `--check` MATCH (sin deriva).
- Gates: check-writers OK (unión con el cierre de recepciones: 40 guardProtected + 18
  isolationProtected + 103 excepciones justificadas — incluye los 2 correctores del libro y
  ledger-sync-check de esta misión); check-destructive-guard exit 0 (marcador DESTRUCTIVE-OK en
  20261114180300 — no aplicada, texto de COMMENT; excepción con vencimiento 2027-02-12 para
  20261114180400 — ya aplicada e inmutable, DELETE con WHERE en línea siguiente: falso positivo
  documentado); ci-gate-sql-checks OK (allowlist +2 justificadas: can_manage_payroll_as,
  rate_limit_take).
- Integración con main: dos merges (PR #1624 y PR #1626) resueltos sin cambios funcionales —
  conflictos solo en manifiestos de control (e2e-migrations-manifest regenerado;
  writers.manifest por unión). `tsc --noEmit` 0 errores; eslint 0 errores.
- Informes de deriva ANTES/DESPUÉS en este directorio (la deriva preexistente del fingerprint
  —54 funciones sobrantes de misiones 8–13/11— queda documentada; re-certificarla es tarea de
  mantenimiento pendiente, no bloqueante).
- Aplicación a producción: log completo en `aplicacion-produccion.log` (12/12 verificaciones
  OK, delta 0).

## 14. Archivos de la misión

Migraciones: 20261114180000 (payroll privacy), 20261114180100 (privilegios), 20261114180200
(comisiones), 20261114180300 (freno v2 — NO aplicada, compuerta), 20261114180400 (rate limit),
20261114180500 (whitelist legal_incidents). Código: rate-limit.ts, auth-rate-limit.ts
(eliminado), supervisor-check, NominasTab/WorkersView (gate UI), e2e/legal.spec.ts.
Pruebas: rate-limit-distributed (7), ipv003-registry-consistency (4), replay-count (166),
infra020_breaker_v2_test.sql, verify-payroll-privacy-pg.mjs (36), rate-limit-concurrency-proof,
verify-nominas-pg (54, existente). Herramientas: cp-security-backlog-001-aplicar-produccion.mjs
(+2 correctores de libro), ops/ledger-sync-check.mjs, prod-readonly-query.mjs,
e2e/run-sql-test-e2e.mjs. Docs: BYPASS_FRENO_TRUNCATE.md (familia v2), PROCESO (paso 5),
tareas.csv (IPV-003 + CP-SEC-012), INVENTARIO_MAESTRO + WORKLOG (IPV-003).

## 15. Riesgos residuales y bloqueos

1. **Freno de TRUNCATE sin aplicar** (riesgo medio): hasta la compuerta `AUTORIZO BREAKER
   PROD`, un TRUNCATE accidental por service_role/postgres no está frenado (la revocación a
   anon/authenticated ya aplica; el freno cubre el resto). Procedimiento listo.
2. **Default privileges de supabase_admin** (residual inerte, riesgo bajo): postgres no puede
   alterarlos [MEDIDO]; 0/178 tablas de public son de ese rol. Si la plataforma creara tablas
   en public, heredarían TRUNCATE/TRIGGER/REFERENCES para anon/authenticated. Mitigación:
   el ledger-sync-check y el drift report lo dejarían visible.
3. **Deriva 20261110090000** (default 'venta'): en main pero NO aplicada — la columna
   operational_class sigue nullable con 274 NULL en producción. Requiere decisión/aplicación
   del propietario (es funcional, no de seguridad).
4. **Costos ENERVIDA** (bloqueo contable): matriz del 13/11 + esta matriz de 115 como insumos;
   sin decisión no se asignan costos (por mandato).
5. **Fingerprint de funciones desactualizado** (deriva preexistente de misiones 8–13/11): el
   drift report lo expone; re-certificación pendiente de mantenimiento.
6. **Código de la app sin desplegar**: los cambios de código (limiter, UI nóminas, test BUG-024)
   se activan en producción al fusionar el PR (Vercel despliega main); la BD ya está protegida
   server-side desde ahora.
