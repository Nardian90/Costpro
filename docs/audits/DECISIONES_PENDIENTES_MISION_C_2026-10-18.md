# DECISIONES PENDIENTES DE NEGOCIO — MISIÓN C (2026-10-18 · actualizado 2026-10-19)

**Proyecto:** COSTPRO 4 Multitienda · **Sesión:** 2026-10-18 (post-reinicio de entorno) · **Actualización:** 2026-10-19 (Decisión B CONFIRMADA por el propietario; protocolo de 6 pasos ejecutado)
**Propósito:** documento corto de aprobación. Cada decisión presenta el problema, la evidencia viva (consultada hoy a la BD), 2–3 alternativas con ventajas/riesgos/efectos sobre datos, y una **recomendación identificada explícitamente como PROPUESTA** (no decisión tomada). Ninguna alternativa relaja el aislamiento multi-tienda ni muta transacciones cerradas.
**Nota de método:** toda la evidencia numérica de este documento proviene de consultas READ-ONLY ejecutadas hoy contra la BD viva (proyecto Supabase wthkddeleylijmonclxg). Nada de lo aquí registrado implicó escrituras.

---

## DECISIÓN A — Política de stock negativo (desbloquea CP-INV-005)

**Problema concreto.** Existen divergencias históricas de conciliación (4 SKU documentados: 113, 127 y dos más del informe de la misión multi-tienda) y falta una política ratificada de si el negocio admite stock negativo bajo algún flujo (devoluciones fuera de rango, ajustes autorizados, operaciones concurrentes). CP-INV-005 quedó «PENDIENTE CONFIRMADA» por esto.

**Evidencia actual (consultada hoy, read-only).**
- La BD ya impide negativos en las dos tablas maestras: `products_stock_current_check (stock_current >= 0)` en `products` y `stock_non_negative (quantity >= 0)` en `inventory`. Ambos CHECK están VIGENTES en la BD viva.
- Estado de datos: **0 productos con stock negativo sobre 376** en 22 tiendas. No hay deudas estructurales de negativos hoy.
- El camino de ajuste gobernado ya existe como RPC (`process_inventory_adjustment`) y las transferencias revalidan disponibilidad con lock determinista (DF-06) antes de mover valor.
- **[ACTUALIZACIÓN 2026-10-18, evidence/20261018-reconciliacion-stock/INFORME_READ_ONLY.md]** Conciliación read-only ejecutada hoy: **las 4 divergencias históricas YA NO EXISTEN** (SKU 113: 121=121 reconciliado; SKU 127: 0=0). Las 41 divergencias actuales son TODAS artefactos de pruebas/QA (0 en negocio real); ~10 productos de prueba contaminan la tienda real TIENDA CENTRAL («WAC Test Product», etc.) → registrada como nueva tarea de higiene, no como bloqueo de negocio.

**Consecuencia de no decidir.** Las 4 divergencias siguen sin clasificar, la tarea CP-INV-005 no puede cerrarse y cualquier incidente futuro (p. ej. venta concurrente que «falla» por el CHECK) se resolverá de forma improvisada, sin criterio.

**Alternativas.**
1. **Ratificar la política actual como canónica** (recomendada): stock nunca negativo; toda regularización pasa por `process_inventory_adjustment` con trazabilidad; las divergencias históricas se regularizan con ajustes gobernados uno a uno (requiere su autorización por ajuste o un lote aprobado).
   - Ventajas: cero cambios de esquema; compatible con datos históricos (los CHECK ya conviven con ellos); reversible.
   - Riesgos: los flujos que «necesiten» negativos deberán rediseñarse como ajuste + reposición.
   - Efecto sobre datos: regulariza los 4 SKU divergentes vía ajuste auditado; no toca nada más.
2. **Excepciones acotadas por flujo** (p. ej. permitir negativo solo en devoluciones de productos sin existencia, con bandera `negative_allowed` y límite): exigiría suavizar el CHECK con una columna de excepción.
   - Ventajas: opera escenarios de devolución de cliente sin existencia.
   - Riesgos: cada excepción es una fuga de control contable; complica RLS/reportes; el Kardex puede divergir del saldo.
   - Efecto sobre datos: migración aditiva + backfill de la bandera en cero filas (nada activo hoy).
