# COSTPRO BUSINESS RULES ASSURANCE STANDARD — **CP-BRA-001**
**Versión:** 1.0 · **Fecha:** 2026-11-26 · **Estado:** VIGENTE — referencia obligatoria para agentes, desarrolladores y misiones futuras.
**Documentos hermanos:** BUSINESS-RULES-CATALOG.md · DOMAIN-INVARIANTS.md · STATE-MACHINES.md · CROSS-MODULE-WORKFLOWS.md · TRACEABILITY-MATRIX.md · RISK-REGISTER.md · CERTIFICATION-POLICY.md

> **Principio fundamental:** COSTPRO debe funcionar como un sistema empresarial coherente, no como una colección de pantallas independientes. Una operación que se permite desde una pantalla pero produce una inconsistencia en otro módulo es un defecto del sistema. Una operación que se impide visualmente pero puede ejecutarse por API/RPC sin autorización es un defecto del sistema. Una operación que parece correcta pero deja movimientos financieros sin correspondencia documental es un defecto del sistema.

---

## 0. BASES EXTERNAS — QUÉ APORTA CADA METODOLOGÍA

| Fuente | Referencia oficial | Qué aporta a CP-BRA-001 |
|---|---|---|
| OWASP Business Logic Security Cheat Sheet | cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html | Re-derivar server-side los valores con seguridad financiera (precios/tasas/roles); flujos como máquinas de estado server-side; rechazar replay de pasos completados; race conditions con transacciones/locks/idempotency keys; «Write Down the Invariants»; pruebas con mentalidad adversaria (out-of-order, replay, workflow bypass) |
| ISO/IEC 25010:2023 (SQuaRE, ed. 2, 2023-11) | iso.org/standard/78176.html | Modelo de 9 características para evaluar calidad MÁS ALLÁ de la UI: adecuación funcional (¿las funciones cumplen las tareas del negocio?), corrección/completitud funcional, fiabilidad, seguridad, mantenibilidad. La matriz de cobertura del catálogo se alinea con «completitud funcional» |
| ISO/IEC/IEEE 29119 (partes 1-5; 29119-1:2022) | iso.org/standard/81291.html | Proceso de pruebas documentable y repetible: plan por misión → diseño (casos derivados de la regla) → ejecución con evidencia → informe. Las plantillas §11 provienen del concepto de test plan/design/spec |
| ISTQB CTFL 4.0 | astqb.org (syllabus 4.2 técnicas black-box) | State Transition Testing (matrices §STATE-MACHINES), Decision Table Testing (reglas con múltiples condiciones → §11.4), Boundary Value Analysis 2/3-valores (montos ±0.01, stock 0, fechas), Negative Testing y Risk-Based Testing (priorización P1-P4 del registro) |
| OMG DMN | omg.org/spec/DMN | Tablas de decisiones formales para reglas con muchas condiciones/excepciones (p. ej. matriz de roles por documento `DOCUMENT_REVERSE_ROLES`, gate supervisor ≥15%): exigible cuando una regla tiene ≥3 condiciones de entrada |
| Pruebas de propiedades/modelos (fast-check, compatible con bun/vitest) | fast-check.dev | Property-Based Testing para invariantes (Σ cobros = total para CUALQUIER carrito; moneda de origen preservada; Total=Pagado+Saldo para cualquier secuencia de pagos/reversas). Adopción: opcional y gradual — NO se introduce dependencia nueva sin decisión |
| Metamorphic/Invariant/Contract/Mutation testing | (prácticas) | Metamórfica: «anular tras pagar debe dejar Σefectos=0» sin necesidad de oráculo nuevo; Contract testing ya existe en el repo (BOLA contract, security-contract) y es el patrón a extender; Mutation testing: evaluación futura opcional |

**Nota irrenunciable:** adoptar estas prácticas NO significa que COSTPRO esté «certificado ISO». El resultado es un estándar interno basado en buenas prácticas reconocidas, con referencias oficiales citadas.

## 1. METODOLOGÍA DE IDENTIFICACIÓN DE REGLAS

