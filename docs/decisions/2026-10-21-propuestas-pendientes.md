# PROPUESTAS PENDIENTES DE DECISIÓN DEL PROPIETARIO — Misión C (2026-10-21)

> **⚠️ ACTUALIZACIÓN (2026-10-22):** este paquete fue **RESUELTO por el
> propietario** el 2026-10-21. Su documento «Resolución del propietario —
> Misión C» está registrado en
> `2026-10-21-resolucion-propietario-mision-c.md` con las 10 respuestas (PD-1…PD-10),
> los límites de ejecución y los próximos pasos. Este archivo se conserva
> íntegro como fuente histórica de las opciones presentadas; donde dice
> «Recomendación técnica», la recomendación del agente correspondiente ya fue
> aceptada, modificada o diferida por el propietario según dicha resolución.
> No ejecutar nada de lo aquí descrito sin verificar primero el estado vigente
> en el registro de decisiones y en `scripts/extracted/tareas.csv`.

> **Estado al momento de su emisión:** `PROPUESTA — PENDIENTE DEL PROPIETARIO` / `PENDIENTE DE DATOS`.
> **Ninguna de estas decisiones está ratificada.** Ninguna autoriza ejecución técnica
> alguna. Las opciones se presentan con sus consecuencias para que el propietario
> elija; donde se indica «Recomendación técnica», es la opinión documentada del agente
> conforme a estándares internacionales, **no una decisión** y **no una autorización**.

---

## PD-1 · CP-DATA-001 — Limpieza de datos E2E/QA por lotes

**Decisión requerida:** decidir, por lote, si se borra o conserva cada grupo de
residuos de pruebas en la BD compartida.

**Lotes candidatos (delimitados, verificados documentalmente):**

| Lote | Contenido exacto | Fuente |
|---|---|---|
| L1 | 6 tiendas D-indeterminadas: Tienda Auditor (`11111111-…`), No Address (`2ef293a3-…`), nombre en blanco (`2dabe459-…`), Store Tenant 2 (`dcfd74bf-…`), QA-H1-A (`a5b81cbf-…`, 349 transacciones), QA-H1-B (`b9cfacda-…`, 20 transacciones) | `E2E-DATA-CLEANUP-INVENTORY.md` §«TIENDAS — D INDETERMINADAS» |
| L2 | 16 usuarios D-indeterminados: `auditor@costpro.test`, 8×`@uberip.com`, `qa-acc-center@`, `qa-nav-defaults@`, 4×`qa.h1.*@costpro.test`, `user_c@tenant_b.com` | Ídem §«USUARIOS — D INDETERMINADOS» |
| L3 | Residuos del 9-oct: 8 tiendas + 4 usuarios + 3 tenants (RUN IDs `D0978E`, `8DEF57`, `7DAE03`) — borrables vía `reconcile-orphan-runs.ts --run-id …` | `e2e-contamination-cleanup-20261009.md` + `E2E-FIXTURE-REUSE-TRIGGER-INVESTIGATION.md` §6 |
| L4 | **3 vales manuales del propietario** (VS-000001/000023/000002, en tiendas reales) — **EXCLUIDOS por regla de oro**; solo se decide si el propietario los confirma como propios y conservables | `e2e-contamination-cleanup-20261009.md` §5 |

**Salvaguardas de aislamiento que deben aprobarse junto con la decisión:**
listas protegidas A (3 tiendas reales: TIENDA CENTRAL, Puerto Padre, ENERVIDA; 8
usuarios reales) y B (3 usuarios personales) intocables; lista de patrones C E2E
(2.577 tiendas/359 usuarios residuales) separada de los D-indeterminados; borrado
solo por script de reconciliación con RUN ID, con dry-run + evidencia fechada;
verificación posterior con `data-hygiene-guard`; cero CASCADE hacia listas A/B.

**Opciones.**
1. **Borrado por lotes con autorización individual por lote** (L1, L2, L3 por
   separado): máxima trazabilidad; el propietario conserva control fino.
   Consecuencia: libera cuota de tiendas del tenant y desbloquea el guard de
   fixtures (Misión D).
2. **Borrado por única autorización masiva** de L1+L2+L3: más rápido, menor
   control fino; si un D-indeterminado resultara real, la reversión sería manual.
3. **Conservar y documentar** (no borrar): cero riesgo de pérdida; el guard de
   fixtures sigue bloqueado y la cuota de tiendas del tenant sigue consumida.
4. (Solo L4) **Confirmar los 3 vales como propios**: se marcan como actividad
   manual legítima del propietario y quedan fuera de toda limpieza de forma
   permanente.

