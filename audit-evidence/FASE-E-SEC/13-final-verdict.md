# FASE E-SEC — 13 FINAL VERDICT (§22/§23)

## Fecha / HEAD certificado
2026-09-26 · **6022ae85b3d29e2573caa22a8538d4a97f2d02a3** (remote == local, verificado).
Ejecución completa de la fase: 2026-09-26T01:30Z → 04:05Z, servidor dev PM2 :3000,
LIVE Supabase (migración aplicada), navegador real.

## Tabla de veredicto (§23)

| Área | Resultado | Evidencia |
|---|---|---|
| Precio editable legítimo | **PASS** | 05 (A2/A3/A10/A16/A21e/B10 = 200; venta UI real 490 → tx 1f849f7d; sobreprecio A9 permitido) |
| Validación server-side | **PASS** | 07 (migración 20260926000001 aplicada LIVE, sha 59c90bf7…; referencia bajo FOR UPDATE; ERR_INVALID_PRICE) |
| Manipulación HTTP | **PASS** | 06 (A5 500→1: 200→**403**; A24b precio ajeno: 200→**403**; B2/B3/B4 bypass RPC: 200→**400**; NaN/Infinity→ERR_INVALID_PRICE) |
| Autorización | **PASS** | 06 (A11/A20 403 sin token; A25 40% CON supervisor real = 200 y auditado; RC-1 intacto A19) — *ver nota de decisiones pendientes* |
| Auditoría | **PASS** | 07 (audit_logs.metadata: catalog_subtotal/item_discount_total/item_discount_pct + supervisor_id ya existente; sin columnas nuevas) |
| Integridad matemática | **PASS** | 04/05 (subtotal==Σprice×qty en 100% de conciliaciones; UI 490 == DB 490 == ticket 490) |
| Inventario | **PASS** | 08 (1 movimiento por venta, balance_after coherente, WAC server-side, rechazos = 0 filas) |
| Idempotencia | **PASS** | 09 (replay misma tx; misma key payload distinto → primera gana) |
| Roles | **PASS** | 06 (admin vende/autoriza; encargado vende y queda gateado en ≥15%; anon denegado) |
| Checkout | **PASS** | 05/10 (venta normal, walk-in-equivalente y negociada completadas por UI real; oversell 409 intacto) |
| Regresión | **PASS** | 11 (2254 passed / 0 failed; 18 tests nuevos; eslint 0 errors; tsc exit 0) |
| CI | **PASS*** | 12 (TypeCheck+Lint+Unit+Build **SUCCESS**; E2E 171/97 idéntico al baseline = 0 regresión; *Security Audit en failure por advisory upstream de dependencias NO tocadas por esta fase — R-DEPS-1) |
| Aislamiento | **PASS** | 00/04 (zero-touch: última actividad en tiendas protegidas ≤ 2026-09-06; A24 rollback 0 filas; cleanup por IDs) |
| Git | **PASS** | 12 (3 commits separados, worktree limpio, push verificado ls-remote == HEAD) |

\* PASS con deuda preexistente documentada y ajena al alcance (R-DEPS-1): la única
diferencia de CI entre el baseline y esta fase es una advisory publicada aguas arriba;
el código E-SEC no modifica el árbol de dependencias.

## Respuesta al PRINCIPIO FINAL
> ¿Puede CostPro permitir precios de venta negociados sin permitir que un cliente HTTP
> no autorizado convierta esa flexibilidad comercial en manipulación arbitraria?

**SÍ — ahora sí.** La flexibilidad (500→490, por descuento por ítem o global, y
sobrecarga) permanece; el servidor resuelve precio de referencia, usuario, rol,
reglas y autorización; los desvíos ≥15% exigen supervisor admin/manager con token
firmado (política PREEXISTENTE, no inventada); valores imposibles se rechazan en el
servidor de datos (no solo en la puerta); y toda desviación queda auditada.

## DECISIÓN DE NEGOCIO PENDIENTE (no decididas por el agente — base del CONDITIONAL)
1. **Umbral por ítem agregado vs por línea**: el desvío se evalúa AGREGADO (misma
   semántica que el descuento global existente). Un carrito mixto puede diluir un
   desvío puntual ≥15% por debajo del umbral agregado.
2. **Motivo de descuento** (`discount_reason`) para desvíos ≥15%: no existe campo ni
   regla; no se inventó.
3. **Token de supervisor de un solo uso**: hoy reutilizable dentro de su TTL para el
   mismo binding (diseño RC-1 preexistente, A26 = 200).
4. **Snapshot `catalog_price_at_sale` por línea** (columna nueva en transaction_items):
   hoy el desvío histórico se reconstruye desde audit_logs.metadata, no desde la línea.
5. **Redondeo/precisión** del precio (A16 aceptó 490.999999): sin política explícita.

## Blockers abiertos (objetivos, fuera del alcance de esta fase)
- **R-DEPS-1** (P1, preexistente desde C2R): 8 vulnerabilidades de dependencias
  (2 critical, 3 high, 3 moderate; incluye la advisory nueva de sharp/libheif).
  Remediación: bump de dependencias + verificación — requiere decisión de ventana de
  despliegue; NO se hizo oportunistamente (§14).
- **R-E2E-1** (preexistente): la suite E2E de CI falla 171/97 en el entorno CI desde
  antes de esta fase (idéntica al baseline); requiere seed/entorno propio.
- **R-UX-DATE** (preexistente): deadlock de fecha por huso horario en el modal del
  catálogo documentado en 10.
- **R-A11Y-1** (heredado de FASE D): text-warning sobre bg-warning/10 = 4.19:1.

## Veredicto
El cierre técnico de R-SEC-1 está COMPLETO y demostrado (todas las áreas del §23 en
PASS, incluidas las condiciones del mandato sobre flexibilidad preservada, server-side,
autorización con la política existente, auditoría, inventario, idempotencia, checkout,
regresión, aislamiento y git). El veredicto es **CONDITIONAL** —no NOT CERTIFIED— por
las 5 decisiones comerciales pendientes arriba listadas (la fase prohíbe inventar esa
política: §1/§5/§9) y por la deuda de CI preexistente ajena al flujo del precio
(R-DEPS-1/R-E2E-1, documentadas y comparadas contra el baseline).

```text
FASE E-SEC — CONDITIONAL
```

Blockers abiertos (lista objetiva):
1. R-DEPS-1 — vulnerabilidades de dependencias (preexistentes; advisory upstream nueva).
2. R-E2E-1 — suite E2E de CI en failure preexistente (171/97, igual al baseline).
3. Decisiones de negocio pendientes 1–5 (umbral por línea, motivo, token single-use,
   snapshot de catálogo por línea, política de redondeo).
4. R-UX-DATE / R-A11Y-1 — heredados, fuera del alcance de esta fase.