3. **Eliminar la restricción global** y confiar solo en validación de aplicación.
   - **No recomendada**: la capa BD es la única defensa contra llamadas RPC directas y operaciones concurrentes; retirarla degradaría la integridad que ya está garantizada.

**PROPUESTA (técnica y de negocio):** alternativa 1. El sistema YA trabaja así en producción de hecho; formalizarlo evita trabajo y riesgo. Yo preparo el informe de conciliación read-only (ver «sin esperar decisión») y, con su aprobación por lote, ejecuto los ajustes gobernados para los 4 SKU.

**Qué puedo seguir haciendo sin su decisión:** ejecutar `reconcile_stock` en modo read-only, generar el informe de divergencias actualizado (incluye verificar si los 4 SKU siguen divergentes tras las operaciones de octubre), y añadir tests de regresión de los CHECK.

---

## DECISIÓN B — DT-03: estrategia multi-tenant (desbloquea CP-SEC-010) — ✅ CONFIRMADA POR EL PROPIETARIO (2026-10-19)

**Decisión confirmada:** conservar la arquitectura multi-tenant; adoptar single-tenant únicamente como descripción de la situación operativa actual, no como restricción estructural del producto. Un mismo usuario puede tener acceso autorizado a dos o más tiendas; pertenencia a tenant ≠ permisos de acceso a tiendas. No se relaja el aislamiento entre organizaciones.

**Protocolo de 6 pasos exigido por el propietario — EJECUTADO (2026-10-19, read-only):** ver evidencia completa en `evidence/20261019-dt03-matriz-acceso/INFORME.md`.
1. ✅ Esquema real inspeccionado en VIVO (funciones, RLS, `has_store_access()`; no solo migraciones). Encontrado: dos capas de políticas coexistiendo (legado ungated + tenant flag-gated) → nueva tarea **CP-SEC-025**.
2. ✅ `tenant_id` de perfiles = pertenencia organizativa (capa tenant-gated); relación con el tenant de la tienda = co-pertenencia con guard NULL-safe. Acceso operativo = `user_store_memberships` (no-admin) o bypass admin global.
3. ✅ Matriz por usuario construida (30 perfiles × 43 memberships × 24 tiendas × 8 tenants) con pertenencia, tiendas autorizadas, roles, origen (auth.users + linaje) y estado de validación.
4. ✅ Los 11 NULL clasificados: **1 demostrable** (david9999 → Default Tenant por membership activa en ENERVIDA) + **10 SIN EVIDENCIA** (8 self-signups @uberip.com, 1 google-signup, 1 QA) — estos NO se tocan.
5. ✅ Pruebas en vivo: usuario de 2 tiendas conserva ambas y no ve una 3ª no autorizada (T1.1=183/T1.2=36/T1.3=0/T1.4=0) ✅.
6. ✅ Cross-tenant denegado para no-admins (T2.1=0) y perfiles NULL sin permisos implícitos (T4.1–T4.6, T7.1: 0 en todo; solo su propia fila de perfil) ✅.

**Nuevas tareas vinculadas registradas:** CP-SEC-025 (convergencia de capas RLS — el flag `USE_TENANT_RLS` no restringe plenamente), CP-SEC-026 (memberships sin auditoría en audit_logs), CP-SEC-027 (anon lee `cost_average`/precios de productos — P1). Detalle y evidencia en el INFORME.

**Pendiente de su autorización (escritura de datos, NO ejecutada):** backfill controlado de EXACTAMENTE 1 perfil (david9999 → Default Tenant; auditable, reversible, con WHERE idempotente; ver INFORME §PROPUESTA). Los otros 10 quedan documentados sin modificación.

**Nueva sub-decisión B.1 (propuesta, no ejecutada):** el rol admin es GLOBAL hoy (`is_admin()` bypass total, T5.2: admin de Default Tenant ve productos de Grupo Demo) pero `is_admin_with_access` y el modo estricto lo acotan por tenant. Hay que homogeneizar: (a) admin global documentado, o (b) admin acotado a su tenant. Recomendación técnica: (b) para SaaS multi-cliente, (a) mientras exista un solo tenant real y un solo propietario. No se cambió nada.

