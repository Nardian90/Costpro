# MISIÓN E — DISEÑO DT-06 (OPCIÓN 2) + ANÁLISIS CP-SEC-025/026 (PREPARACIÓN SIN DESPLIEGUE)

**Proyecto:** COSTPRO 4 MULTITIENDA (`Nardian90/Costpro`)
**Fecha de preparación:** 2026-10-22 (ciclo 2 de la Misión Continua)
**Base de la decisión:** Resolución del propietario — Misión C (2026-10-21), ítem A.3 (opción 2 de PD-2) y D.4; registrada en `docs/decisions/2026-10-21-resolucion-propietario-mision-c.md`
**Estado de este documento:** `DISEÑO + ANÁLISIS PREPARADOS — SIN DESPLIEGUE, SIN BORRADO DE CUENTAS REALES, SIN CAMBIOS DE DATOS O PERMISOS DE PRODUCCIÓN`

> **Mandato literal del propietario:** «adoptar como dirección de diseño la
> opción 2: detección automática y revisión/borrado humano. Preparar
> salvaguardas y pruebas piloto. Esta decisión no autoriza despliegues ni
> borrados de cuentas reales.» Y, para el análisis: «Preparar para la Misión E
> el diseño de DT-06 y el análisis de CP-SEC-025/026 sin modificar datos o
> permisos de producción.» Cero operaciones de producción se ejecutaron al
> preparar este documento.

---

## PARTE I — DT-06: diseño de la reconciliación de auth.users huérfanos (opción 2)

### 1. Problema y decisión

Cuando `managed_delete_user` borra el profile pero `auth.admin.deleteUser` falla,
queda un `auth.users` huérfano: puede iniciar sesión pero sin profile, sin
memberships y sin rol. La FK `profiles_id_fkey → auth.users(id)` es
`ON DELETE NO ACTION` (sin CASCADE), por lo que los huérfanos pueden volver a
acumularse (ya hubo 364 limpiados a mano). El diseño base vive en
`docs/USER_RECONCILIATION_DESIGN.md` (2026-08-02, «Diseño — pendiente de
aprobación»); la resolución A.3 aprueba la OPCIÓN 2 como dirección:
**detección automática + revisión y borrado humanos** (sin auto-delete).

### 2. Arquitectura de la opción 2 (componentes)

| Componente | Contenido | Estado |
|---|---|---|
| Tabla `orphaned_users_log` | Esquema del diseño base §2.1 (auth_user_id, email, detected_at, resolved_at, resolution, resolved_by, metadata) + RLS admin | Migración PREPARABLE (no aplicada) |
| Detección horaria | Job que lista `auth.users`, cruza con `profiles`, inserta huérfanos nuevos (idempotente: no duplicar log de un huérfano ya detectado sin resolver) | Edge Function/cron — a desplegar solo tras piloto |
| Panel humano | `OrphanUsersPanel.tsx` + `useOrphanUsers.ts` — YA EXISTEN en el árbol (`src/components/views/terminal/views/users/`) | Presente; se conecta al log |
| Resolución | Solo por acción humana en el panel: `manual_review` → el admin elige (a) borrar auth.users por la vía oficial existente, o (b) restaurar profile. `resolution`/`resolved_by` quedan registrados | Humana — sin auto-delete |

**Diferencia esencial con el diseño base:** §2.3 del diseño original contemplaba
auto-delete de huérfanos >1 h con audit_log de delete. La opción 2 ratificada
**elimina el auto-delete**: la ventana de 1 h pasa a ser umbral de
*reportabilidad* (el job marca `age > 1 h` como «requiere revisión»), y todo
borrado es una decisión humana registrada con actor. Esto es exactamente el
paso intermedio recomendado en PD-2 conforme a NIST SP 800-53 AC-2 (revisión
periódica de cuentas con intervención humana) e ISO/IEC 27001 A.5.16–A.5.18
(ciclo de vida de identidades): automatizar la *detección*, no la *eliminación*,
mientras no exista evidencia operativa del automatismo.

### 3. Salvaguardas (diseño de la opción 2)

