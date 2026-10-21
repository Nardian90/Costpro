# MISIÓN C — CONCILIACIÓN DE DECISIONES DEL PROPIETARIO Y PREPARACIÓN DEL REGISTRO FORMAL (COSTPRO 4 MULTITIENDA)

**Fecha:** 2026-10-21 · **Base verificada:** `main` @ `e6dfd885b` (fusión PR #1439 por el propietario)
**Tipo de misión:** análisis y documentación. **Sin cambios funcionales, sin escrituras de base de datos, sin migraciones, sin fusiones, sin pushes.**
**Objetivo:** conciliar en el inventario maestro las decisiones previstas en el plan priorizado, recuperar las ya ratificadas y preparar el registro formal que desbloquee las Misiones D, E y F sin repetir investigaciones ni inventar decisiones.

---

## 1. Contexto respetado

- **Misión B (CP-SEC-012) cerrada el 2026-10-21** con evidencia de código y pruebas (`MISION_B_VERIFICACION_CP-SEC-012_2026-10-21.md`, SHA e6d885, 24/24 tests). BUG-013/017/022/024 NO se reabren; sus riesgos residuales (índice A4, skip E2E obsoleto, sonda de despliegue) siguen documentados y se tratan como tareas independientes del expediente CP-SEC-027 v5.
- **Observación A2 vigente** hasta su fecha de cierre aprobada. En esta misión no se tocaron workflows, scripts, configuración ni evidencias de A2.
- Los cambios documentales de la Misión B sin commit (inventario fila CP-SEC-012 + informe + evidencia) permanecen **intactos**; esta misión no los sobrescribe.
- **Regla de alcance:** se conservan los identificadores CP-* originales; no se creó ningún ID nuevo para decisiones ya registradas.

## 2. Método de trabajo

Para cada ID del alcance se determinó uno de cinco estados, citando documento, sección, fecha y, cuando corresponde, PR o commit:

| Estado | Criterio |
|---|---|
| `DECISIÓN RATIFICADA` | El propietario la aprobó y existe evidencia documental verificable. |
| `DECISIÓN REGISTRADA, EFECTO PENDIENTE` | Existe la decisión, pero falta identificar/ejecutar cómo se traduce en tareas o controles. |
| `PENDIENTE DEL PROPIETARIO` | Requiere una decisión nueva. |
| `PENDIENTE DE DATOS` | Requiere papeles, Excel, identificaciones comerciales, costes u otra evidencia no disponible. |
| `NO APLICA / YA RESUELTA` | Evidencia suficiente de cierre o de fuera de alcance. |

**Fuentes consultadas (solo lectura):** inventario maestro vigente (2026-10-16, actualizado M2), `docs/decisions/` (inexistente hasta esta misión — se propone su creación), `docs/audits/DECISIONES_PENDIENTES_MISION_C_2026-10-18.md`, `DECISION_A_STOCK_NEGATIVO_2026-10-20.md`, `DECISION_B1_ADMIN_GLOBAL_2026-10-20.md`, `evidence/20261020-mision-c-cierre/INFORME.md`, `CP-SEC-027_v5_INFORME_DECISIONES_2026-10-21.md`, `CP-SEC-027_MISION_DECISION_INFORME_2026-10-21.md`, `MISION_B_VERIFICACION_CP-SEC-012_2026-10-21.md`, `E2E-DATA-CLEANUP-INVENTORY.md`, `E2E-FIXTURE-REUSE-TRIGGER-INVESTIGATION.md`, `e2e-contamination-cleanup-20261009.md`, `AUDITORIA_IPV_INGRESOS_POR_VENTAS.md` §5/§15, `AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md` §6.2/§8, `USER_RECONCILIATION_DESIGN.md`, `TENANT_ARCHITECTURE_DECISION.md`, `MISION_CATALOGO_ENTRADA_SKU139_PRECIO_SKU108.md`, `PLAN_PRIORIZADO_CORRECCIONES_COSTPRO_2026-10-16.md` e historial git de PRs fusionados (#1410–#1439).

**Distinción aplicada en todo el informe:** decisión EXPRESA del propietario ≠ recomendación técnica del agente. Ninguna recomendación técnica citada equivale a autorización de ejecución.

**Limitación declarada:** en esta misión no se consultó la BD viva (no se dispuso de credenciales en el sandbox y la misión es documental); todo estado de datos citado proviene de evidencia documental fechada de misiones anteriores con verificación viva (19–21/10), referenciada en cada caso.

## 3. Conciliación por ID

### 3.1 CP-INV-005 — Política de stock negativo → `DECISIÓN RATIFICADA`

- **Decisión:** la política actual ES la canónica — el sistema **nunca** admite stock negativo; toda regularización pasa por `process_inventory_adjustment` auditado. Sin banderas de excepción; sin relajar restricciones.
- **Evidencia:** `DECISION_A_STOCK_NEGATIVO_2026-10-20.md` (ratificada por el propietario, prompt v2 cierre CP-SEC-027 fase 9, 2026-10-20); alternativas en `DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` §A (2026-10-18); integración en `main` vía PR #1431 fusionado por el propietario (merge `cc4ce985f`, verificado vía API en Misión B); las 4 divergencias históricas (SKU 113/127/135/141) ya reconciliadas (`evidence/20261018-reconciliacion-stock/`).
- **Política de negocio vs. mecanismo técnico:** la política (nunca negativo) queda ratificada; el mecanismo (CHECKs BD + RPC gobernado + lock DF-06 + tests de regresión) ya está vigente y no requirió cambio alguno. **No se implementó nada nuevo en esta misión.**
- **Efecto pendiente:** regularización de artefactos QA restantes (~10 productos de prueba en TIENDA CENTRAL; 41 divergencias actuales, todas de pruebas/QA) — tarea de higiene separada con autorización por lote del propietario (Misión F: ajustes CP-INV-005/006).

### 3.2 CP-DATA-001 — Limpieza de datos E2E/QA por lotes → `PENDIENTE DEL PROPIETARIO`

- **Conciliación:** no existe decisión del propietario sobre los lotes. La regla de oro del repo (no borrar sin confirmación humana) sigue vigente y fue respetada: **en esta misión no se borró ni alteró ningún dato**.
- **Datos candidatos delimitados (§documental):** L1 = 6 tiendas D-indeterminadas; L2 = 16 usuarios D-indeterminados; L3 = residuos del 9-oct (8 tiendas + 4 usuarios + 3 tenants; RUN IDs `D0978E`/`8DEF57`/`7DAE03`); L4 = 3 vales manuales del propietario (VS-000001/000023/000002) excluidos por regla de oro — solo requieren confirmación de titularidad.
- **Salvaguardas de aislamiento a aprobar:** listas protegidas A/B intocables; borrado solo vía `reconcile-orphan-runs.ts --run-id` con dry-run y evidencia fechada; verificación con `data-hygiene-guard`; cero CASCADE.
- **Evidencia:** `E2E-DATA-CLEANUP-INVENTORY.md` (§ tiendas/usuarios D, 2026-10-05/09), `E2E-FIXTURE-REUSE-TRIGGER-INVESTIGATION.md` §6/§9.2, `e2e-contamination-cleanup-20261009.md` §5, ficha de inventario CP-DATA-001 (2026-10-16).

### 3.3 CP-SEC-010 — DT-03: modelo operativo de tenant → `DECISIÓN RATIFICADA — EFECTO PARCIAL`

- **Conciliación:** existe decisión previa del propietario — **arquitectura multi-tenant conservada; single-tenant solo como descripción operativa actual**. Confirmada 2026-10-19 con protocolo de 6 pasos ejecutado y evidencia viva (`evidence/20261019-dt03-matriz-acceso/INFORME.md`; matriz 30×43×24×8; pruebas T1–T7). **Sin contradicción concreta que obligue a reabrirla**; el documento `TENANT_ARCHITECTURE_DECISION.md` (2026-08-02, «pendiente», recomendaba «status quo») quedó sustituido y necesita solo anotación de cierre documental.
- **11 perfiles pendientes:** NO se asignó automáticamente ningún tenant. Estado conciliado: david9999 = backfill EJECUTADO (2026-10-19 18:29:50Z, transaccional + auditado; autorización original D-3 conversacional) → **ratificación a posteriori pendiente (A7 del expediente CP-SEC-027 v5)**; 10 perfiles restantes clasificados SIN EVIDENCIA → validación individual exigida por la propia decisión DT-03.
- **Relación con el expediente CP-SEC-027 documentada sin extrapolación:** A7 cierra un efecto residual de DT-03; CP-SEC-025 (convergencia RLS), CP-SEC-026 y CP-SEC-027 son tareas derivadas ya registradas con ficha propia.

### 3.4 CP-SEC-011 — DT-06: reconciliación de auth.users huérfanos → `PENDIENTE DEL PROPIETARIO`

- **Conciliación:** el diseño (`USER_RECONCILIATION_DESIGN.md`, 2026-08-02, «Diseño (pendiente aprobación)») sigue sin aprobación. DT-06 **no figuró** en ninguna de las decisiones ratificadas de octubre (A/B/B.1/C/D/E) — no hay decisión previa que respetar ni reabrir.
- **Estado técnico documentado:** FK `profiles_id_fkey ON DELETE NO ACTION` (huérfanos posibles); 364 huérfanos ya limpiados a mano; panel manual `OrphanUsersPanel.tsx` existente; implementación exige salvaguardas (ban list de pilotos A/B, audit log).
- **Opciones preparadas:** ver §5 (matriz) y PD-2 del registro propuesto.

### 3.5 CP-INV-002 — Productos sin datos comerciales → `PENDIENTE DE DATOS`

- **Conciliación:** el mecanismo está probado con precedente verificado del 2026-10-17 (PR #1418): creación SKU 178–181, corrección de nombres 158/162/176 y precio SKU 108 → 12.000 CUP por flujos oficiales, sin inventar datos. Lo que falta es el **dato comercial oficial** (precio/costo/nombre final) para los SKUs con `price=0/cost=0` (160–177 y otros marcados «Incompleto»).
- **Evidencia:** `REGISTRO_MOVIMIENTOS_2026-10-14_15…` D-5; `MISION_CATALOGO_ENTRADA_SKU139_PRECIO_SKU108.md` (todas las tareas COMPLETADAS y verificadas contra BD); ficha de inventario CP-INV-002.

### 3.6 CP-INV-003 — `unit_cost=1 CUP` placeholder en 13 recepciones → `PENDIENTE DE DATOS`

- **Conciliación:** sin costos reales aportados (facturas o declaración del negocio) no es posible corregir sin inventar valores — bloqueo registrado. La corrección, cuando haya datos, sigue el protocolo gobernado ya probado (UPDATE auditado + recálculo WAC con `wac_change_log` + delta 0).
- **Evidencia:** `REGISTRO_MOVIMIENTOS…` D-6; ficha de inventario CP-INV-003.

### 3.7 CP-INV-004 — Precios de catálogo obsoletos (P1) → `PENDIENTE DE DATOS`

- **Conciliación:** desvíos documentados (SKU 92: catálogo 30 vs venta 23.700; SKU 134: 5 vs 3.950; SKU 111: 2.500 vs 2.000) siguen sin corregir porque falta el **precio oficial vigente** de cada SKU. La detección original cubrió solo 3 SKUs; puede haber más (auditoría extendida pendiente de datos). El gate de supervisor seguirá inoperativo mientras el catálogo conserve precios viejos.
- **Evidencia:** `REGISTRO_MOVIMIENTOS…` D-3/D-4; precedente de actualización oficial (SKU 108, 2026-10-17, PR #1418).

### 3.8 CP-IPV-001 — Autorización de backfill del ledger → `PENDIENTE DEL PROPIETARIO` (no ejecutar)

- **Conciliación:** no existe decisión ratificada sobre el backfill del ledger. La auditoría IPV dejó constancia expresa de que el backfill «requeriría escritura en datos de producción» y quedó FUERA de alcance (`AUDITORIA_IPV…` §15.1); el diseño del informe declara que las diferencias «se reportan — NUNCA se ocultan».
- **Delimitación crítica (documentada, sin extrapolación):** este backfill de LEDGER es distinto del backfill de COGS (Decisión C → paquete C `20261020000004`, que atiende CP-IPV-002 con autorizaciones A5/A6 del expediente CP-SEC-027 v5). La aprobación contable de los 8 valores WAC (A5) NO autoriza el backfill de ledger. Las 26 PRICE_ANOMALY de ENERVIDA se resuelven en origen (precios de catálogo — solapa con CP-INV-004), no dentro del IPV.
- **Precondiciones identificadas (propuestas, ninguna ejecutada):** (1) inventario de incidencias por tienda/tipo con conteo fechado (baseline antes); (2) evidencia contable de apertura por tienda/período (papel/Excel de carga inicial) — sin ella no hay valor de apertura legítimo; (3) escritura aditiva marcada `backfill` (origen + fecha + autorización en metadata), jamás UPDATE de movimientos existentes; (4) reversibilidad (eliminación limpia de los movimientos de backfill); (5) verificación con `verificar_ipv_en_vivo.ts` antes/después; (6) autorización específica por tienda/lote, separada de cualquier otra autorización.
- **Evidencia:** `AUDITORIA_IPV_INGRESOS_POR_VENTAS.md` §5/§15; `INCIDENTE_IPV…` §D; ficha de inventario CP-IPV-001; `CP-SEC-027_v5_INFORME_DECISIONES_2026-10-21.md` §3 (paquete C ≠ ledger).

### 3.9 CP-DATA-005 — Pares neto-cero no representables → `PENDIENTE DEL PROPIETARIO`

- **Conciliación:** pares filas 569+570 (anticipo OT ±700 USD), f536/f537 (venta+DV), f790/f791 (DV+VS) documentados deliberadamente sin registro; sin efecto económico (neto 0). Existe una **decisión técnica previa documentada** (mantener sin registro por valor dudoso del registro a fecha actual, sistema forward-only), pero no una decisión de negocio formal de cierre — se eleva como decisión formal de cierre, no como nueva investigación.
- **Evidencia:** `ENERVIDA-EXCEL-IMPORT.md` §7.3; `AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md` §6.2/§11.9.4/§11.9.5.

### 3.10 CP-DATA-006 — 20 filas de comisiones de julio con tarifa antigua → `PENDIENTE DEL PROPIETARIO` (+ de datos si se reconstruye)

- **Conciliación:** ConfComisiones importada como configuración VIGENTE; reconstrucción histórica documentada como fuera de alcance (§6.5/§11.9.5). La reconstrucción solo procede si el propietario aporta la escala de tarifas de julio de 2026 por SKU; en su defecto, queda la aceptación documentada.
- **Evidencia:** `AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md` §8/§11.9.5.

### 3.11 CP-CAT-006 — Backfill de `service_type_id` en históricos → `PENDIENTE DEL PROPIETARIO`

- **Conciliación:** servicios históricos con `service_type_id=NULL` (subestimación del contador de uso); el backfill por nombre no se ejecutó por diseño (no alterar históricos sin autorización). No existe decisión del propietario. Opciones: backfill gobernado autorizado o decisión formal de mantener históricos intactos.
- **Evidencia:** `AUDITORIA_SERVICIOS_RECIBIDOS…` §13.1; ficha de inventario CP-CAT-006.

### 3.12 Decisiones previas respetadas y no replanteadas

- **BUG-024 (persistencia en `audit_logs`, `action='legal_incident'`):** ratificada 2026-10-20 e implementada (PR #1431). La elección de persistencia NO se vuelve a plantear. Residuales (A4 índice, specs E2E, sonda) permanecen como tareas independientes del expediente.
- **DT-03:** ver §3.3. Los 11 perfiles pendientes NO fueron asignados automáticamente.
- **Decisiones del expediente CP-SEC-027 v5** (A1–A8): se citan únicamente por su relación con IDs CP-* (A7↔CP-SEC-010; A5/A6↔CP-IPV-002; A4↔CP-SEC-012), sin tratarlas como autorizaciones de otras tareas ni como resueltas por esta misión.

## 4. Registro de decisiones preexistentes (fuentes verificables)

| Decisión | Fecha | Ratificada por | Fuente primaria | Integración en `main` | Estado del efecto |
|---|---|---|---|---|---|
| **B — DT-03 modelo tenant** (multi-tenant conservado; single-tenant solo descriptivo) | 2026-10-19 | Propietario (confirmación expresa) | `DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` §B | Protocolo 6 pasos en `evidence/20261019-dt03-matriz-acceso/` | Efecto parcial: A7 pendiente + 10 perfiles sin evidencia + CP-SEC-025/026/027 abiertas |
| **A — stock negativo** (nunca negativo; ajustes gobernados) | 2026-10-20 | Propietario (prompt v2, fase 9) | `DECISION_A_STOCK_NEGATIVO_2026-10-20.md` | PR #1431 (merge `cc4ce985f`) | Efecto pendiente: lotes de higiene QA con autorización propia |
| **B.1 — alcance del admin** (global documentado hoy; acotado por tenant en SaaS) | 2026-10-20 | Propietario (prompt v2, fase 9) | `DECISION_B1_ADMIN_GLOBAL_2026-10-20.md` | PR #1431; Fase 7 en PR #1430 (REVOKE aplicado en producción) | Vigente; disparador de revisión = primer tenant cliente real |
| **D — BUG-024 persistencia** (`audit_logs`, action `legal_incident`) | 2026-10-20 | Propietario | `DECISIONES_PENDIENTES…` §D + `20261020-mision-c-cierre/INFORME.md` §D | PR #1431 fusionado por el propietario; verificado 8/8 en Misión B | Residuales como tareas independientes (A4, specs, sonda) |
| **C — COGS con evidencia** (derivación aditiva, sin mutar originales) | Preparada 2026-10-20; **aprobación contable PENDIENTE** | — (propuesta técnica) | `DECISIONES_PENDIENTES…` §C + `PAQUETE_C_COGS_DERIVED.md` | Migración `20261020000004` PREPARADA, NO aplicada | Pendiente A5 (8 valores WAC) + A6 (despliegue) — atiende CP-IPV-002, NO el ledger |
| **E — migración `20261018000000` + PR #1422** | Merge RESUELTO por el propietario | Propietario (fusión) | `DECISIONES_PENDIENTES…` §E; `MISION_POLITICA_TEMPORAL_INFORME_FINAL_2026-10-18.md` | PR #1422 fusionado (merge `15eebf46b`) | Migración NO aplicada a BD viva; baselines expiran 2026-11-30 (deuda R1/CP-INFRA-018) |

*(Tabla completa con responsables y efectos por ID en `docs/decisions/` — propuesto en §8.)*

---

## 5. Matriz de decisiones

> Estados según §2. Ninguna opción ha sido seleccionada en nombre del propietario; las
> recomendaciones técnicas del agente (§10) están separadas de esta matriz y no
> constituyen decisiones ni autorizaciones.

| ID | Decisión requerida | Estado actual | Evidencia y fuente | Opciones viables | Consecuencia contable/técnica | Dependencias desbloqueadas | Acción solicitada al propietario |
|---|---|---|---|---|---|---|---|
| **CP-INV-005** | Política de stock negativo | **DECISIÓN RATIFICADA** (efecto pendiente) | `DECISION_A_STOCK_NEGATIVO_2026-10-20.md`; PR #1431 (merge `cc4ce985f`); `evidence/20261018-reconciliacion-stock/` | Ya decidida: nunca negativo. Solo queda elegir el lote de ajustes QA a regularizar (uno a uno o por lote) | Ajustes auditados vía `process_inventory_adjustment`; cero cambio de esquema | Misión F (ajustes CP-INV-005/006) | Autorizar por lote la regularización de artefactos QA (~10 productos de prueba en TIENDA CENTRAL) |
| **CP-DATA-001** | Limpieza E2E/QA por lotes | **PENDIENTE DEL PROPIETARIO** | `E2E-DATA-CLEANUP-INVENTORY.md` (§D listas exactas, 2026-10-05/09); `e2e-contamination-cleanup-20261009.md` §5 | (1) borrado por lotes con autorización individual; (2) autorización masiva L1+L2+L3; (3) conservar y documentar; (L4) confirmar los 3 vales como propios | (1) trazabilidad fina, libera cuota de tiendas y guard de fixtures; (2) menos control fino, reversión manual si un D fuera real; (3) guard bloqueado y cuota consumida | Misión D completa (CP-INFRA-011→001/006/009); CP-DATA-003 | Decidir por lote (L1/L2/L3) y confirmar titularidad de los 3 vales (L4) |
| **CP-SEC-010** | DT-03: modelo operativo de tenant | **DECISIÓN RATIFICADA — EFECTO PARCIAL** | `DECISIONES_PENDIENTES…` §B (confirmada 2026-10-19); `evidence/20261019-dt03-matriz-acceso/INFORME.md` (protocolo 6 pasos, pruebas T1–T7) | Ya decidida. Residual: ratificar (Opción 1) o revertir (Opción 2) el backfill david9999 — ficha A7 del expediente | Ratificar: cierre del expediente DT-03; revertir: reintroduce el único NULL demostrable (sin corrección de defecto) | Misión E (CP-SEC-025 convergencia RLS, CP-SEC-026); validación individual de 10 perfiles | Ratificación expresa del backfill david9999 (A7); aportar evidencia individual para los 10 perfiles NULL restantes |
| **CP-SEC-011** | DT-06: aprobación reconciliación de huérfanos | **PENDIENTE DEL PROPIETARIO** | `USER_RECONCILIATION_DESIGN.md` (2026-08-02, «pendiente aprobación»); sin decisión en sets de octubre | (1) implementación completa (tabla + cron + auto-delete con ban list); (2) solo detección + borrado humano (`OrphanUsersPanel.tsx` existe); (3) diferir | (1) 0 huérfanos >24 h; superficie nueva en BD; (2) menor riesgo, depende del operador; (3) acumulación posible persiste | Misión E (higiene de usuarios, junto a CP-SEC-020) | Aprobar una de las 3 opciones (con salvaguardas de pilotos A/B si 1 o 2) |
| **CP-INV-002** | Datos comerciales faltantes (precios/costos/nombres) | **PENDIENTE DE DATOS** | `REGISTRO_MOVIMIENTOS…` D-5; precedente verificado: `MISION_CATALOGO_ENTRADA_SKU139_PRECIO_SKU108.md` (PR #1418, 2026-10-17) | (con datos) (1) actualización por flujo oficial; (2) actualización + recepción de costo (recalcula WAC); (3) baja de SKUs no vendibles | Sin datos: ventas posibles a precio 0 y márgenes distorsionados; con datos: corrección auditada (`trigger_audit_product_changes`) | Misión F (fase de catálogo) | Aportar lista oficial de precios/costos/nombres por SKU (papel o Excel) |
| **CP-INV-003** | Costos reales de 13 recepciones (placeholder = 1 CUP) | **PENDIENTE DE DATOS** | `REGISTRO_MOVIMIENTOS…` D-6 | (con datos) (1) corrección gobernada + recálculo WAC con `wac_change_log`; (2) marcar como provisional (columna derivada, sin mutar original); (3) aceptar distorsión anotada | Sin datos: WAC/márgenes falsos en esos productos; con datos: corrección trazable con delta 0 verificado | Misión F (fase de costos) | Aportar factura o costo declarado por recepción |
| **CP-INV-004** | Actualización de precios de catálogo (P1) | **PENDIENTE DE DATOS** | `REGISTRO_MOVIMIENTOS…` D-3/D-4 (desvíos SKU 92/134/111); precedente SKU 108 (PR #1418) | (con datos) (1) actualizar 3 SKUs + auditoría extendida de catálogo (criterio >5%); (2) solo 3 SKUs; (3) no actualizar | Gate de supervisor inoperante mientras el catálogo conserve precios viejos; márgenes erróneos; autorización eludible | Misión F (fase de catálogo); resolución en origen de las 26 PRICE_ANOMALY (CP-IPV-001) | Aportar precios vigentes oficiales de los 3 SKUs + decidir auditoría extendida |
| **CP-IPV-001** | Autorización de backfill del ledger | **PENDIENTE DEL PROPIETARIO** (no ejecutar) | `AUDITORIA_IPV…` §5/§15 («NUNCA se ocultan»; backfill fuera de alcance); `INCIDENTE_IPV…` §D | (1) clasificar incidencias como «históricas» (anotación, cero escrituras); (2) backfill de aperturas con las 6 precondiciones y autorización por tienda; (3) status quo | (1) elimina normalización de ruido sin riesgo; (2) requiere evidencia de apertura + escritura histórica gobernada; (3) ruido puede tapar incidencias nuevas | Misión F (fase de backfill tras CP-POS-010) | Decidir política (1/2/3); si 2: aportar evidencia contable de apertura por tienda y autorizar por lote |
| **CP-DATA-005** | Pares neto-cero (569+570, f536/537, f790/791) | **PENDIENTE DEL PROPIETARIO** | `ENERVIDA-EXCEL-IMPORT.md` §7.3; `AUDITORIA_CONCILIACION…` §6.2 | (1) cerrar como «no representable» (formalizar criterio actual); (2) registrar con nota a fecha actual | (1) cero escrituras; papel queda como referencia de 2–3 líneas sin espejo; (2) añade documentos sin corrección de saldo | Cierre documental de la conciliación ENERVIDA (sin bloqueo técnico D/E/F) | Decidir 1 o 2 (cierre formal de una práctica ya documentada) |
| **CP-DATA-006** | 20 filas de comisiones de julio con tarifa antigua | **PENDIENTE DEL PROPIETARIO** (+ de datos si reconstruye) | `AUDITORIA_CONCILIACION…` §8/§11.9.5 | (1) aceptar como documentado; (2) reconstruir con escala de tarifas de julio aportada | (1) distorsión menor documentada; (2) backfill autorizado por lote sobre 20 filas | Cierre documental de la conciliación (sin bloqueo técnico D/E/F) | Decidir 1, o aportar la escala de julio y autorizar 2 |
| **CP-CAT-006** | Backfill de `service_type_id` en históricos | **PENDIENTE DEL PROPIETARIO** | `AUDITORIA_SERVICIOS_RECIBIDOS…` §13.1 | (1) backfill por nombre autorizado (escritura histórica gobernada, auditada); (2) mantener históricos intactos como decisión formal | (1) restaura métricas de uso de tipos; (2) subestimación permanente documentada | Misión F/G (catálogo y datos maestros) | Decidir 1 o 2 (escritura solo con autorización expresa) |

**Prioridad de intervención sugerida por dependencia** (no es decisión, es orden de
atención): (1) CP-DATA-001 — bloquea la Misión D completa; (2) CP-SEC-010 residual A7
+ evidencia de perfiles — bloquea la fase de seguridad de la Misión E; (3) CP-IPV-001
— define el alcance de la fase contable de la Misión F; (4) CP-INV-002/003/004 —
requieren aportes de datos del negocio; (5) CP-SEC-011, CP-DATA-005/006, CP-CAT-006 —
cierres de menor prioridad (P2/P3) sin bloqueo transversal.

## 6. Datos y documentos faltantes (qué debe aportarse, exactamente)

| Para | Archivo/evidencia que falta | Campos a verificar | Incertidumbre que impide actuar |
|---|---|---|---|
| CP-INV-002 | Lista comercial oficial del negocio (papel/Excel) para SKUs con `price=0/cost=0` (160–177 y otros «Incompleto») | nombre final · `price` · `price_currency` · `cost_price` (y costo por recepción si procede) | Sin valores oficiales, actualizar sería inventar datos (prohibido); ventas a precio 0 permanecen posibles |
| CP-INV-003 | Factura del proveedor o costo declarado por cada una de las 13 recepciones | `receipt_items.unit_cost` real · moneda · recepción afectada | El placeholder 1 CUP distorsiona WAC/márgenes; sustituirlo sin documento sería inventar un costo |
| CP-INV-004 | Precios vigentes oficiales de SKU 92, 134, 111 (+ decisión de auditoría extendida) | `price` · `price_currency` por SKU | El gate de supervisor es inoperante con precio viejo; el listado original cubrió solo 3 SKUs y puede haber más |
| CP-DATA-006 (opción 2) | Escala de tarifas de comisión vigente en julio de 2026 por SKU | tarifa por SKU · moneda · vigencia | Sin la escala histórica no es posible reconstruir sin inventar tarifas |
| CP-IPV-001 (opción 2) | Evidencia contable de apertura por tienda/período (papel/Excel de las cargas iniciales de TIENDA CENTRAL y ENERVIDA) | saldos iniciales por producto/fecha · valor de apertura | Sin valor de apertura legítimo, el backfill fabricaría movimientos sin soporte documental |
| (referencia, fuera de alcance de esta misión) CP-IPV-002 | Facturas externas ENERVIDA para las 624 entradas `not_derivable` | costo documentado por entrada | Ya documentado en `evidence/20261018-cogs-cobertura/` (98,7% no derivable con evidencia interna) |

**Regla aplicada:** si falta el archivo fuente de un dato comercial o financiero, el
bloqueo queda registrado — no se sustituye por estimación alguna.

## 7. Mapa de dependencias (Misiones D, E, F)

```
DECISIONES MISIÓN C
│
├─ CP-DATA-001 (limpieza por lotes)
│    └─► MISIÓN D: CP-INFRA-011 (proyecto de pruebas aislado: cuota liberada + guard de higiene)
│         └─► CP-INFRA-001 (E2E en CI) · CP-INFRA-006 (fixtures P0) · CP-INFRA-009 (política anti-merge-ERROR)
│         └─► CP-DATA-003 (histórico en pilotos)
│         [complementario, no es ID CP-*: el plan exige decisión de credenciales/cuotas del proyecto aislado]
│
├─ CP-SEC-010 (DT-03 ratificada; residuales A7 + 10 perfiles)
│    └─► MISIÓN E: CP-SEC-025 (convergencia RLS legado/tenant-gated) · CP-SEC-026 (audit de memberships)
│         └─► tests de aislamiento multi-tienda de la campaña de seguridad
│
├─ CP-SEC-011 (DT-06)
│    └─► MISIÓN E: higiene de identidades (junto a CP-SEC-020 manage_user_memberships)
│
├─ CP-INV-002/003/004 (datos comerciales)
│    └─► MISIÓN F: fase de catálogo (altas/precios/costos) + resolución en origen de las 26 PRICE_ANOMALY
│
├─ CP-IPV-001 (política de ledger)
│    └─► MISIÓN F: fase de backfill (tras CP-POS-010; junto a CP-INV-005/006 ajustes autorizados)
│
├─ CP-INV-005 (política ratificada; lotes pendientes)
│    └─► MISIÓN F: ajustes gobernados CP-INV-005/006 con autorización por lote
│
└─ CP-DATA-005/006 · CP-CAT-006
     └─► cierre documental de conciliaciones + métricas de tipos (Misión F/G; sin bloqueo transversal)
```

**Lectura:** la Misión D está íntegramente bloqueada por CP-DATA-001 (y por la decisión
de credenciales del proyecto aislado); la Misión E depende de los residuales de
CP-SEC-010 y de CP-SEC-011 para su lote de identidad/aislamiento; la Misión F depende
de la política de CP-IPV-001 y de los datos comerciales de CP-INV-002/003/004; los
ajustes de CP-INV-005 ya tienen política ratificada y solo esperan autorización por
lote. Las decisiones del expediente CP-SEC-027 v5 (A1–A8) corren en paralelo por su
propio carril y no sustituyen a ninguna de las anteriores.

## 8. Propuesta de contenido para `docs/decisions/` (creado en esta misión)

Directorio **nuevo** `docs/decisions/` con 6 archivos (propuesta de contenido;
ninguna decisión nueva registrada como ratificada):

| Archivo | Contenido |
|---|---|
| `README.md` | Convenciones de estado (`RATIFICADA` / `RATIFICADA — EFECTO PENDIENTE` / `PROPUESTA` / `PENDIENTE DE DATOS`), reglas del registro, índice y fuentes |
| `2026-10-19-decision-B-dt03-multi-tenant.md` | Registro de DT-03 ratificada + efectos residuales (A7, 10 perfiles, CP-SEC-025) + relación con el expediente |
| `2026-10-20-decision-A-stock-negativo.md` | Registro de la política de stock negativo ratificada + distinción política/mecanismo |
| `2026-10-20-decision-B1-alcance-admin.md` | Registro del alcance del rol admin ratificado + disparador de revisión SaaS |
| `2026-10-20-decision-D-persistencia-incidentes.md` | Registro de la persistencia de incidentes legales (BUG-024) + residuales como tareas independientes |
| `2026-10-21-propuestas-pendientes.md` | PD-1..PD-10: las 7 decisiones pendientes con opciones y consecuencias + A7 + los 3 ítems pendientes de datos — todos como PROPUESTA |

Los registros de decisiones ratificadas **citan su fuente primaria** y su integración
en `main`; las propuestas están marcadas explícitamente como no ratificadas y ninguna
autoriza ejecución.

---

## 9. Cambios documentales realizados y estado de `git status`

**Cambios de esta misión (todos documentales; sin commit ni push — queda a decisión del
propietario, igual que los de la Misión B):**

| Archivo | Tipo | Contenido |
|---|---|---|
| `docs/decisions/` (directorio nuevo, 6 archivos) | Nuevo | Registro formal propuesto: README de convenciones + 4 registros de decisiones ratificadas + 1 archivo de propuestas pendientes (PD-1..PD-10) |
| `docs/audits/MISION_C_CONCILIACION_DECISIONES_2026-10-21.md` | Nuevo | Este informe (conciliación, matriz, faltantes, dependencias) |
| `docs/audits/INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md` | Modificado (aditivo) | Conciliación Misión C: 2 filas de resumen actualizadas (CP-INV-005, CP-SEC-010) + bloque «CONCILIACIÓN MISIÓN C (2026-10-21)» en las 11 fichas del alcance. Las ediciones sin commit de la Misión B (CP-SEC-012) permanecen intactas |

**Restricciones respetadas:** cero escrituras a Supabase/BD compartida; cero
migraciones/backfills/conciliaciones correctivas; cero cambios de RLS, permisos,
endpoints, workflows o configuración; cero modificaciones de precios/costos/inventario/
ventas; cero fusiones/pushes/despliegues; ninguna recomendación técnica tratada como
autorización. Inspección y redacción en modo solo lectura.

**`git status` al cierre de la misión (resumen):** rama `main` @ `e6dfd885b`; modificados:
`docs/audits/INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md` (ediciones Misión B +
ediciones aditivas Misión C); sin trackear: `docs/decisions/` (6 archivos),
`docs/audits/MISION_C_CONCILIACION_DECISIONES_2026-10-21.md`,
`docs/audits/MISION_B_VERIFICACION_CP-SEC-012_2026-10-21.md` y
`docs/audits/evidence/20261021-mision-b/` (Misión B, intactos). Sin commits ni pushes
realizados por el agente. El detalle crudo queda registrado en el espejo de la misión.

## 10. Recomendaciones técnicas del agente conforme a estándar internacional

> **Advertencia expresa:** esta sección es OPINIÓN TÉCNICA del agente, solicitada por
> el propietario («al terminar toma las mejores decisiones tú según estándar
> internacional»). **No constituye decisión ratificada ni autorización de ejecución
> alguna.** Cada ítem requiere aprobación expresa del propietario conforme al protocolo
> del programa. El propósito de esta sección es ahorrarle al propietario el análisis
> previo, no sustituir su decisión. Ningún ítem se ejecutará por inferencia.

| Ítem | Opción recomendada (de la matriz §5) | Estándar de referencia | Fundamento resumido |
|---|---|---|---|
| CP-DATA-001 (PD-1) | Opción 1: borrado por lotes con autorización individual + L4 confirmado como propio | ISO/IEC 27002:2022 (5.10–5.12, reutilización y eliminación de activos de información) | Minimización + trazabilidad por lote; conserva la regla de oro y las listas protegidas A/B |
| CP-SEC-010 residual (PD-10) | Ratificación a posteriori del backfill david9999 (Opción 1 de la ficha A7) | ISO/IEC 27001:2022 (A.5.15 control de acceso; registro de decisiones de seguridad) | La operación es correcta, auditada y reversible; revertir no corrige defecto y reintroduce el único NULL demostrable |
| CP-SEC-011 (PD-2) | Opción 2: detección automática + borrado humano ahora; opción 1 cuando exista entorno aislado (Misión D) | NIST SP 800-53 Rev.5 AC-2 (gestión de cuentas); ISO/IEC 27001 A.5.16–A.5.18 (ciclo de vida de identidades) | Revisión periódica con intervención humana mientras no hay evidencia operativa del automatismo |
| CP-INV-005 (efecto) | Ejecutar la regularización de artefactos QA por lotes autorizados (uno a uno o lote aprobado) | IAS 2 (inventarios: registros fieles y verificables); propia decisión ratificada | La política ya es canónica; los residuos QA contaminan la tienda real y la conciliación |
| CP-INV-002/003 (PD-3/PD-4) | Con los datos aportados: actualización por flujo oficial + corrección gobernada con recálculo WAC | IAS 2.9–2.12 (costo de inventarios con soporte documental) | Sin documento fuente no se inventan valores (principio ya aplicado por el programa) |
| CP-INV-004 (PD-5) | Opción 1: actualizar los 3 SKUs + auditoría extendida de catálogo (criterio desvío >5%) | COSO SEC 2013 (principio 11: actividades de control); IIA GTA 12 (integridad de datos maestros) | La separación registrar precios vs autorizar desvíos es control contable básico |
| CP-IPV-001 (PD-6) | Opción 1 ahora (clasificar incidencias como «históricas») + resolución en origen de precios; opción 2 solo con evidencia de apertura por tienda | Marco conceptual NIIF/IFRS (2.14–2.16 prudencia; 5.7 registro fiel); IIA (integridad de evidencia) | No fabricar movimientos sin soporte documental; eliminar la normalización de ruido sin escribir datos |
| CP-DATA-005 (PD-7) | Opción 1: cierre formal como «no representable» | Integridad del libro (registro fiel; sistema forward-only documentado) | Registrar a fecha actual crearía documentos artificiales sin corrección de saldo |
| CP-DATA-006 (PD-8) | Opción 1: aceptar como documentado, salvo que la escala de julio esté disponible de inmediato | Materialidad (NIIF/IAS 1.7): 20 filas P3 no justifican escritura histórica sin fuente | La distorsión es menor y está documentada |
| CP-CAT-006 (PD-9) | Opción 1 (backfill por nombre) agrupado con otros backfills menores autorizados de la Misión F; opción 2 defendible si el negocio no usa las métricas | ISO 8000-61 (calidad de datos: completitud controlada); integridad referencial | Match por nombre determinista y auditable; la elección final es de negocio (uso de las métricas) |

**Síntesis de la postura del agente:** priorizar (i) desbloquear la Misión D decidiendo
CP-DATA-001 por lotes, (ii) cerrar el residual A7 de DT-03, (iii) fijar la política de
CP-IPV-001 como «históricas anotadas» mientras no exista evidencia de apertura, y (iv)
canalizar los datos comerciales del negocio (CP-INV-002/003/004) por los flujos
oficiales ya probados. Todo lo anterior conforme al principio rector del programa:
escrituras históricas solo con autorización expresa, por lote y con trazabilidad
completa.

## 11. Verificación de cierre de la misión

- [x] Ninguna decisión nueva registrada como ratificada.
- [x] Ninguna tarea técnica desbloqueada ejecutada por inferencia.
- [x] Identificadores CP-* originales conservados; sin IDs nuevos para decisiones ya registradas.
- [x] Decisiones previas (DT-03, BUG-024, Decisión A, B.1) respetadas y no replanteadas.
- [x] Relaciones con el expediente CP-SEC-027 documentadas sin extrapolación.
- [x] Datos comerciales/financieros faltantes registrados como bloqueo, sin estimaciones.
- [x] Evidencia de A2 y cierres de la Misión B intactos.
- [x] Sin escrituras de BD, sin migraciones, sin fusiones/pushes, sin cambios de configuración.

**DICTAMEN: MISIÓN C — PAQUETE DE DECISIONES PREPARADO PARA REVISIÓN DEL PROPIETARIO.**

*El agente se detiene aquí. Las únicas decisiones que requieren resolución humana
quedan expuestas en la matriz (§5) y en `docs/decisions/2026-10-21-propuestas-pendientes.md`
(PD-1..PD-10); las decisiones ya documentadas (DT-03, política de stock negativo,
alcance del admin, persistencia de incidentes legales) no se vuelven a preguntar.*