1. **Explorar el código real, no la documentación** (lección fundacional: los comentarios describen intenciones, el código describe realidad).
2. Fuentes, en orden de autoridad: restricciones/triggers/policies en migraciones → RPCs SECURITY DEFINER (validaciones ERR_*) → wrappers API (withAuth/withRole/withStoreAccess, zod) → componentes/store del frontend → expedientes de incidentes en `docs/audits/` → comportamiento observado en pruebas.
3. Toda regla se escribe con evidencia `archivo:línea`. Interpretación sin evidencia = INFERIDA, nunca CONFIRMADA.
4. Las reglas ambiguas contables/comerciales se documentan con opciones justificadas y se marcan `REQUIERE DECISIÓN` — el agente NO inventa la regla.
5. Catálogo con IDs permanentes (familias FIN/INV/PUR/POS/DOC/PRO/CAT/TEN/SEC/HR/REP/SYS). Un ID nunca se reutiliza; una regla deprecada se marca OBSOLETA, no se borra.

## 2. CLASIFICACIÓN POR CRITICIDAD

| Nivel | Criterio | Requisito de pruebas |
|---|---|---|
| CRÍTICA | Dinero, saldos, inventario, aislamiento multitienda, trazabilidad, operaciones legítimas | Positiva + negativa + regresión + (si aplica) integración transversal; imposición server-side OBLIGATORIA |
| ALTA | Documentos, relaciones, reportes; duplicados | Positiva + negativa |
| MEDIA | Funcionalidad sin impacto directo demostrado de integridad | Positiva |
| BAJA | Usabilidad/documentación/mantenimiento | Según riesgo |

## 3. INVARIANTES (referencia)
El inventario vivo está en DOMAIN-INVARIANTS.md. Regla del estándar: **todo invariante declarado debe tener punto de imposición único y verificable**; si hay N writers del invariante, o se centraliza la imposición, o se documenta el contrato de writers en la propia entrada (patrón de la lección R-01).

## 4. MÁQUINAS DE ESTADOS (referencia)
Vivas en STATE-MACHINES.md. Reglas del estándar:
- Toda entidad con ciclo de vida DEBE estar en el mapa del trigger global `fn_validate_document_transition` o tener su máquina impuesta en RPC con prueba negativa de cada transición ilegal.
- Toda máquina define: estados, transiciones permitidas con actor y precondiciones, efectos secundarios, reversibilidad y operación compensatoria.

## 5. MATRICES DE DECISIÓN
Cuando una regla tenga ≥3 condiciones (roles × estado × monto × moneda…), se documenta como tabla de decisiones DMN-style y cada columna relevante debe tener al menos un test. Ejemplo vigente: matriz `DOCUMENT_REVERSE_ROLES` (src/lib/roles.ts:197-203).

## 6. PRUEBAS NEGATIVAS (obligatorias para reglas CRÍTICAS/ALTAS)
El catálogo de escenarios negativos mínimos por familia (plantilla):
- FIN: sobrepago (y con reversas neteadas), pago duplicado (misma idempotency_key), DELETE de pago, anulación con pagos vivos, tasa inválida/caducada, moneda del doc ≠ moneda del pago sin regla.
- INV: stock negativo, doble consumo de reserva, costo del cliente, ajuste sin autorización.
- POS: total≠Σcobros, carrito vacío, cantidad ≤0, precio manipulado, supervisor sin token/expirado, doble clic.
- DOC: transición ilegal por cada flecha prohibida de la matriz de estados.
- TEN/SEC: acceso cruzado de tiendas, rol insuficiente, sin sesión, replay de token de un solo uso.
- PRO: alta duplicada por grafías/espacios.

## 7. PRUEBAS TRANSVERSALES (anti «arreglar un módulo y romper otro»)
Al modificar cualquier **writer** de un invariante con múltiples rutas (salidos desnormalizados, tasas, conversión CUP, elegibilidad de reporte), la misión DEBE:
1. Listar TODAS las rutas que leen el valor (grep declarado en el PR).
2. Re-ejecutar las pruebas de cada ruta consumidora (o explicar por qué no cambian).
3. Incluir prueba metamórfica del ciclo completo (ej.: crear→pagar→anular → Σefectos netos = 0 en pagos, asientos e inventario).