1. **Ban list de protegidos:** la detección excluye SIEMPRE a las listas A/B y a
   los pilotos E2E persistentes (`e2e/config/protected-resources.json` como fuente
   canónica); un protegido jamás puede aparecer como huérfano borrable. Doble
   guard: exclusión en la query + FATAL en el panel si un UUID protegido aparece.
2. **Ventana de gracia:** usuarios creados < 1 h no se reportan (creación en
   curso); se reportan a partir de la hora con estado `pending_review`.
3. **Log append-only con retención:** `orphaned_users_log` nunca se purga
   automáticamente; la fila conserva `detected_at`/`resolved_at`/`resolved_by`
   como evidencia de cada ciclo de vida (alineado con BUG-024: `audit_logs` es el
   almacén aprobado de incidentes; el log de huérfanos es complementario y de
   dominio de seguridad — su escritura se audita también en `audit_logs`
   con `action='orphan_review'`).
4. **Idempotencia de detección:** un huérfano ya en el log sin resolver no genera
   filas nuevas por cada corrida (upsert sobre `auth_user_id` + `resolved_at IS NULL`).
5. **Modo log-only al arrancar:** la primera fase del piloto escribe SOLO el log
   (el panel ofrece acciones pero se auditan todas); sin ninguna eliminación
   automática por construcción (no existe código de auto-delete).
6. **Techo de ruido:** si la detección encuentra > N huérfanos (p. ej. 50), el job
   alerta en lugar de inundar el log — patrón de alerta ya usado por los loggers
   del proyecto (`logger.warn('SECURITY', …)`).