**Recomendación técnica (NO ratificada):** opción 1 (lotes individuales) con L4
confirmado como propio — alineada con el principio de minimización y de
trazabilidad por lote de activos de información (ISO/IEC 27002:2022, controles
5.10–5.12 de reutilización y eliminación) y con la regla de oro ya vigente del
repo (no borrar sin confirmación humana).

---

## PD-2 · CP-SEC-011 — DT-06: aprobación de la reconciliación de auth.users huérfanos

**Decisión requerida:** aprobar o no la implementación del diseño de detección y
reconciliación de huérfanos (`docs/USER_RECONCILIATION_DESIGN.md`, 2026-08-02,
«Diseño (pendiente aprobación)»). La FK `profiles_id_fkey` es `ON DELETE NO ACTION`
(sin CASCADE), por lo que los huérfanos pueden volver a acumularse (ya hubo 364
limpiados a mano).

**Opciones.**
1. **Aprobar la implementación completa** (tabla `orphaned_users_log` + detección
   horaria + auto-delete >1 h con audit log): requiere migración + Edge
   Function/cron + salvaguardas (ban list de pilotos A/B). Consecuencia técnica:
   superficie nueva en BD; beneficio: 0 huérfanos >24 h en producción.
2. **Aprobar solo detección + panel manual** (sin auto-delete): el panel
   `OrphanUsersPanel.tsx` ya existe; se añade la tabla de log y el cron de
   detección, pero el borrado queda humano. Menor riesgo; depende del operador.
3. **Diferir** (gestión manual como hasta ahora): cero cambios; el riesgo de
   acumulación persiste y la tarea sigue abierta.

**Nota de conciliación:** DT-06 **nunca fue incluida** en las decisiones ratificadas
de octubre (A/B/B.1/C/D/E). No existe decisión previa que respetar ni contradicción
que reconciliar.

**Recomendación técnica (NO ratificada):** opción 2 como paso intermedio
(detección automática + decisión humana de borrado), migrando a la opción 1 cuando
la Misión D provea el entorno aislado para probar el flujo — conforme a
NIST SP 800-53 AC-2 (gestión de cuentas con revisión periódica) e ISO/IEC 27001
A.5.16–A.5.18 (ciclo de vida de identidades), que prefieren revisión con
intervención humana mientras no exista evidencia operativa del automatismo.

---

## PD-3 · CP-INV-002 — Productos 160–177 sin precio/costo y nombre provisional

