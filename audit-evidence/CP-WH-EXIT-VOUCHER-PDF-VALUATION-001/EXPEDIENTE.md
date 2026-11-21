# EXPEDIENTE — CP-WH-EXIT-VOUCHER-PDF-VALUATION-AND-FULL-CERTIFICATION-001

**Fecha**: 2026-11-20 · **Ámbito**: Inicio → OPERACIÓN → Almacén → Vales de Salida
**Rama**: `feat/cp-wh-exit-voucher-pdf-valuation-20261120` · **Base**: `main` @ cc7fbe895

---

## 1. Funcionalidad incorporada

Control **«Incluir valores en el PDF (Vale de Salida valorizado)»** en el flujo de
exportación SC-2-08 «Vale de Entrega o Devolución» (Res. 11/2007 MFP) del modal
de detalle `ValeSalidaDetalleModal`.

| Aspecto | Comportamiento |
|---|---|
| Default | **MARCADO** — conserva el comportamiento vigente (PDF valorizado). Sin sorpresas. |
| Marcado | PDF valorizado: precio unitario (costo almacenado), importe por línea, Importe Total del Vale (CUP). |
| Desmarcado | PDF **exclusivamente físico**: sin columnas «Precio unitario total»/«Importe», sin importe total, sin moneda — nota documental «Documento emitido sin valoración económica (información física).». |
| Alcance de la elección | SOLO la exportación solicitada. El PDF se genera 100 % en lectura: no muta el vale, sus datos, el inventario ni la contabilización. |
| Datos económicos en modo físico | **No se ocultan columnas con datos presentes**: `fetchSc208SourceData` no solicita `unit_cost`/`total_cost` a la BD y elimina los costos precargados de los ítems antes de construir el modelo. |

Ficheros modificados:
- `src/lib/legal/sc208.ts` — `Sc208ExportOptions {incluirValores}`, `Sc208ModelData.valorizado`, builder y renderer condicionales.
- `src/components/views/terminal/views/inventory/ValeSalidaDetalleModal.tsx` — Checkbox (shadcn, único, etiqueta inequívoca, `disabled` durante la generación), estado `incluirValoresPdf` (default `true`), toast diferenciado por modalidad.
- `src/lib/legal/res11-shared.ts` — sin cambios (primitivas reutilizadas).

## 2. Metodología de valorización real (verificada, no inventada)

- El costo unitario del PDF es `issue_slip_items.unit_cost`, **snapshot almacenado por el servidor** al emitir/confirmar: las RPC leen `products.cost_average` (costo promedio ponderado, CUP) con `FOR UPDATE` (migraciones `20260817000001` L332/349 y `20261031120100` L216-257). **Nunca se recalcula en el PDF** — el modelo imprime el valor almacenado.
- En flujo En Revisión el snapshot es informativo; al confirmar, el costo se re-lee con el WAC vigente (aviso documental en el modal).
- No se sustituye por precio de venta ni por costos documentales: la fuente es única (WAC del sistema, escritura protegida por `fn_recalc_wac` + guard `trg_guard_wac_writer`).

## 3. Auditoría del ciclo de vida (hallazgos verificables)

### 3.1 Estados y transiciones (código real)

El sistema define `pending (En Revisión) → completed (Completado) → reversed (Devuelto)` + `voided (Anulado)` (CHECK de BD, migración `20261031120100` L42-44). **«Entregado» no existe como estado**: la entrega se ampara con el SC-2-08 al completarse. Las etiquetas de la misión se mapean: Borrador=pending, Emitido/Entregado=completed (emisión directa entrega y descuenta en el mismo acto), Anulado=voided.

| Transición | Implementación | Guards verificados |
|---|---|---|
| Crear borrador | `POST /api/vale-salida/pending` → `create_vale_salida_pending` | Sin movimientos de stock; numeración VS; auditoría `CREATE_VALE_SALIDA_PENDING`; idempotencia por namespace propio |
| Emitir directo | `POST /api/vale-salida` → `create_vale_salida` (status completed) | Descuenta stock aquí (`register_stock_movement(-qty,'issue_slip_out')` o `withdraw_production_item`); `pg_advisory_xact_lock(store)`; idempotency_key ≥8 chars |
| Confirmar | `supabase.rpc('confirm_vale_salida')` | `SELECT … FOR UPDATE` + `ERR_NOT_PENDING` (imposible doble confirmación); re-lee WAC; setea `confirmed_at/by`; auditoría `CONFIRM_VALE_SALIDA` |
| Anular | `supabase.rpc('void_vale_salida')` | Solo `pending→voided` + motivo obligatorio; defensa `ERR_SLIP_HAS_MOVEMENTS`; sin efecto físico |
| Devolver | `POST /api/vale-salida/[id]/reverse` → `reverse_vale_salida` | Solo `completed→reversed` (UPDATE con `WHERE status='completed'` + guard `ERR_SLIP_NOT_REVERSIBLE` que exige movimientos originales); genera entradas compensatorias `issue_slip_reverse`; restaura `production_order_items.actual_qty`; EXECUTE solo `service_role` (hardening 20260902000002) |

