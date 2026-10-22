# MISIÓN D — PLAN DE LIMPIEZA L1/L2/L3 (PREPARACIÓN — SIN BORRADOS)

**Proyecto:** COSTPRO 4 MULTITIENDA (`Nardian90/Costpro`)
**Fecha de preparación:** 2026-10-22 (ciclo 2 de la Misión Continua)
**Base de la decisión:** Resolución del propietario — Misión C (2026-10-21), ítem A.1 (opción 1 de PD-1), registrada en `docs/decisions/2026-10-21-resolucion-propietario-mision-c.md`
**Estado de este documento:** `PLAN PREPARADO — PENDIENTE DE AUTORIZACIÓN EXPRESA POR LOTE`
**Borrados ejecutados al preparar este plan:** **CERO**

> **Mandato literal del propietario:** «adoptar como política la limpieza por
> lotes con trazabilidad individual. No ejecutar borrados hasta presentar y
> obtener autorización expresa para cada lote L1/L2/L3. Mantener L4 intacto
> mientras no se confirme la titularidad de los tres vales.» Este documento
> prepara esa presentación. Nada de lo aquí descrito está autorizado todavía.

---

## 1. Política ratificada (marco del plan)

1. **Trazabilidad individual:** cada entidad se identifica por UUID exacto con
   su evidencia de origen; nunca se borra «por nombre» ni «por patrón» en los
   lotes D-indeterminados.
2. **Autorización por lote:** L1, L2 y L3 se presentan y se autorizan POR
   SEPARADO. La aprobación de uno no cubre a los demás.
3. **L4 intocado:** los 3 vales del propietario (VS-000001/000002-2026 Puerto
   Padre, VS-000023-2026 TIENDA CENTRAL) permanecen intactos mientras no se
   confirme la titularidad (interacción con la decisión de vales 2026-10-21,
   §6 del registro). Ninguna ruta de borrado los incluye.
4. **Reglas de oro heredadas:** listas protegidas A y B intocables; borrado
   solo por rutas oficiales con dry-run + evidencia fechada; verificación
   posterior con `data-hygiene-guard`; cero CASCADE hacia protegidos.

## 2. Listas protegidas (contexto obligatorio de toda ejecución)

| Lista | Contenido exacto | Trato |
|---|---|---|
| **A — Tiendas reales (3)** | `d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576` TIENDA CENTRAL COSTPRO · `43a4dabc-b8b4-4b66-82b3-0c75335ca5d1` Puerto Padre VITALLCONS · `5e6fe821-5465-48b1-b3f1-3aa3182edc38` ENERVIDA-VITALLCONS | INTOCABLES — verificación UUID a UUID antes y después |
| **A — Usuarios reales (8)** | cajero/almacen/encargado/admin/costo @demo.com · `8c90b7b8-…` adrianpompasantana@gmail.com · `051c6157-…` admin@costpro.com · `28ebdfa1-…` belkis9999@gmail.com | INTOCABLES |
| **B — Usuarios personales (3)** | tery201194@, ronaldoguerra984@, juanmanuelcabreravargas@ (gmail) | INTOCABLES |
| **C — Patrones E2E residuales** | Inventario del 2026-10-05: 2.577 tiendas / 359 usuarios por patrón inequívoco | SEPARADA de L1/L2/L3; gestionada por scripts de reconciliación/higiene con sus propios guards — no incluida en este plan |
| **Pilotos E2E persistentes (2)** | `e711cebc-8df7-4f12-be6e-873176c7960f` E2E PILOT A · `b5fed991-8357-4edf-88b3-18095369100e` E2E PILOT B | Protegidos por config (`e2e/config/protected-resources.json`); solo se tocan por decisión separada |

Fuente: `docs/audits/E2E-DATA-CLEANUP-INVENTORY.md` (FASE 5, 2026-10-05).

## 3. Inventario exacto de los lotes

### Lote L1 — 6 tiendas D-indeterminadas

| # | store_id (UUID) | Nombre | Evidencia de clasificación D |
|---|---|---|---|
| 1 | `11111111-1111-1111-1111-111111111111` | Tienda Auditor | Creada 2026-06-19, activa=false, archivada, 5 productos, 0 transacciones; sin patrón E2E ni evidencia de negocio real |
| 2 | `2ef293a3-23b4-4816-aa2b-9752627a1175` | No Address | Nombre basura; creada 2026-07-13 por admin@costpro.com; archivada |
| 3 | `2dabe459-4b37-4be2-b8f4-d102047cc18a` | `   ` (nombre en blanco) | Ídem |
| 4 | `dcfd74bf-ebfa-4630-b532-ebbd4c5b42a2` | Store Tenant 2 | Creada 2026-08-06, inactiva, archivada, 1 producto, 0 transacciones |
| 5 | `a5b81cbf-8ffc-4525-8ac4-f2ec92b912d2` | QA-H1-A | Creada 2026-10-04, activa, 2 productos, **349 transacciones** |
| 6 | `b9cfacda-3731-47a2-8588-f524c6ec3456` | QA-H1-B | Creada 2026-10-04, activa, 1 producto, **20 transacciones** |