---

## DECISIÓN C — Backfill de COGS y contabilidad (desbloquea CP-IPV-002; condiciona CP-IPV-001/003/004)

**Problema concreto.** El inventario registra «re-costeo de COGS histórico no iniciado». Sin política por clase de costo, los márgenes históricos del IPV/reportes salen distorsionados.

**Evidencia actual (consultada hoy, read-only).**
- **`sales_transactions` tiene 0 filas** en la BD viva: NO existe hoy un cuerpo de ventas históricas que re-costear (el vaciado/limpieza previo de datos de prueba lo explica). El re-costeo «de ventas» como tal no tiene sujeto activo.
- El gap real y medible está en el Kardex: **632 de 1.662 entradas (38%) con `unit_cost = 0`** (espejo exacto de `stock_movements`: 632 movimientos con costo 0), y **39 productos con WAC = 0**.
- `wac_change_log` acumula 603 entradas — hay historia de WAC utilizable como evidencia de costos para parte de esos períodos.
- Los hallazgos de auditoría asociados (26 PRICE_ANOMALY, 4 WAC inflados ~680x, procedencia ENERVIDA 0%) siguen siendo el marco de las clases de costo.

**Consecuencia de no decidir.** Los reportes IPV históricos seguirán mostrando márgenes inflados (costo 0 = margen 100%); la contaminación del Kardex no se corrige; CP-IPV-002 no cierra y arrastra 001/003/004.

**Alternativas.**
1. **Congelar el período histórico y marcar calidad de datos** (mínima): no se recalcula nada; los reportes históricos llevan una anotación técnica «período con costo indeterminado»; todo lo nuevo ya calcula COGS correcto.
   - Ventajas: cero riesgo contable; cero mutaciones.
   - Riesgos: la distorsión persiste visible para el negocio.
   - Efecto sobre datos: ninguno (solo reportes/anotaciones).
2. **Backfill basado en evidencia, con separación estricta original/derivado** (recomendada): para cada entrada Kardex con costo 0, derivar costo desde la evidencia disponible (`wac_change_log` del producto/tienda en ese período; recepciones documentadas), registrar el costo derivado **sin mutar la entrada original** (columna derivada `unit_cost_derived` + origen + hash de evidencia), y marcar como «no determinable» lo que no tenga respaldo. La corrección técnica queda separada de la aprobación contable: usted decide después si el valor derivado se contabiliza.
   - Ventajas: trazable, auditable, reversible (columnas nuevas, cero UPDATE destructivo); respeta «no inventar costos ni alterar transacciones cerradas».
   - Riesgos: parte del 38% quedará «no determinable» (honesto, no fallo).
   - Efecto sobre datos: aditivo (columna derivada + tabla de evidencia); filas originales intactas.
3. **Re-costeo contable pleno** con facturas externas y política por clase de costo: pesado, requiere su política contable explícita y documentos externos (facturas ENERVIDA/VITALLCONS).
   - Ventajas: cierre contable real.
   - Riesgos: alto esfuerzo; dependencia de documentación externa que hoy no está en el sistema.
   - Efecto sobre datos: recalculo con log auditable por producto.

**PROPUESTA (técnica):** alternativa 2. Separar explícitamente la corrección técnica (derivar costos con evidencia, sin mutar originales) de la aprobación contable (su decisión posterior sobre contabilizar). La alternativa 1 queda como sub-paso automático para lo «no determinable».

**Qué puedo seguir haciendo sin su decisión:** el dataset de evidencia read-only YA está construido (2026-10-18, `evidence/20261018-cogs-cobertura/INFORME_READ_ONLY.md`): **solo 8/632 entradas (1,3%) son derivables con evidencia interna de WAC**; 624 (98,7%) requieren facturas externas o quedan «no determinables». Distribución: ENERVIDA 420 dispersas (ago–oct, coincide con CP-IPV-004 «procedencia 0%») + Puerto Padre 212 TODAS el 2026-08-16 (carga masiva con costo 0). Su decisión puede ser por partes: congelar/anotar (altern. 1) para Puerto Padre y las 616 no derivables de ENERVIDA; derivar (altern. 2) para las 8 con respaldo; re-costeo contable (altern. 3) solo si consigue facturas ENERVIDA.