### 3.2 Impacto en inventario — conciliación LIVE (producción, solo lectura)

Conciliación completa (no muestreo) `conciliacion-inventario.json` — universo:
**246 vales** (ENERVIDA-VITALLCONS 237 completed + 3 reversed; COSTPRO (Prueba) 2+2; PUERTO PADRE 1 completed + 1 voided).

| Verificación | Resultado |
|---|---|
| Vales completed SIN movimientos de salida | **0** |
| Vales pending/voided CON movimientos | **0** (nunca se descuenta prematuramente) |
| Vales reversed SIN entrada compensatoria | **0** |
| Doble descuento (vale, producto) con >1 salida | **0** |
| Diferencia cantidades ítems ↔ movimientos | **0** (tolerancia 0,0001) |
| Movimientos huérfanos (sin vale de origen) | **0** |
| Existencias negativas | **0** |
| Movimientos de otra tienda que su vale | **0** (aislamiento real) |

Protección anti-negativos: CHECK `balance_after >= 0` en `stock_movements` + trigger `prevent_negative_inventory()` (migración `20260627000003`).

### 3.3 Naturaleza del movimiento — separación respecto de ventas

- Tipo de movimiento propio: enum `issue_slip_out` / `issue_slip_reverse` (migración base L48-66); el trigger de kardex los mapea a `out`/`in`; `movementPresentation` los etiqueta «Vale de salida»/«Reverso de vale» — sin compartir lógica de descuento con ventas.
- **NO genera ingresos, cobros, CxC ni movimientos de caja/banco**: verificado en el motor contable — la regla VALE_SALIDA v1 solo tiene `GAS_VALES` (débito) y `ACT_INVENTARIO` (crédito) con métrica `costo_cup = issue_slips.total_cost`; sin plantillas de ingreso ni efectivo (migración `20261113120000` L396-400).
- Trigger `fin_trg_issue_slips`: contabiliza al `completed` (evento reconocimiento) y revierte con `fin_post_annulment_safe` en voided/reversed. Idempotente (índice único por documento+evento+generación + advisory lock).

**Conciliación contable LIVE** (`conciliacion-fin-contable.json`, `verificacion-generaciones-contables.json`):
- Asientos VALE_SALIDA: débito 2.429.997,23 = crédito 2.429.997,23 CUP (equilibrado al centavo); categorías reales: GAS_VALES débito 604 mov. / ACT_INVENTARIO crédito 604 mov.
- Los asientos conviven por **generaciones contables** (CP-FIN-003): GEN-0 legado (198), GEN-1 superseded (203), **GEN-2 activa (203 asientos ↔ 203 vales — exactamente 1 por vale)**; `fin_posting_generations` garantiza UNA activa por tienda y los informes (`fin_get_balance_sheet`, `fin_get_dashboard`, etc.) resuelven `fin_active_generation()` — los asientos históricos NUNCA se borran.
- El total de la generación activa (GAS_VALES 810.567,06) coincide EXACTO con la suma de `total_cost` de los 203 vales con asiento [MEDIDO].

### 3.4 Hallazgos y su tratamiento