**Advertencia L1:** QA-H1-A y QA-H1-B son las de mayor volumen (369 transacciones
juntas). Son tiendas de pruebas de la fase H1 (QA), pero su borrado elimina esas
transacciones de los conteos globales — los informes históricos que las citan
(p. ej. pruebas de accesibilidad H1) quedarán referenciando entidades inexistentes.
Efecto contable: NINGUNO (no son tiendas de negocio); efecto de cuota: libera
plazas de tienda del tenant. Si el propietario prefiere conservarlas como archivo
de QA, puede autorizar un sub-lote L1a (4 tiendas archivadas sin transacciones) y
diferir L1b (QA-H1-A/B) — el plan admite esa partición.

### Lote L2 — 16 usuarios D-indeterminados

| # | user_id (UUID) | Email | Patrón |
|---|---|---|---|
| 1 | `d9ad29df-ba36-488c-b912-6e4cd3371dee` | auditor@costpro.test | test manual externo posible |
| 2 | `f5fa6d11-61a8-41eb-9e09-f5ce0d1da83d` | f243he2en2ejpm@uberip.com | @uberip.com |
| 3 | `0a9e3d54-7729-4e5c-ab7d-7e7f57106292` | f244ab40u9o0m@uberip.com | @uberip.com |
| 4 | `bfcbc06d-1bd7-4a43-916f-0a4891c169a0` | f244zxe5gmk@uberip.com | @uberip.com |
| 5 | `ccff0c17-b436-4ecc-95dd-a53bdfe051d2` | f244bc7klbb6p@uberip.com | @uberip.com |
| 6 | `a491c932-1c4e-491f-a006-093b692b7c5e` | f244beh00he8i@uberip.com | @uberip.com |
| 7 | `4ac61783-a99c-46ab-ae3f-5e110471cb39` | g3g3af38ck3v6@uberip.com | @uberip.com |
| 8 | `db311037-7527-4647-9ecf-1d1ef0813520` | g3g3b4isid7xo@uberip.com | @uberip.com |
| 9 | `ca0f16d1-f067-4b2d-9126-396e06dc36d4` | f246empresa01@uberip.com | @uberip.com |
| 10 | `819fdf44-568e-4e84-8ba9-4c3a590461fb` | qa-acc-center@costpro.test | QA manual |
| 11 | `5554101c-25a4-4694-b59f-bd8712b87f80` | qa-nav-defaults@costpro.test | QA manual |
| 12 | `6eb29691-d253-4e03-b593-2b0cdd1415bc` | qa.h1.a@costpro.test | QA H1 |
| 13 | `8b04b1a9-80c3-444e-952b-b0256155d65` | qa.h1.b@costpro.test | QA H1 |
| 14 | `a4c8c759-bbf8-48ab-a45a-24c0ead4f3fc` | qa.h1.sup@costpro.test | QA H1 |
| 15 | `db818264-0525-4c25-80f6-b00b7ef74415` | qa.h1.enc@costpro.test | QA H1 |
| 16 | `c0000000-0000-0000-0000-00000000000c` | user_c@tenant_b.com | cuenta de prueba de tenant |

**Nota L2:** los perfiles `@uberip.com` (8) coinciden con los 8 self-signups
clasificados SIN EVIDENCIA en la matriz DT-03 (los otros NULL de CP-SEC-010).
Su borrado como residuos E2E/QA **no** es una decisión de CP-SEC-010 (esa tarea
trata de `tenant_id` NULL, no de existencia); si el propietario los considera
cuentas humanas reales, puede excluirlos de L2 — el plan se re-presenta como
L2 minus 8. La FK `profiles_id_fkey` es `ON DELETE NO ACTION`: el borrado debe
usar la RPC oficial `e2e_hard_delete_user` (auth.users + profile + dependencias
en una vía transaccional con sign_out previo — patrón probado el 2026-10-09).

### Lote L3 — Residuos del 9-oct (runner E2E, RUN IDs del framework)