---

## DECISIÓN D — BUG-024: persistencia de incidents legales (desbloquea BUG-024)

**Problema concreto.** `/api/legal/incidents` registra «incidentes de seguridad/legal» en un archivo local (`data/incidents.json`). El sistema de archivos es efímero (un reinicio del entorno pierde lo no versionado; un deploy también). Si estos incidentes deben servir como evidencia operativa o de cumplimiento, hoy no cumplen ese papel.

**Diagnóstico (investigación completada hoy).**
- El endpoint es **solo POST** (sin GET, sin UI, sin lector). `data/incidents.json` está versionado en git como plantilla **vacía** (0 incidentes registrados jamás; creado como stub de «Incident Response Plan compliance»).
- Qué se pierde al reiniciar/redeploy: cualquier incidente registrado en runtime (nunca commiteado). Hoy: nada (0 registros), pero el riesgo estructural existe.
- Naturaleza de los datos: texto libre (título + descripción hasta 5.000 caracteres) + severidad — puede contener información sensible de personas/operaciones. Escritores: cualquier usuario autenticado (rate-limit 5/min). Lectores previstos: nadie hoy.
- Volumen esperado: bajo (incidentes de seguridad legal), retención larga (años, por cumplimiento).
- Infraestructura ya disponible: tabla `audit_logs` (persistente, con user/store/action/record/metadata JSONB, RLS vigente y consumidores existentes) y `sales.payment_incidents` (jsonb, específico de pagos POS — no aplica aquí).

**Alternativas.**
1. **Persistir en `audit_logs` sin crear tabla nueva** (recomendada): el POST escribe además una fila `audit_logs` con `action='legal_incident'` y `metadata` = registro completo (severidad, título, descripción, reporter, timeline). Añadir GET admin-only que lea de `audit_logs`.
   - Ventajas: cero migraciones/RLS nuevas; persistencia real; auditable; el endpoint mantiene su contrato; reversible (bastaría retirar la doble escritura).
   - Riesgos: el ciclo de vida (estado open/resolved, edición de timeline) queda limitado a convención en metadata JSONB — suficiente para evidencia, insuficiente si se quiere gestión de incidentes como proceso activo.
   - Efecto sobre datos: ninguno histórico (0 incidentes); solo nuevas filas.
