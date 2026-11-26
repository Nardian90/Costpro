# DECISION-R05 — Política de autorización para confirmación de ajustes de inventario

**Misión:** CP-BRA-FINAL-VERIFICATION-AND-INV005-001 · **Fecha:** 2026-11-26
**Regla:** INV-005 (R-05, CRÍTICO según RISK-REGISTER CP-BRA-001) · **Estado: PROPUESTA — SIN IMPLEMENTAR.** Este documento no modifica el RPC, las políticas de autorización ni la UX; detiene su ejecución hasta decisión expresa del propietario (misión §7, §0 «No tienes autorización para…»).

---

## 1. Descripción del riesgo

**Regla de negocio que hoy NO está garantizada (estado «ausente» en capa autoritativa):** «La confirmación de un ajuste de inventario — que sobrescribe el stock físico y genera movimiento de kardex — exige autorización de perfil con gestión».

**Contrato real verificado en producción** (`pg_get_functiondef` de `confirm_inventory_adjustment(uuid, uuid)`):

| Control | Estado real |
|---|---|
| Estado del documento | ✅ solo `pending` (`ERR_NOT_PENDING`) |
| Usuario autenticado | ✅ (`ERR_UNAUTHENTICATED`) |
| Autorización | ⚠️ `is_admin_check` **OR `has_store_access_as(uid, store)`** = **cualquier membresía activa** (encargado, **clerk**, usuario) — la granularidad por operación (`adjustment` → manager|encargado) existe en el historial de migraciones (20261027120000) pero **no en la función vigente** |
| Motivo obligatorio en la confirmación | ❌ no se exige |
| Evento de auditoría (`audit_logs`) | ❌ el RPC no lo escribe (la única traza es el movimiento de kardex) |
| Reversión de ajustes | gated en UI por `canReverseDocumentInStore(…, 'adjustment')` (admin/manager/encargado) — **asimetría: confirmar es más permisivo que anular** |

**UI (verificada en código):** el botón «Confirmar ajuste (aplica al inventario)» en `InventoryAdjustmentsView.tsx:387` **no tiene gate de rol** (el de Anular sí); `PhysicalInventoryDetail.tsx` sí limita autorización a admin/manager/encargado **solo en la UI** (`canAuthorize`). El Principio Fundamental §20 de la misión se aplica: *«interfaz prohibida pero API/RPC accesible = defecto»*.

**Superficie de ataque:** RPC ejecutable por `authenticated` (ACL verificada); un `clerk` con sesión puede confirmar cualquier ajuste pendiente de su tienda vía PostgREST, sin motivo y sin evento de auditoría.

## 2. Evidencia histórica (producción, solo lectura — `scripts/cpbra-r05-inventory-adjustments.mjs`)

- **1 ajuste confirmado en todo el historial** (2026-10-26): confirmó un usuario con rol `encargado` (membresía activa), 1 ítem («Barrena 6mm Madera»), sistema=1 → contado=0, **desviación de 1 unidad** (100 % del stock del ítem), motivo `OTHER`. Lectura: caso típico de inventario físico que encuentra un faltante — **aparentemente legítimo** y de valor absoluto mínimo.
- **Roles reales** (`user_store_memberships`): `encargado` 11, `clerk` 6, `admin` 4, `usuario` 1. Los `clerk` existen en operación y hoy pueden confirmar vía RPC.
- **0 cierres fiscales, 0 reversiones de ajustes** registradas.

## 3. Escenarios de umbral (sin imponer número)

Distribución de desviaciones disponible: **n = 1 ítem** (100 % de desviación relativa; valor absoluto 1 unidad).

| Umbral propuesto | Ítems históricos que habrían requerido supervisión |
|---|---|
| ≥5 % | 1 de 1 |
| ≥10 % | 1 de 1 |
| ≥15 % | 1 de 1 |
| ≥20 % | 1 de 1 |
| ≥25 % | 1 de 1 |

**⚠️ No existe evidencia suficiente para establecer estadísticamente un umbral.** Con n=1, cualquier umbral «demuestra» lo mismo. La misión exige declararlo: **se indica expresamente que la evidencia actual es insuficiente para fijar un porcentaje por datos**. El único anclaje no estadístico disponible es la **consistencia interna del sistema**: el patrón D1–D5 del POS (`create_sale_v2`) ya usa el 15 % como frontera de supervisión obligatoria para descuentos; unificar esa cifra daría un criterio homogéneo «exceso sobre lo esperado → supervisor». Esa elección sigue siendo del propietario.