| Tipo | Recurso exacto | Ventana UTC | RUN ID |
|---|---|---|---|
| Tiendas ×2 | `E2E PILOT A/B CostPro E2E-20261009-D0978E` (1 producto c/u) | 01:36, 9-oct | D0978E |
| Usuarios ×4 | `e2e-e2e20261009d0978e-{adm,usr,wh,enc}@costpro.test` | 01:36, 9-oct | D0978E |
| Tiendas ×6 | `E2E Multi *` (perm / rls1 / blki / blkd2 / blkd1 / del) | 01:52–01:57, 9-oct | tenants 8DEF57 / 7DAE03 |
| Tenants ×2 vivos | `E2E TENANT E2E-20261009-8DEF57` y `E2E TENANT E2E-20261009-D0978E` | 01:36–01:57, 9-oct | 8DEF57 / D0978E |
| Tenants ×1 ya eliminado | `E2E TENANT E2E-20261009-7DAE03` | — | reconciliado externamente durante la intervención del 9-oct (verificado ausente) |

Fuente: `docs/audits/E2E-FIXTURE-REUSE-TRIGGER-INVESTIGATION.md` §6 (snapshot
read-only con `fase0_snapshot.py`, Management API) + verificación post-implementación
del mismo documento. Vía de limpieza autorizable documentada allí:
`node e2e/scripts/reconcile-orphan-runs.ts --run-id E2E-20261009-D0978E` y, para las
`E2E Multi *`, borrado RPC por UUID tras re-verificación + guard AFTER.

### Lote L4 — EXCLUIDO (referencia)

3 vales manuales del propietario: `VS-000001-2026` y `VS-000002-2026` (Puerto Padre,
reversed) y `VS-000023-2026` (TIENDA CENTRAL, completed). **Intactos** mientras no
se confirme la titularidad (resolución A.1). Ningún comando de este plan los toca;
el filtro por RUN ID / listas UUID explícitas no puede alcanzarlos por construcción.

## 4. Protocolo de verificación de titularidad (pre-ejecución, por lote)

Antes de presentar cada lote para autorización (y de nuevo justo antes de ejecutar,
si la autorización es de otro día):

1. **Existencia e identidad viva:** consulta read-only (Management API, patrón
   `scripts/ci-fix/db.py` que rechaza todo lo que no sea SELECT/WITH/EXPLAIN/SHOW)
   de cada UUID: confirmar que sigue vivo y que nombre/email/creación/estado
   coinciden con la evidencia de este plan. Cualquier discrepancia → la entidad
   sale del lote y se re-presenta aparte.
2. **Sin actividad de negocio nueva:** transacciones/movimientos/vales desde el
   corte de la evidencia. QA-H1-A/B: verificar que sus 349/20 transacciones siguen
   siendo las de la fase QA (fechas ≤ 2026-10-04) y que no hay actividad posterior.
   Si hay actividad nueva → excluir y re-triar.
3. **Sin pertenencia a protegidos:** ningún usuario de L2 es miembro de tienda A;
   ninguna tienda de L1 tiene memberships de usuarios A/B. Verificación por cruce
   de `user_store_memberships` con las listas protegidas.
4. **Cruce con CP-SEC-010:** los 8 `@uberip.com` de L2 siguen siendo los mismos
   UUID clasificados SIN EVIDENCIA; el borrado no cambia el criterio DT-03 (los
   NULL restantes no se tocan salvo david9999 por su propio expediente A7).
5. **Snapshot ANTES:** exportación fila a fila (JSON fechado, patrón
   `evidence/fase0_snapshot`) de cada entidad + sus dependencias (memberships,
   productos, transacciones, vales) — base de la reversión (§7).

## 5. Salvaguardas de ejecución (por lote, cuando esté autorizado)

1. **Dry-run obligatorio primero:** cada script/ruta se ejecuta en modo dry-run;
   el reporte debe listar EXACTAMENTE los UUID del lote autorizado (0 entidades
   fuera de lista; si aparece algo más → ABORT y re-presentación).