7. **Migración con guards fail-closed (patrón PR #1444):** `CREATE TABLE IF NOT
   EXISTS` + verificación de precondiciones; se niega a ejecutarse si la tabla
   ya existe con esquema distinto. Aplicación = autorización separada, nunca
   automática.

### 4. Plan de pruebas piloto (prerrequisito de cualquier despliegue)

**Entorno:** proyecto Supabase de PRUEBAS aislado (el de la Misión D original del
plan de correcciones — red E2E segura; JAMÁS el proyecto de negocio
`wthkddeleylijmonclxg`). Semillas del piloto:

| Paso | Acción | Criterio de éxito |
|---|---|---|
| P1 | Aplicar la migración en el proyecto de pruebas | Tabla creada; guards pasan; RLS activa |
| P2 | Sembrar 3 huérfanos sintéticos (auth.user sin profile) + 1 usuario en creación (<1 h) + 1 protegido sin profile simulado | Estado inicial controlado |
| P3 | Correr detección (dry-run y real) | 3 huérfanos reportados; el de <1 h no; el protegido EXCLUIDO por ban list (FATAL si aparece) |
| P4 | Re-correr detección | 0 filas nuevas (idempotencia) |
| P5 | Borrado humano vía panel de 1 huérfano; restauración de otro | `resolution`/`resolved_by` correctos; audit_log escrito; el tercero queda `manual_review` |
| P6 | Intento de borrado del protegido vía panel | Bloqueado por guard FATAL (verificación negativa) |
| P7 | Corrida completa de regresión de seguridad (`npm run test:security` + suite) | Verde |

**Criterio de salida del piloto:** 7/7 pasos en verde con evidencia fechada. Solo
entonces se presentará al propietario la propuesta de despliegue a producción
como autorización separada (migración + cron/Edge Function), y NO antes.

### 5. Ruta a la opción 1 (auto-delete) — explícitamente diferida

El diseño base §2.3 contemplaba auto-delete con audit_log; la resolución adopta
la opción 2 «migrando a la opción 1 cuando la Misión D provea el entorno aislado
para probar el flujo» (recomendación técnica de PD-2, ahora dirección ratificada).
Condición de reevaluación: (i) piloto 7/7 en verde; (ii) periodo operativo con
evidencia (detección estable + revisión humana funcionando); (iii) NUEVA decisión
del propietario. Ninguna parte de este documento activa esa ruta.

---

## PARTE II — CP-SEC-025: análisis de la convergencia de capas RLS (sin cambios)

### 6. Hallazgo (evidencia existente, no re-abierta)

Del informe de la matriz DT-03 (`docs/audits/evidence/20261019-dt03-matriz-acceso/INFORME.md`,
hallazgo F1): coexisten **dos capas de políticas** — la legado ungated por
membresía (p. ej. `products_select_rls`) y la flag-gated por tenant (p. ej.
`products_tenant_select`) — y Postgres OR-anea ambas; el flag `USE_TENANT_RLS`
no restringe plenamente (T6.1=183). Mismo patrón en las demás tablas de negocio:
**56 políticas vivas en 10 tablas inspeccionadas**. Consecuencia: activar el flag
da una falsa sensación de frontera tenant.

### 7. Marco de decisión aplicable (decisiones ratificadas que DELIMITAN el análisis)

- **DT-03 (2026-10-19, reconfirmada A.2):** operación single-tenant HOY;
  arquitectura multi-tenant y memberships se CONSERVAN. → la convergencia no es
  urgencia operativa inmediata, es preparación de la vía de migración.
- **B.1 (2026-10-20):** admin GLOBAL documentado como estado operativo; la
  alternativa (b) admin-acotado es hoja de ruta cuyo disparador es la primera
  incorporación de un tenant cliente real — **junto con CP-SEC-025**.
- Por tanto: **CP-SEC-025 se ANALIZA y se prepara, no se ejecuta.** Su ejecución
  solo procede cuando el disparador B.1 ocurra o el propietario lo autorice antes.

### 8. Propuesta de convergencia (fases, para PR futuro cuando se autorice)

| Fase | Contenido | Riesgo | Autorización |
|---|---|---|---|
| F1 — Inventario | Documentar las 56 políticas por tabla: capa, gate (flag/membresía), roles, `USING`/`WITH CHECK`, solapamientos OR | Cero (read-only) | Ya permisible; incluir en próximo ciclo documental |
| F2 — Diseño por tabla | Elegir capa canónica por tabla (tenant-gated como objetivo final si DT-03 evoluciona a multi-tenant real; membresía como estado actual documentado) y decidir por policy: alinear o retirar | Cero (documento) | Próximo ciclo documental |
| F3 — Migración preparable | SQL `fixup` por tabla con guards fail-closed + tests de aislamiento (`supabase/tests/isolation_test.sql` + contract tests) + replay completo en entorno aislado | Medio — RLS | PR separado + replay probado (regla de oro) |
| F4 — Aplicación y re-certificación | Aplicar con ventana acordada; re-certificar surface (matriz de acceso re-ejecutada); activar modo estricto con `RLS_PILOT_STORES` | Alto — requiere ventana | Expresa del propietario |

**Secuencia de transición ya documentada en la matriz DT-03** (se respeta):
(1) CP-SEC-025 convergencia; (2) backfill de `products.tenant_id` (226 NULL →
tenant de su store — regla derivable, reversible, auditable); (3) backfills de
perfiles demostrables (A7 cuando la evidencia lo cierre); (4) homogeneización
B.1 (`has_store_access`/`is_admin_with_access`); (5) re-certificar y activar el
flag con piloto. Este documento NO ejecuta ninguno de esos pasos.

### 9. Qué se puede avanzar YA (próximo ciclo, sin tocar producción)

F1 + F2 son documentales/read-only y no dependen de datos comerciales ausentes:
inventario completo de las 56 políticas con clasificación por capa y propuesta
canónica por tabla, más el borrador de la migración F3 con sus tests de
aislamiento como texto. Ese es el paquete de trabajo propuesto para la Misión
F/G documental de este ciclo (ver `MISION_F_G_TAREAS_DOCUMENTALES_2026-10-22.md`).

---

## PARTE III — CP-SEC-026: análisis de auditoría de memberships (sin cambios)

### 10. Hallazgo (evidencia existente, no re-abierta)

Ídem informe DT-03, hallazgo F2: las mutaciones de `user_store_memberships` no
quedan auditadas — `audit_logs` tiene 10.402 filas (última 2026-10-18) y **0
eventos** sobre esa tabla; nadie sabe quién otorgó o revocó un acceso a tienda,
y el linaje de los 30 perfiles es opaco (`created_by` NULL en todos).

### 11. Análisis de opciones de implementación (para PR futuro)

| Opción | Mecanismo | Pros | Contras |
|---|---|---|---|
| (a) Trigger BD sobre `user_store_memberships` | `AFTER INSERT/UPDATE/DELETE` → escribe en `audit_logs` (actor vía `auth.uid()`, tienda, rol, timestamp, valores antes/después en metadata JSONB) | Atrapa TODAS las mutaciones, incluidas SQL directas de service-role y consola; imposible evadir por capa app | Requiere migración + cuidado con recursion y con funciones SECURITY DEFINER (precedente de hardening: `20261020000002_sec_definer_hardening.sql`, PR #1430) |
| (b) Instrumentar `manage_user_memberships` RPC + capa app | Log en el punto de mutación existente | Sin trigger | No atrapa SQL directo ni consola — deja hueco exactamente igual que hoy |

**Recomendación técnica (NO ratificada, como todo lo de este documento):**
opción (a) trigger, porque la brecha detectada es precisamente «nadie sabe quién
cambió un acceso»; instrumentar solo la RPC dejaría la brecha abierta para
cualquier vía no-RPC. Alinear el formato con el contrato vigente de `audit_logs`
(BUG-024: `audit_logs` es el almacén aprobado; acción tipo
`membership_grant`/`membership_revoke`, metadata con actor/tienda/rol/valores).

### 12. Prerrequisitos y ruta

1. Migración PREPARABLE con guards fail-closed (patrón #1444) + tests de
   contrato del trigger (insert/update/delete de membership genera exactamente
   1 evento con los campos correctos; mutaciones de otros objetos no generan).
2. Consideración de volumen: memberships cambian con poca frecuencia (43 filas
   en la matriz); el coste del trigger es despreciable — documentar el análisis.
3. **Relación con L2 (Misión D):** si el propietario autoriza el borrado de los
   16 usuarios D, conviene aplicar el trigger ANTES o registrar ese borrado con
   la misma trazabilidad — se anota en el plan de limpieza §5 como consideración
   de orden, sin cambiarlo (el borrado L2 ya lleva su propia evidencia fechada).
4. Aplicación = autorización expresa separada (esquema de producción). Este
   documento NO la solicita.

---

## 13. Conformidad con los límites de la resolución (sección C)

- Cero SQL de escritura, cero migraciones aplicadas, cero cambios de permisos,
  cero datos tocados, cero cuentas borradas (no había huérfanos que listar en
  esta preparación; la detección no se ejecutó contra producción).
- Cero modificaciones a evidencia/entregables de A2 o Misión B.
- Los componentes futuros (tabla, cron, trigger) se presentarán como PRs con
  migraciones PREPARADAS y guards fail-closed cuando el propietario lo autorice;
  este ciclo no abre esos PRs de código (solo prepara el diseño).

## 14. Trazabilidad de fuentes

- `docs/USER_RECONCILIATION_DESIGN.md` (2026-08-02) — diseño base DT-06.
- `docs/audits/DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` §B.1 — sub-decisión admin.
- `docs/decisions/2026-10-19-decision-B-dt03-multi-tenant.md` — DT-03.
- `docs/decisions/2026-10-20-decision-B1-alcance-admin.md` — B.1 (admin global documentado; (b) como hoja de ruta con disparador).
- `docs/audits/evidence/20261019-dt03-matriz-acceso/INFORME.md` — hallazgos F1/F2 (CP-SEC-025/026), orden de transición recomendado.
- `docs/decisions/2026-10-21-resolucion-propietario-mision-c.md` — A.3 y D.4.
- Panel existente: `src/components/views/terminal/views/users/OrphanUsersPanel.tsx` + `src/hooks/api/useOrphanUsers.ts` (verificados en el árbol, 2026-10-22).
- PR #1430 (definer hardening aplicado 2026-10-20) — precedente de seguridad para triggers.