## 8. INTEGRIDAD FINANCIERA (no negociables)
- Re-derivación server-side de: precios, costos (WAC), impuestos, tasas de cambio (jerarquía canónica), saldos. El cliente nunca tiene autoridad financiera (lección D8; brecha activa R-06 FIN-007 por cerrar).
- Partida doble solo por el motor; asiento único por (doc, evento, pago); anulación con asiento compensatorio y reversión documental simétrica.
- Monedas: prohibido sumar monedas distintas; `amount_cup` con tasa registrada por fila; vistas con tasa fija PROHIBIDAS (R-02).
- Idempotencia en toda operación monetaria; lock antes de leer saldos; overpay prohibido neteando reversas.

## 9. INTEGRIDAD DE INVENTARIO
- Existencia = `inventory.quantity` (única fuente); ledger append-only; escritura solo vía `register_stock_movement`.
- Costo siempre server-side; kardex automático; reconstrucción Σ movimientos = existencia como objetivo de auditoría (drift → detector, no corrección silenciosa).

## 10. MULTITIENDA Y SEGURIDAD
- `has_store_access`/`has_store_role` como única puerta de pertenencia; RLS default-deny; tenant_id + triggers de coherencia; funciones SECURITY DEFINER con auth-check o ACL exclusiva documentada + allowlist con expiración.
- Producción NUNCA es banco de pruebas (SYS-003; guards vigentes).

## 11. CONCURRENCIA E IDEMPOTENCIA
- Lock (advisory o FOR UPDATE) ANTES de leer condición; idempotency key en toda operación con efecto; unicidad estructural para compensaciones; replay determinista en batch.
- Prueba mínima de duplicación simultánea para toda operación crítica nueva.

## 12. TRAZABILIDAD
- Cadena obligatoria: Regla → Requisito → Entidad → Implementación → Control → Prueba → Evidencia (formato TRACEABILITY-MATRIX.md).
- Auditoría: toda escritura sensible con trigger de auditoría; constraint whitelist de audit_logs revisada al auditar tablas nuevas (R-20).

## 13. GESTIÓN DE EXCEPCIONES
- Toda excepción a una regla (p. ej. reversión de pagos de documentos anulados para limpieza) debe estar: documentada en la regla, en allowlist con `reason/added_by/expires` si es técnica, y con auditoría. Excepciones sin fecha de expiración no son excepciones, son reglas nuevas.

## 14. CRITERIOS DE CERTIFICACIÓN
Los de CERTIFICATION-POLICY.md §2-3 (CERTIFICADO/CONDICIONAL/RECHAZADO + certificado de alcance). Resumen: sin imposición server-side verificable no hay regla crítica certificada; sin prueba negativa no hay regla ALTA certificada.

## 15. EVIDENCIAS OBLIGATORIAS
1. Salidas de suites con conteos (vitest/E2E) y enlace de run de CI.
2. Expediente en `docs/audits/<MISION>/` con DIAGNOSTICO/RESULTADOS y evidencia binaria en `audit-evidence/` con SHA256SUMS.
3. Para reglas nuevas/alteradas: fila de trazabilidad + entrada de catálogo actualizada + pruebas en CI.
4. Para migraciones: replay regenerado (`build-migrations-replay.mjs`) y gates SQL verdes.

## 16. GESTIÓN DE DEFECTOS
RISK-REGISTER como registro único; CRÍTICO → misión de remediación independiente (con criterios, riesgos, pruebas); contención prioritaria si hay exposición activa de dinero/datos; prohibiciones de remediación (no tocar histórico, saldos, reversiones ejecutadas, consolidación de terceros, inventarios, reglas ambiguas sin aprobación).