## 4. Alternativas evaluadas (obligatorias según misión §7.1)

### A. Control por rol
Solo perfiles con gestión confirman (espejo de `canManageStore`: admin/superadmin o membresía `encargado|manager|admin` — excluye `clerk`).

- **Seguridad:** elimina el acceso de perfiles de venta al cambio de stock. Sólida y simple.
- **Facilidad operativa:** sin fricción para los que hoy operan (el único caso histórico fue hecho por `encargado`, que pasa el control).
- **Riesgo de abuso:** reduce superficie (19 usuarios → 15); no elimina abuso de un encargado malintencionado.
- **Riesgo de bloquear legítimos:** bajo (0 casos históricos de clerk confirmando).
- **Complejidad técnica:** baja — una condición en el RPC + un gate en la UI (el segundo es simétrico con Anular).
- **Compatibilidad:** total con el patrón existente (`canReverseDocumentInStore` ya define admin/manager/encargado para `adjustment`).
- **Débil frente a:** encargado con error operativo o abuso — nada lo revisa si la desviación es pequeña.

### B. Control por umbral
Flujo normal para desviaciones ordinarias; supervisión superior al superar un umbral.

- **Seguridad:** foca el control en el riesgo real (grandes desviaciones), pero **deja el umbral sin evidencia** (n=1).
- **Facilidad operativa:** no bloquea el día a día (ajustes pequeños sin fricción).
- **Riesgo de abuso:** un usuario puede **fraccionar** ajustes por debajo del umbral (salting) — el umbral solo, sin rol, no evita abuso deliberado.
- **Riesgo de bloquear legítimos:** medio si el umbral es bajo (un inventario físico real genera % altos en ítems de stock pequeño, como el caso histórico de 100 %).
- **Complejidad:** media — requiere computar % por ítem (con denominador 0: regla explícita) y un segundo flujo de autorización (¿segunda firma? ¿supervisor en UI? — el sistema ya tiene supervisor D1–D5 en POS como maquinaria reutilizable).
- **Compatibilidad:** el patrón supervisor+motivo ya existe (`ERR_SUPERVISOR_REQUIRED`), es reutilizable.

### C. Control combinado (recomendado)
Rol (A) + umbral con supervisión (B) + motivo obligatorio + evento de auditoría + doble autorización cuando el umbral se supere.

- **Seguridad:** defensa en profundidad — rol cierra el acceso básico; umbral detecta el impacto; motivo+auditoría hacen todo trazable (criterio §20: jamás silencioso).
- **Facilidad operativa:** el caso histórico real (encargado, 1 unidad) habría requerido SOLO motivo — sin fricción adicional ni bloqueo.
- **Riesgo de abuso:** mínimo — fraccionar sigue dejando motivo+auditoría; la doble autorización cubre los casos grandes.
- **Riesgo de bloquear legítimos:** bajo (motivo es una línea; la supervisión solo entra por umbral).
- **Complejidad:** media-alta (RPC + UI + prueba doble-vía), pero usa maquinaria existente (`is_admin_check`, membresías, patrón supervisor D1–D5, `audit_logs`).
- **Compatibilidad:** coherente con SEC-001 (última barrera en BD), con FIN/INV-FAIL-CLOSED y con la política de trazabilidad.

## 5. Comparación

| Criterio | A (rol) | B (umbral) | C (combinado) |
|---|---|---|---|
| Ciera el hueco RPC-vs-UI | ✅ | ❌ (clerk sigue pudiendo) | ✅ |
| Detecta abuso de perfil autorizado | parcial | parcial | ✅ |
| Evidencia histórica disponible para calibrar | ✅ (0 falsos positivos) | ❌ (n=1) | ✅ |
| Fricción operativa | mínima | mínima | baja |
| Complejidad de implementación | baja | media | media-alta |
| Trazabilidad añadida | parcial | parcial | ✅ total |

## 6. Recomendación

**Adoptar C (control combinado), escalonado en dos incrementos verificables:**