| # | Hallazgo | Clasificación | Tratamiento |
|---|---|---|---|
| H1 | 34 vales ENERVIDA (importados 2026-09-08→10-05) completados con `total_cost = 0.00` sin asiento contable | **Comportamiento por diseño** — la plantilla exige `costo_cup > 0`; son vales de importación sin costo registrado | Documentado. No es pérdida económica; la corrección de costos históricos exige procedimiento de rectificación (fuera del alcance; sin autorización de datos) |
| H2 | 3 vales completados en otras tiendas (COSTPRO Prueba ×2 = 69.644,76; PUERTO PADRE ×1 = 45,00) sin asiento | **GAP menor fuera del ámbito ENERVIDA** — el motor y backfill se aplicaron con autorización solo para ENERVIDA | Documentado con recomendación (ejecutar el backfill existente `fin_apply_pending` para esas tiendas con autorización del propietario) |
| H3 | `confirmed_at/by` NULL en vales emitidos directamente | **Semántica correcta** — solo el flujo En Revisión→Confirmar llena el par; la emisión directa usa `created_by/at` | Documentado |
| H4 | Banner de cookies + modal de login comparten z-index (overlay intercepta si se navega con `?login=1` sin aceptar cookies) | **Observación de UX preexistente, menor** — el flujo real del usuario (aceptar cookies → login) funciona; automatización lo respeta | Documentado; fuera del alcance de esta misión (no se toca la landing) |
| H5 | Ningún defecto funcional del Vale de Salida ni de su exportación | — | La función cumple de extremo a extremo |

**No se realizaron limpiezas, borrados ni ajustes de datos de producción.** Todas las consultas fueron read-only con guard fail-closed.

## 4. Pruebas ejecutadas

| Suite | Resultado |
|---|---|
| `src/__tests__/lib/res11-exporters.test.ts` (SC-2-08: 11 datos, valorizado, físico, bytes, paginación 30 líneas, fetch sin costos) | **40/40 PASS** (28 existentes + 12 nuevas) |
| `src/__tests__/components/vales-salida-pdf-valorizacion.test.tsx` (nuevo: checkbox único, default marcado, ambas exportaciones, sin mutaciones, pending sin exportación, a11y) | **6/6 PASS** |
| Regresión completa vales-salida (view, ver-icono, crear-flujo, fecha, navigation, migration) | **56/56 PASS** |
| Suite unitaria completa (4 shards) | **6.296 PASS / 0 FAIL** (60 skip por diseño) |
| `npx tsc --noEmit` (programa completo) | **0 errores** |
| ESLint (ficheros tocados + repo) | **0 incidencias** |
| `next build` | **Compiled successfully** (60 s; fase TS de build OOM en sandbox — cubierta por tsc completo y CI) |
| E2E real en navegador (Playwright, app con código de la rama, producción read-only) | **18/18 PASS** — login → vista → detalle → checkbox → descargas reales de AMBOS PDF → verificación de bytes → móvil 375 px → 0 errores de consola (`ui/resultados.json`) |
| CI del PR (head a2700a9b9) | **5/5 SUCCESS**: TypeCheck + Lint + Unit Tests + Build · Unit & Integration Tests · Security Audit · Vercel Preview · E2E Aislado (re-ejecución SUCCESS; el fallo inicial 1/52 fue un flake en `fc-template-picker.spec.ts:330` — esperaba 404, recibió 401, ajeno al diff: sin cambios de backend ni auth) |

## 5. Evidencia empaquetada

```
audit-evidence/CP-WH-EXIT-VOUCHER-PDF-VALUATION-001/
├── EXPEDIENTE.md (este documento)
├── SC-2-08_Vale_de_Salida_VS-000458-2026_valorizado.pdf        (fixture, generador scripts/gen-cp-wh-exit-voucher-example-pdfs.mjs)
├── SC-2-08_Vale_de_Salida_VS-000458-2026_sin_valorar_fisico.pdf
├── conciliacion-inventario.json        (13 verificaciones LIVE universo completo)
├── conciliacion-fin-contable.json      (profundización contable)
├── verificacion-generaciones-contables.json (604 asientos ↔ generaciones)
├── generaciones-activas.json           (GEN-2 activa: 203 asientos ↔ 203 vales)
├── cp-wh-001-*.sql                     (consultas reproducibles, solo lectura)
└── ui/
    ├── 01-listado-vales-escritorio.png
    ├── 02-detalle-checkbox-marcado.png
    ├── 03-detalle-checkbox-desmarcado.png
    ├── 04-detalle-tras-ambas-exportaciones.png
    ├── 05-movil-375px-detalle.png
    ├── descargas/ (PDF valorizado y físico descargados de la app REAL — VS-000240-2026)
    └── resultados.json (18 verificaciones)
```

## 6. Procedimiento de reversión

Revertir el merge del PR restaura el comportamiento anterior (exportación siempre valorizada): no hay migraciones de BD en esta misión, ningún cambio de backend ni de datos. El control desaparece y `buildSc208ModelData` sin opciones produce el modelo valorizado (compatibilidad de firma conservada).