## 17. CONDICIONES DE ACEPTACIÓN DE UN PR (checklist del revisor)
- [ ] La sección «Reglas de negocio afectadas» del PR está completa con IDs válidos o «NINGUNA» justificado (gate CI).
- [ ] Si afecta reglas: catálogo + trazabilidad actualizados; pruebas positiva/negativa/regresión añadidas o actualizadas.
- [ ] Si toca writers de invariantes multi-ruta: §7 cumplido (rutas listadas + pruebas consumidoras).
- [ ] Si toca migraciones: replay regenerado, guards idempotentes, marcador DESTRUCTIVE-OK si procede, ACL re-declaradas (DROP+CREATE).
- [ ] Gates existentes verdes (SEC-TS, destructive, writers, SQL Security, security-contract, E2E Aislado).
- [ ] Sin secretos en el diff; sin weaken de RLS/gates; sin «certificado» afirmado sin certificado de alcance.

## 18. PLANTILLAS REUTILIZABLES

### 18.1 Plantilla de regla (catálogo)
```markdown
### <FAM>-<NNN> · <Nombre>
- Estado: CONFIRMADA|TÉCNICA|INFERIDA|CONTRADICTORIA|AUSENTE|OBSOLETA · Severidad: ... · Cumplimiento: CUMPLE|PARCIAL|FALTA|REQUIERE DECISIÓN
- Descripción empresarial: ... · Justificación: ...
- Módulos/entidades: ... · Precondiciones: ... · Permitidas: ... · Prohibidas: ...
- Estados/transiciones: ... · Efectos sobre otros módulos: ...
- Controles (capa → referencia): ... · Pruebas: ... · Evidencia: file:line · Riesgos/excepciones: ...
```

### 18.2 Plantilla de invariante
```markdown
| INV-<DOM>-<NN> | <enunciado> | <imposición real> | <verificación> | GARANTIZADO/PARCIAL/NO GARANTIZADO |
```

### 18.3 Plantilla de máquina de estados (por entidad)
```markdown
## <Entidad> — diagrama ASCII · tabla de transiciones (origen→destino|actor|precondiciones|efectos)
Transiciones prohibidas: ... · Reversibilidad: ... · Operación compensatoria: ...
Pruebas negativas: ... · Evidencia: file:line
```

### 18.4 Plantilla de tabla de decisiones (DMN-lite)
```markdown
| Regla <ID> | C1: <condición> | C2: ... | C3: ... | Acción |
|---|---|---|---|---|
| R1 | ... | ... | ... | <permitir/rechazar/efecto> |
```
Cada columna con ≥1 test en CI.

### 18.5 Plantilla de caso de prueba (29119-lite)
```markdown
TC-<MISION>-<NNN> · Regla: <ID> · Tipo: positiva|negativa|límite|transición|metamórfica
Precondiciones: ... · Pasos: ... · Resultado esperado: ... · Evidencia: <run/artefacto>
```

### 18.6 Plantilla de certificado de alcance
La de CERTIFICATION-POLICY.md §3.

### 18.7 Plantilla de misión de remediación
```markdown
MISIÓN CP-REM-<NNN> · Defecto: <R-ID> · Regla(s): <IDs>
Objetivo verificable: ... · Alcance EXCLUIDO (no tocar): ...
Riesgos de la corrección: ... · Pruebas: positiva/negativa/regresión/transversal (§7)
Canal: migración aditiva + RPC + gates; validación en aislada; aplicación única en producción documentada
```

## 19. INSTRUCCIÓN PERMANENTE PARA TODOS LOS AGENTES
Incorporada a `AGENTS.md` (raíz del repo). Ningún agente podrá declarar completa una misión que altere reglas empresariales sin: identificar las reglas afectadas · revisar dependencias transversales · identificar estados y transiciones · probar operaciones válidas · probar operaciones prohibidas · verificar invariantes · probar efectos en otros módulos · verificar seguridad y multitienda · demostrar persistencia y trazabilidad · adjuntar evidencia reproducible. Si no puede identificar una regla, lo declara; si no puede probarla, no la certifica; si encuentra contradicción entre módulos, detiene la implementación afectada y documenta el conflicto; si una regla depende de una decisión del negocio, solicita esa decisión antes de inventar una interpretación.