2. **Rutas oficiales únicamente:** L2 y usuarios de L3 → RPC `e2e_hard_delete_user`
   (transaccional, sign_out previo, patrón 2026-10-09 §3b); L3 runs →
   `reconcile-orphan-runs.ts --run-id …` (guard de protegidos activo); L1 →
   script de borrado por UUID con las guardas FATAL de protegidos por
   UUID/nombre (patrón `hard-cleanup.ts` del PR #1386). Nada de SQL ad-hoc.
3. **Guard de protegidos activo durante TODO el proceso**
   (`e2e/config/protected-resources.json`): verificación A/B/pilotos antes y
   después, UUID a UUID.
4. **Ventana sin actividad E2E:** los jobs E2E de CI ya están deshabilitados
   (`if: false`, decisión del 9-oct); ejecutar igualmente fuera de corridas
   manuales y verificar 0 recursos creados en los últimos 5 min antes de empezar
   (patrón del incidente §1, 01:16).
5. **Evidencia fechada:** JSON de antes/después + log completo + conteos globales
   (stores/users/tenants) en `docs/audits/evidence/<fecha>-limpieza-lX/`.
6. **data-hygiene-guard AFTER:** `npm run test:e2e:hygiene` debe quedar en verde
   o con residuos documentales explícitos (residuos preexistentes no cubiertos
   por el lote).

## 6. Criterios de éxito (por lote)

| # | Criterio | Verificación |
|---|---|---|
| 1 | Dry-run lista exactamente los UUID autorizados del lote (0 fuera de lista) | Reporte dry-run archivado |
| 2 | Delta de conteos = tamaño exacto del lote (p. ej. L1: stores −6; L2: users −16; L3: stores −8, users −4, tenants −2) | Consulta conteos antes/después |
| 3 | Listas protegidas A/B + pilotos intactas UUID a UUID | Verificación post-ejecución §5.3 |
| 4 | ENERVIDA/Puerto Padre/TIENDA CENTRAL sin cambios en productos/transacciones/movimientos/vales | Invariante de integridad (patrón §4 del 9-oct) |
| 5 | data-hygiene-guard verde o residuo documentado | Log del guard |
| 6 | Evidencia completa archivada + CSV/informe actualizados | Directorio de evidencia fechado |
| 7 | L4 sin tocar | Los 3 vales presentes, mismos estados |

## 7. Reversión (honestidad sobre el borrado duro)

El borrado por UUID/RPC es **duro**. La estrategia de reversión es en capas:

1. **Capa 1 — Snapshot fila a fila:** el export pre-borrado (§4.5) contiene los
   registros completos y sus dependencias; la restauración selectiva sería una
   escritura gobernada (requeriría autorización expresa, como toda escritura).
2. **Capa 2 — PITR de Supabase:** el proyecto tiene backups con retención
   (dashboard de Supabase → Database → Backups); si un lote resultara erróneo,
   el propietario puede restaurar a un punto anterior a la ejecución. **Coste
   honesto:** PITR revierte TODA la base de datos (afectaría operaciones reales
   posteriores a ese punto) — por eso los lotes son pequeños, secuenciales y con
   verificación entre lote y lote.
3. **Capa 3 — Partición deliberada:** L1/L2/L3 son lotes independientes; un error
   en uno no obliga a tocar los otros. La partición L1a/L1b (§3) reduce aún más
   el radio.
4. **Los vales (L4) no se borran**, luego no hay nada que revertir en ellos.

## 8. Presentación para autorización (formato por lote)

Para CADA lote, el agente presentará al propietario: (a) la tabla de UUIDs exactos
de este plan (actualizada con la verificación viva del §4, con fecha de corte);
(b) el dry-run; (c) los comandos exactos a ejecutar; (d) la fecha/hora propuesta
(fuera de actividad); (e) el efecto esperado sobre conteos y cuota. El propietario
responde por lote (p. ej. «autorizo L2, difiero L1b»); solo los lotes con
autorización EXPRESA se ejecutan, y se ejecutan en el orden decidido por él.

**Este documento NO es una autorización.** Ningún comando de limpieza se ejecutó
ni se ejecutará hasta la autorización expresa por lote del propietario.

## 9. Efecto esperado tras la limpieza (contexto para decidir)

- **Cuota de tiendas del tenant liberada:** 6 (L1) + 8 (L3) plazas de tienda
  dejan de consumir cuota.
- **Guard de fixtures desbloqueado:** el guard AFTER de reutilización de
  fixtures falla mientras existan residuos preexistentes sin autorizar; limpiar
  L1/L2/L3 permite que el flujo de reutilización de fixtures (FASE 5 del
  E2E-FIXTURE-REUSE) quede en verde — prerrequisito para la Misión D original
  del plan de correcciones (red E2E aislada, CP-INFRA-011/001/006).
- **Ruido de inventario reducido:** los D-indeterminados dejan de aparecer en
  barridos de higiene y en la cuenta global de recursos compartidos.

## 10. Trazabilidad de fuentes

- `docs/audits/E2E-DATA-CLEANUP-INVENTORY.md` (FASE 5, 2026-10-05): clasificación
  A/B/C/D con regla de oro; tablas D de tiendas/usuarios.
- `docs/audits/e2e-contamination-cleanup-20261009.md`: incidente del 9-oct,
  método de reconciliación por RUN ID + RPC por UUID, invariantes post-limpieza.
- `docs/audits/E2E-FIXTURE-REUSE-TRIGGER-INVESTIGATION.md` §6: residuos del 9-oct
  con RUN IDs D0978E/8DEF57/7DAE03 y su vía de limpieza autorizable.
- `docs/decisions/2026-10-21-decision-propietario-vales.md`: L4/vales.
- `docs/decisions/2026-10-21-resolucion-propietario-mision-c.md`: política A.1.
- `docs/decisions/2026-10-21-propuestas-pendientes.md` PD-1: opciones y salvaguardas.