**Estado:** `PENDIENTE DE DATOS`. El mecanismo está probado (precedente: misión de
catálogo del 2026-10-17 ejecutó creaciones SKU 178–181, corrección de nombres
158/162/176 y precio SKU 108 → 12.000 CUP por flujos oficiales; PR #1418 fusionado).

**Qué falta exactamente:** lista oficial de precios/costos del negocio para los SKUs
con `price=0/cost=0` (incluye 160–177 y otros marcados «Incompleto»). **Campos a
verificar por SKU:** nombre final, `price`, `price_currency`, `cost_price` (y si
procede, costo por recepción). **Incertidumbre que impide actuar:** sin los valores
oficiales no se puede actualizar el catálogo sin inventar datos (prohibido).

**Opciones una vez aportados los datos.**
1. **Actualización directa por flujo oficial** (PATCH `products` por id exacto, con
   `trigger_audit_product_changes`): idéntico al precedente verificado del SKU 108.
2. **Actualización + recepción de costo** donde el costo deba entrar por recepción
   (recalcula WAC vía `fn_recalc_wac`): aplica a los SKUs con existencias.
3. **Baja/desactivación** de SKUs que el negocio declare no vendibles.

**Acción solicitada:** aportar la lista comercial oficial (papel/Excel) con los
campos indicados. Sin ella, la tarea permanece `PENDIENTE DE DATOS`.

---

## PD-4 · CP-INV-003 — `unit_cost=1 CUP` placeholder en 13 recepciones

**Estado:** `PENDIENTE DE DATOS`.

**Qué falta exactamente:** costo real unitario por cada una de las 13 recepciones
(factura del proveedor o valor declarado por el negocio). **Campos a verificar:**
`receipt_items.unit_cost` real, moneda, y fecha de la recepción afectada.
**Incertidumbre:** el costo placeholder distorsiona WAC y márgenes; sustituirlo por
otro valor sin documento sería inventar un costo (prohibido).

**Opciones una vez aportados los datos.**
1. **Corrección gobernada por recepción**: UPDATE auditado + recálculo WAC con
   `wac_change_log` + delta 0 verificado (patrón TAREA 2/2B ya probado).
2. **Marcar como provisional**: anotación documental de costo no determinable
   (columna derivada, sin mutar original — mismo patrón del paquete C de COGS).
3. **Aceptar la distorsión** con anotación permanente.

**Acción solicitada:** aportar facturas o costos declarados por recepción. Hasta
entonces, `PENDIENTE DE DATOS`.

---

## PD-5 · CP-INV-004 — Precios de catálogo obsoletos (SKU 92, 134, 111; P1)

**Estado:** `PENDIENTE DE DATOS` (y del propietario). Desvíos documentados: SKU 92
(catálogo 30 vs venta 23.700), SKU 134 (5 vs 3.950), SKU 111 (2.500 vs 2.000, −20%).
El gate de supervisor es inoperante mientras el catálogo conserve el precio viejo.

**Qué falta exactamente:** precios vigentes oficiales de esos 3 SKUs (y la decisión
de extender la comparación a todo el catálogo — el listado original limitó la
detección a 3 SKUs y puede haber más). **Campos a verificar:** `price`,
`price_currency` por SKU.

**Opciones una vez aportados los datos.**
1. **Actualizar los 3 SKUs por flujo oficial** (precedente SKU 108) + auditar el
   catálogo completo con la misma comparación (criterio ya propuesto: 0 SKUs con
   desvío catálogo/venta > 5% sin autorización documentada).
2. **Actualizar solo los 3 SKUs** sin auditoría extendida.
3. **No actualizar** (aceptar el gate inoperativo y márgenes erróneos) — no
   recomendable en P1.

**Recomendación técnica (NO ratificada):** opción 1 — la separación de funciones
(registrar precios vs autorizar desvíos) es control contable básico (COSO
SEC 2013, principio de actividades de control; IIA GTA 12 sobre integridad de
datos maestros).

---

## PD-6 · CP-IPV-001 — Autorización de backfill del ledger (PRE_LEDGER/RECONCILIATION + 26 PRICE_ANOMALY)

**Decisión requerida:** política para las incidencias permanentes de IPV en TIENDA
CENTRAL y ENERVIDA (cargas iniciales sin ledger; devoluciones de agosto sin `return`
tras el reinicio de septiembre) y para las 26 PRICE_ANOMALY reales de ENERVIDA.
**No ejecutar nada** — esta misión solo define precondiciones.

**Advertencia de delimitación:** este backfill de LEDGER es distinto del backfill de
COGS (Decisión C / paquete C `20261020000004`, que atiende CP-IPV-002 con
autorizaciones A5/A6 del expediente CP-SEC-027 v5). La aprobación contable de los 8
valores WAC (A5) **no** autoriza este backfill de ledger. Relación documentada, sin
extrapolación.

**Precondiciones que deben identificarse antes de cualquier backfill (propuesta):**
1. **Inventario de incidencias por tienda y tipo** (PRE_LEDGER / RECONCILIATION /
   DEVOLUTION_WITHOUT_LEDGER) con conteo fechado — baseline antes.
2. **Evidencia contable de apertura**: saldos iniciales documentados (papel/Excel de
   carga inicial) por tienda/período — sin ella no hay valor de apertura legítimo.
3. **Protocolo transaccional**: escritura aditiva de movimientos de apertura
   marcados como `backfill` (origen + fecha de ejecución + autorización en
   metadata), jamás UPDATE de movimientos existentes.
4. **Reversibilidad**: eliminación limpia de los movimientos de backfill sin tocar
   datos originales.
5. **Verificación**: re-ejecutar `verificar_ipv_en_vivo.ts` (read-only) comparando
   incidencias antes/después.
6. **Autorización específica por tienda/lote**, separada de cualquier otra
   autorización del expediente.

**Opciones.**
1. **Clasificar como «históricas» sin backfill** (anotación técnica en el informe
   IPV): elimina la normalización de ruido SIN escribir datos; las incidencias
   nuevas siguen visibles. Cero riesgo contable.
2. **Backfill de movimientos de apertura autorizado por tienda** (con las 6
   precondiciones): elimina el ruido en origen; requiere evidencia de apertura y
   escritura histórica gobernada.
3. **Status quo** (dejar las incidencias permanentes): riesgo documentado de que el
   ruido tape incidencias nuevas reales.
En paralelo, las 26 PRICE_ANOMALY se resuelven **en origen** (precios de catálogo —
solapa con PD-5/CP-INV-004), no dentro del IPV.

**Recomendación técnica (NO ratificada):** opción 1 ahora (clasificación) +
resolución en origen de precios; opción 2 solo si el propietario aporta la evidencia
de apertura por tienda — conforme al principio de prudencia (NIIF/IFRS marco
conceptual 2.14–2.16) y a la integridad del registro contable (no fabricar
movimientos sin soporte documental; IIA sobre integridad de evidencia).

---

## PD-7 · CP-DATA-005 — Pares neto-cero no representables

**Decisión requerida:** cierre formal del tratamiento de los pares con neto 0 del
papel/Excel: filas 569+570 (anticipo OT +700/−700 USD), f536/f537 (venta+DV),
f790/f791 (DV+VS). Hoy están documentados deliberadamente sin registro
(«registrarlos con fecha actual tiene valor dudoso» — decisión técnica previa
documentada, sin efecto económico).

**Opciones.**
1. **Cerrar como «no representable»** con anotación permanente en la conciliación
   (mantener el criterio actual como política formal): cero escrituras; el papel
   queda como referencia de 2–3 líneas sin espejo en COSTPRO.
2. **Registrar con nota a fecha actual** (forward-only): crea rastro documental sin
   corrección de saldo; añade documentos «artificiales» al Kardex/ventas.

**Recomendación técnica (NO ratificada):** opción 1 — no crear documentos sin fecha
real de negocio preserva la integridad del libro (principio de registro fiel;
la equivalencia económica es neta 0 y el sistema es forward-only por diseño).

---

## PD-8 · CP-DATA-006 — 20 filas de comisiones de julio con tarifa antigua

**Estado:** `PENDIENTE DEL PROPIETARIO` (+ de datos si se desea reconstruir).
ConfComisiones se importó como configuración VIGENTE; no se reconstruyeron tarifas
históricas (documentado como fuera de alcance, §6.5/§11.9.5 de la conciliación).

**Qué faltaría para reconstruir:** la tarifa unitaria vigente en julio de 2026 por
SKU (hoja/declaración del negocio). **Campos a verificar:** tarifa por SKU en julio,
moneda, vigencia.

**Opciones.**
1. **Aceptar como documentado** (la comparativa de julio queda con tarifa vigente
   aplicada): cero escrituras; distorsión menor ya documentada.
2. **Reconstruir tarifas históricas** si el propietario aporta la escala de julio:
   backfill autorizado por lote sobre las 20 filas.

**Recomendación técnica (NO ratificada):** opción 1 salvo que exista la escala de
julio disponible de forma inmediata; la reconstrucción de 20 filas P3 no justifica
una escritura histórica sin documento fuente.

---

## PD-9 · CP-CAT-006 — Backfill de `service_type_id` en received_services históricos

**Decisión requerida:** autorizar el backfill por nombre (o decidir dejar los
históricos intactos). Los servicios históricos con `service_type_id=NULL`
subestiman el contador de uso de tipos (origen: la migración de tipos es posterior
al histórico).

**Opciones.**
1. **Backfill por nombre con autorización** (escritura histórica gobernada, UPDATE
   auditado por fila, verificación posterior: 0 NULL): restaura la métrica de uso.
2. **Dejar históricos intactos** como decisión formal documentada: cero escrituras;
   métricas de uso subestimadas de forma permanente.

**Recomendación técnica (NO ratificada):** opción 1 cuando se programen escrituras
gobernadas por lote (puede agruparse con otros backfills menores de la Misión F),
porque el match por nombre es determinista y auditable; si el negocio no usa las
métricas de uso, la opción 2 es igualmente defendible — la elección es de negocio.

---

## PD-10 · Ratificación a posteriori del backfill `david9999` (efecto residual de DT-03 / CP-SEC-010)

**Origen:** expediente CP-SEC-027 v5 (autorización **A7**); se lista aquí por su
relación directa con CP-SEC-010. La operación está EJECUTADA y verificada viva
(2026-10-19 18:29:50Z, transaccional, auditada, idempotente, reversible,
pertenencia demostrable); la AUTORIZACIÓN original (D-3) fue conversacional y no es
verificable de forma independiente.

**Opciones (de la ficha del expediente).**
1. **Ratificación expresa a posteriori** (recomendada por el expediente): cierra el
   expediente DT-03 con acta de ratificación.
2. **Remediación conforme al dossier §6**: reversión transaccional exacta
   (`tenant_id = NULL` + `updated_at` previo); reintroduce el único NULL
   clasificado como demostrable.

**Los otros 10 perfiles NULL NO dependen de esta decisión:** siguen exigindo
validación individual con evidencia (criterio DT-03 ratificado) — no se asignan
automáticamente.