2. **Tabla dedicada `legal_incidents`** con ciclo de vida completo. Esquema previo (exigido antes de cualquier ejecución): `id uuid PK`, `title text`, `description text`, `severity text CHECK IN ('critical','high','medium','low')`, `reporter text`, `status text DEFAULT 'open'`, `actions_taken jsonb`, `resolution text`, `timeline jsonb`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`; RLS: INSERT solo `authenticated`, SELECT solo roles admin/owner (vía `is_admin()` existente), sin UPDATE/DELETE (append-only como evidencia); retención ≥ 3 años con purge manual autorizado; información sensible: descripción libre → tratar como confidencial (sin logs adicionales del contenido); migración aditiva una tabla; pruebas: contrato POST→row + RLS negativo/positivo + GET admin; reversión: `DROP TABLE legal_incidents` (sin dependencias).
   - Ventajas: gestión de ciclo de vida real si el proceso se activa.
   - Riesgos: infraestructura duplicada sobre `audit_logs` para un flujo hoy sin uso; más superficie de seguridad.
   - Efecto sobre datos: tabla nueva vacía + migración.
3. **Mantener el archivo**: **descartada** — depende del FS efímero, contradice el criterio de evidencia operativa.

**PROPUESTA (técnica y de negocio):** alternativa 1 (audit_logs) ahora; escalar a la alternativa 2 solo si la operación empieza a gestionar incidentes activamente (asignación, resolución, notificaciones). Con 0 incidentes históricos, crear hoy tabla+migración+RLS no está justificado por necesidad real.

**Qué puedo seguir haciendo sin su decisión:** tests del contrato actual (401/rate-limit/validación) ya cubiertos por E2E BUG-017; nada más — la implementación queda a la espera de su aprobación porque cambia el destino de persistencia de evidencia legal.

---

## DECISIÓN E — Aplicación de la migración `20261018000000` y merge del PR #1422 (desbloquea el cierre de la misión política temporal)

**Problema concreto.** El PR #1422 (política temporal de extremo a extremo) tiene su migración BD **escrita, corregida y verificada, pero NO aplicada** a la BD viva (compromiso de la sesión anterior: aplicación por procedimiento autorizado del propietario). Hoy: rutas API y UI ya hacen cumplir el tope HOY; el refuerzo RPC cubriría llamadas directas (p. ej. transferencias desde el navegador vía RPC).

**Evidencia actual.**
- Hoy corregí un defecto real en la migración: **faltaban los `;` de terminación de 3 de las 4 funciones** → el archivo no era SQL aplicable por procedimiento estándar y, además, evadía silenciosamente el replay del Security Audit (create_transfer/7 y register_supplier_payment/12 quedaban fuera de la verificación). Tras el fix: **CI del PR #1422 100% verde** (Security Audit, Allowlist Review, TS Security, Unit & Integration, TypeCheck+Lint+Build) y el drift LIVE≠replay documentado con baseline con expiración 2026-11-30.
- Confirmé en vivo que las 3 funciones aún NO llevan el gate (la BD funciona hoy protegida por las rutas, no por RPC).

**Alternativas.**
1. **Aplicar la migración con el procedimiento autorizado** (backup `pg_get_functiondef` de las 4 funciones → aplicar → verificar gates con pruebas de humo → re-certificar `contract-surface.sql` → eliminar las 3 entradas de baseline → merge del PR #1422). Es el mismo flujo histórico ya usado en el repo («re-certifica contract surface tras la migración»).
   - Ventajas: refuerzo BD activo contra llamadas RPC directas; PR mergeable de inmediato; eliminamos la deuda del baseline.
   - Riesgos: cambio de comportamiento para llamadas RPC directas con fechas futuras (deseado; las rutas ya lo imponen); revertible restaurando los backups.
   - Efecto sobre datos: solo definiciones de funciones (CREATE OR REPLACE); cero datos.
2. **Merge del PR sin aplicar la migración** (el baseline mantiene CI verde hasta 2026-11-30).
   - Ventajas: código integrado ya.
   - Riesgos: el refuerzo RPC queda latente; el baseline vence y bloque CI si no se aplica antes.
   - Efecto sobre datos: ninguno.
3. **Dejar el PR abierto** hasta nueva orden.
   - Riesgos: el trabajo protegido pero no integrado; riesgo de divergencia con main creciendo.

**PROPUESTA (técnica):** alternativa 1, ejecutada por mí con su autorización expresa para el DDL en la BD viva (única escritura que falta; todo lo demás ya está verificado). El merge de #1422 después de aplicar y re-certificar.

**Qué puedo seguir haciendo sin su decisión:** el PR ya está verde y protegido; puedo continuar con tareas de remediación independientes sin tocar la BD.

---

## Resumen de decisión para el propietario (checklist de aprobación)

| # | Decisión | Estado | Mi propuesta | Qué autoriza usted |
|---|---|---|---|---|
| A | Stock negativo | Pendiente | Ratificar política «nunca negativo» + ajustes gobernados | Política + lote de ajustes de los 4 SKU |
| B | DT-03 multi-tenant | **CONFIRMADA 2026-10-19** | Arquitectura multi-tenant conservada; protocolo ejecutado | Backfill de 1 perfil (david9999) + sub-decisión B.1 |
| C | COGS histórico | Pendiente | Derivar costos con evidencia sin mutar originales; separar técnico/contable | Política contable por clase de costo |
| D | BUG-024 incidents | Pendiente | Persistir en `audit_logs` (sin tabla nueva) | Destino de persistencia de evidencia legal |
| E | Migración 20261018000000 | Pendiente | Aplicar con procedimiento autorizado + re-certificar + merge #1422 | Autorización de DDL en BD viva |

Mientras decide, continuaré con: conciliación read-only de stock (A), tests de aislamiento multi-tienda (B), dataset de evidencia de costos (C) y demás tareas de remediación independientes del inventario maestro.