1. **Incremento 1 (control base, sin decisión de umbral pendiente):**
   - RPC: exigir `is_admin_check OR membresía activa con rol ∈ (admin, manager, encargado)` — **fail-closed** para `clerk`/`usuario`; error `ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED`.
   - RPC: exigir motivo (`p_reason` ≥ 3 caracteres) y escribir `audit_logs` (`ADJUSTMENT_CONFIRMED` con items, desviaciones por ítem, motivo, usuario).
   - UI: gate de rol simétrico en el botón Confirmar (reutilizar `canReverseDocumentInStore(…, 'adjustment')` que ya define admin/manager/encargado) + campo de motivo obligatorio en el modal.
   - Pruebas: positivas (encargado confirma con motivo), negativas (clerk → 403, sin motivo → `ERR_*`), regresión (confirmación por inventario físico `PhysicalInventoryDetail`), contrato SQL y manifest.

2. **Incremento 2 (umbral — requiere decisión del propietario):**
   - Umbral **configurable por tienda** (sin constante en código) con valor inicial propuesto por consistencia: **15 %** (el mismo del patrón D1–D5 del POS) **o el que el propietario decida**; regla para denominador 0 (`stock esperado ≤ 0 y contado ≠ 0` → siempre supervisión).
   - Desviación ≥ umbral → exigir segundo actor con perfil de gestión (patrón supervisor de `create_sale_v2`, reutilizable con `supervisor_token`/`supervisor_user_id`) + evento de auditoría diferenciado (`ADJUSTMENT_CONFIRMED_ABOVE_THRESHOLD`).
   - Calibración: re-evaluar con ≥10 ajustes históricos (hoy n=1) antes de endurecer.

**Alternativa si se prefiere mínima intervención:** solo Incremento 1 (equivalente a A + motivo + auditoría) — cierra el hueco crítico de seguridad sin fijar política de umbral. **La opción B sola NO se recomienda** (no cierra el acceso de clerk y es fraccionable).

## 7. Impacto sobre las tiendas

- 15/22 membresías (encargado 11 + admin 4) conservan capacidad de confirmar; **7 membresías clerk pierden el acceso directo** (verificado: 0 confirmaciones históricas por clerk → impacto operativo real esperado: nulo).
- Flujo por inventario físico (`PhysicalInventoryDetail`): su botón de autorización ya es admin/manager/encargado en UI — sin cambio de comportamiento; solo se añade motivo y auditoría.
- Un inventario físico grande (muchos ítems con % alto en stock bajo) puede activar la supervisión del Incremento 2 con frecuencia: el umbral configurable y la calibración futura mitigan ese riesgo.

## 8. Pruebas de aceptación (para la futura misión de implementación)

1. clerk intenta confirmar → `ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED` (403) — negativa.
2. encargado confirma con motivo → aplica stock + kardex + `ADJUSTMENT_CONFIRMED` — positiva.
3. encargado confirma sin motivo → error (negativa).
4. admin/superadmin confirma → OK (positiva).
5. Ajuste desde inventario físico → fluye con motivo autogenerado («Ajuste por inventario físico PI-…») — regresión.
6. Con umbral: desviación ≥ umbral sin segundo actor → error; con supervisor → OK + `ADJUSTMENT_CONFIRMED_ABOVE_THRESHOLD` (positiva + negativa).
7. Concurrencia: dos confirmaciones simultáneas → 1 aplica, 1 `ERR_NOT_PENDING` (idempotencia de estado).
8. Multi-tienda: clerk de tienda B no puede confirmar ajuste de tienda A (aislamiento TEN).
9. Contrato de superficie SQL re-certificado; writers.manifest sin nuevas vías sin guard.

## 9. Decisiones reservadas al propietario

1. **Aprobar la opción C (o A)** — es política de autorización operativa (fuera del alcance de un agente).
2. **Fijar el umbral** del Incremento 2 (15 % por consistencia con POS como propuesta; la evidencia propia de ajustes es insuficiente — declarado en §3) y si aplica por ítem o por valor monetario del ajuste.
3. **Decidir si los `clerk` necesitan alguna vía de excepción** (p. ej., jefatura ausente en tienda remota) — hoy no existe tal caso en el historial.
4. **Observación adyacente a decidir (no bloquea R-05):** el movimiento de kardex se registra con `p_unit_cost := 0` — la valuación de ajustes (impacto en costo/WAC) es territorio protegido (AGENTS.md: fórmulas de costos no se modifican por iniciativa del agente); se recomienda evaluarla en una misión separada de valuación si el propietario lo desea.
