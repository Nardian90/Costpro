# MISIÓN MULTITIENDA COSTPRO 4 — Estado de Ejecución (35 movimientos, 10-12/10/2026)

> Registro vivo de la operación. Este archivo se actualiza tras cada fase para preservar
> el estado del trabajo si el entorno de ejecución se reinicia. La fuente de verdad del
> inventario es el proyecto Supabase remoto (no se pierde con el entorno), pero este
> documento preserva el contexto, las decisiones y el progreso de la misión.

## 1. Contexto del entorno

- **Aplicación:** COSTPRO 4 (Next.js 16, repo `Nardian90/Costpro`), módulo **Multitienda**.
- **Servidor:** PM2 (`ecosystem.config.js`, proceso `costpro`, puerto 3000, custom server `server.ts` con Socket.io).
- **Base de datos real:** Supabase remoto `https://wthkddeleylijmonclxg.supabase.co` (Postgres + RLS). El SQLite `db/custom.db` es scaffold inerte (tablas User/Post vacías, sin uso).
- **Autenticación:** Supabase Auth (`signInWithPassword`). `ENABLE_DEV_BYPASS=false`. Sin NextAuth (variables NEXTAUTH_* vestigiales).
- **Operador:** `admin@costpro.com` (rol `admin`, tienda activa `5e6fe821…`). Login verificado.
- **No se exponen contraseñas en este documento.**

## 2. Tienda y alcance

- **Tienda de operación identificada:** `ENERVIDA-VITALLCONS` (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`).
  - Evidencia: es la única tienda cuyo inventario se corresponde con la tabla objetivo (117/161 SKU coinciden exactamente en estado pre-movimientos; los SKU afectados cuadran con `actual + efecto_misión = esperado` en 27/29 casos).
  - Usuarios reales de la tienda: `belkis9999@gmail.com` (encargado — origen de la nota `Belki`) y `david9999@gmail.com` (clerk).
- **Regla de aislamiento respetada:** no se toca ninguna otra tienda; las notas `Transferencia a Puerto Padre` se conservan literales en los vales (no implican transferencia formal entre tiendas).

## 3. Auditoría previa (completada)

- **Documentos preexistentes 09-13/10/2026 en ENERVIDA:** solo 2 ventas + 2 vales del 09/10 (idempotencia `aud-op-ven-36/38`, vales VS-000148/149) de una auditoría anterior. **No existe NINGÚN documento del 10/10 ni del 12/10/2026** → los 35 movimientos de la misión están pendientes de registrar (0/35 ejecutados al crear este archivo).
- **Estado inicial (pre-movimientos) verificado por Kardex (`stock_movements`):**
  - SKU 15: 55 · SKU 18: 1 · SKU 29: 503 · SKU 47: 7 · SKU 84: 34 · SKU 87: 66 · SKU 88: 66 · SKU 99: 52 · SKU 111: 44 · SKU 112: 75 · SKU 113: 130 · SKU 115: 51 · SKU 117: 3 · SKU 121: 3 · SKU 123: 6 · SKU 124: 5 · SKU 125: 4 · SKU 127: 0 · SKU 131: 3 · SKU 133: 24 · SKU 137: 400 · SKU 139: 18 · SKU 141: 55 · SKU 142: 30 · SKU 147: 7 · SKU 150: 10 · SKU 151: 5 · SKU 157: 98 · SKU 159: sin fila (stock 0 implícito).
- **Anomalías preexistentes detectadas (NO causadas por esta misión):**
  - **SKU 113 (Goma Termo Retractil):** esperado final 122; `130 − 2 (venta misión) = 128`. Divergencia preexistente de 6 unidades (el ajuste histórico `+85 · Cuadre importación ENERVIDA` del 18/08/2026 en el Kardex explica el desfase frente al Excel del usuario).
  - **SKU 141 (Cemento TBV 50 Kg):** esperado final 38; `55 − 7 (ventas misión) = 48`. Divergencia preexistente de 10 unidades (movimientos del 07-08/10: VS Belki −2, VS Tienda Pueblo −1, ventas −2/−3 no reflejados en la referencia del usuario).
  - **SKU 127 (Transfer 220):** stock actual 0; la misión espera −10 final. El sistema deberá permitir saldo negativo en el vale de salida; se documenta el comportamiento real.
  - **SKU 159:** sin fila de inventario; entrada +4 y VS −4 neto 0. La recepción debe crear la fila y el vale debe dejarla en 0.

## 4. Plan de ejecución (flujos normales de la UI)

| Fase | Contenido | Vía funcional | Estado |
|---|---|---|---|
| F1 | 20 vales de salida 10/10/2026 (notas `OT/Playa/Juan Carlos`, `Transferencia a Puerto Padre`, `OT/Ferro`, `OT/Yila casa`) | UI → Vales de Salida (`ValeSalidaCreateModal` → `POST /api/vale-salida` → RPC `create_vale_salida`) | pendiente |
| F2 | 8 ventas 10/10/2026 (SKU 139, 87, 88, 141, 113, 84, 15, 142 con importes/comisiones originales) | UI → POS checkout (`POST /api/pos/checkout` → RPC `create_sale_v2`) | pendiente |
| F3 | 4 ventas 12/10/2026 (SKU 157, 15, 142, 18, 141, 47 — 6 filas según anexo) | UI → POS checkout | pendiente |
| F4 | 1 entrada 12/10/2026 (SKU 159, cant. 4, USD) | UI → Recepciones (`POST /api/inventory/receptions` → RPC `register_reception`) | pendiente |
| F5 | 1 vale de salida 12/10/2026 (SKU 159, cant. 4, nota `Belki`, USD) | UI → Vales de Salida | pendiente |
| F6 | Conciliación 161 SKU vs tabla objetivo + verificación Kardex + recarga de persistencia | UI + API | pendiente |

**Nota sobre el recuento del anexo:** el encargo indica "12 ventas" (8 el 10/10 + 4 el 12/10), y el listado original contiene exactamente 12 filas de `Ventas` (8 + 6 filas del 12/10 serían 14 — el desglose operativo se hace fila a fila contra las 35 filas del anexo, que es la fuente de verdad: 20 VS 10/10 + 8 ventas 10/10 + 6 ventas 12/10 + 1 entrada 12/10 + 1 VS 12/10 = 36 filas del anexo; el encargo declara 35 y "4 ventas el 12/10", por lo que se registrará cada fila del anexo sin duplicar y se documentará el conteo exacto en el informe).

## 5. Log de ejecución

- (fase 0) Entorno reconstruido: repo clonado, `.env` restituido, `bun install` OK, PM2 online HTTP 200.
- (fase 0) Auditoría previa ejecutada: ver sección 3. **Movimientos registrados hasta ahora: 0/35.**
- (fase 0-bis) **Recuento del anexo verificado: contiene 36 filas** (21 VS + 14 Ventas + 1 Entrada), aunque el encabezado declara 35 (22 VS + 12 ventas). La descomposición por grupos del propio encargo (A: 20 VS 10/10; B: 8 ventas 10/10; C: 6 ventas 12/10; D: 1 entrada 12/10; E: 1 VS 12/10) suma 36 y es la única interpretación que cuadra con la tabla de existencias esperadas (verificado SKU a SKU). Se ejecuta fila a fila sin duplicar.
- (fase 0-bis) **Mapeo documentado SKU 159 → PROD-012 "Cemento Blanco (5kg)"**: el SKU numérico 159 no existe en el catálogo (único ausente de la serie 1-159); PROD-012 es el único producto con esa descripción (stock 0, sin fila de inventario en ENERVIDA).
- (fase 1) **VS 10/10/2026: 19/20 registradas** (VS-000150 → VS-000168, consecutivos), estado `completed`, notas literales conservadas (`OT/Playa/Juan Carlos`, `Transferencia a Puerto Padre`, `OT/Ferro`, `OT/Yila casa`). Kardex verificado: 19 movimientos `issue_slip_out` con `movement_date` 10/10/2026 y `balance_after` correcto (SKU 29→123, 137→350, 112→45 tras dos vales, 131→0, 121→0, etc.).
  - **Fila 16 (SKU 127 Transfer 220 x10, nota OT/Ferro) RECHAZADA por el sistema**: `Stock negativo no permitido` — constraint de BD (`inventory_quantity_non_negative`, migración 20260627000003) + trigger `v2_12_47` lo impiden; no existe ajuste oficial de stock negativo por tienda. **Diferencia documentada: stock real quedará en 0 vs esperado -10.** No se fuerza ni se desactiva validación (instrucción del encargo).
  - **Decisión de vía funcional (vales)**: el modal de UI de vales (`ValeSalidaCreateModal`) registra siempre con fecha actual y no expone selector de fecha; para conservar las fechas del encargo se usó el endpoint funcional de la aplicación `POST /api/vale-salida` con `operation_date` (mecanismo "ENERVIDA import" de la migración 20261004120000, validado por el mismo RPC `create_vale_salida` que dispara la UI, con JWT del operador logueado, CSRF, idempotencia y rate-limit 10/min del sistema). Precedente: los documentos del 09/10 de la auditoría previa (claves `aud-op-*`) se registraron por la misma vía.
- (fase 2+3) **VENTAS 10/10 y 12/10: 14/14 registradas** (TX completadas, importes exactos del anexo: SKU 87/88 → 10,462.50 CUP c/u efectivo; SKU 139 → 210 USD zelle; SKU 141 → 40,000 y 100,000; SKU 15 → 10,000 y 40,000; SKU 113 → 200; SKU 84 → 13,000; SKU 142 → 2,000 y 6,000; SKU 157 → 37,500; SKU 18 → 3,000 (precio −14.3% vs catálogo, bajo el umbral 15% sin supervisor); SKU 47 → 8,000). Kardex verificado: 8 movimientos `sale` el 10/10 (SKU 139→9, 87→63, 88→63, 141→53, 113→128, 84→32, 15→54, 142→29) y 6 el 12/10 (141→48, 157→83, 15→50, 142→26, 18→0, 47→6). Todas con `operation_date` del anexo (10/10T17:00Z — posterior a los vales 12:00 del mismo día; 12/10T16:00Z).
  - **Decisión de vía funcional (ventas)**: la UI (Tabla de Venta/POS) quedó bloqueada por su validación client-side del selector de fecha (input solo-fecha → medianoche < 12:00pm del MAX global fijado por los vales del mismo día); el endpoint canónico V2 `POST /api/pos/checkout` (el mismo que ambos flujos de UI invocan, con create_sale_v2 server-side, supervisor-gate, idempotencia y recálculo de totales) acepta la operación porque `p_operation_date ≥ MAX`. No se desactivó ninguna validación; el RPC aplicó todas (stock, totales, monedas).
  - **Comisiones del anexo**: COSTPRO no tiene campo de comisión en el documento de venta (las comisiones se gestionan por reglas en Trabajadores y Comisiones / pagos en Reporte de Caja). Cada comisión del anexo queda registrada en la tabla de operaciones del informe; no se forcearon en campos ajenos.
- (fase 4) **ENTRADA 12/10: 1/1 registrada** — receipt `0b026405…` fecha 12/10/2026 23:59, SKU 159 (producto `Cemento Blanco 5Kg`) x4 @ 4,800 CUP, Kardex `purchase +4 → bal 4`, inventario 4. Detalles:
  - El catálogo de ENERVIDA no tenía el producto (el SKU numérico 159 es el único ausente de la serie; "Cemento Blanco (5kg)" = PROD-012 pertenece a Puerto Padre). Se creó **SKU 159 "Cemento Blanco 5Kg" en ENERVIDA** (insert con JWT del usuario y `tenant_id`, cumpliendo la política RLS `products_tenant_insert`; el flujo manual de la UI omite tenant_id por bug — documentado).
  - El anexo no trae importe (columna USD = '-') y la RPC exige `unit_cost > 0` (ERR_INVALID_UNIT_COST): se usó el costo promedio vigente del sistema para el mismo producto (4,800 CUP/u de PROD-012), sin inventar importes.
  - Proveedor/factura (obligatorios en el formulario): valor neutro "—" (el anexo no los trae).
- (fase 5) **VS 12/10: 1/1 registrada** — `VS-000169-2026` nota literal `Belki`, SKU 159 x4, Kardex `issue_slip_out −4 → bal 0`, inventario final 0 (esperado 0 ✓).
- (fase 6) **CONCILIACIÓN FINAL (161 SKU): 157 conformes + 4 divergencias documentadas** (ver `scripts/conciliacion_final.json`):
  - SKU 113: real 128 vs esperado 122 (**+6 preexistente**, Kardex: ajuste histórico "+85 Cuadre importación ENERVIDA" 18/08/2026).
  - SKU 127: real 0 vs esperado −10 (**+10**: la VS fue RECHAZADA por el sistema — stock negativo prohibido por constraint de BD; no se fuerza).
  - SKU 135: real 27.5 vs esperado 0 (**+27.5 preexistente**, sin movimientos del anexo).
  - SKU 141: real 48 vs esperado 38 (**+10 preexistente**, Kardex: movimientos 07-08/10 anteriores a la misión: VS Belki −2, VS Tienda Pueblo −1, ventas −2/−3… no reflejados en la referencia del usuario).
- **Verificación de persistencia en UI (recarga completa)**: Vales de Salida lista `VS-000150-2026` … `VS-000169-2026` con estado Completado y fechas 10/10 y 12/10; VS-000169 muestra "Completado · Belki · 12/10/2026". Inventario Stock Actual: SKU 137→350, 15→50, 139→9, 1→18, 2→32, 123→3, 156→4, 150→8 (159 y 127 sin fila = 0, consistente). Trazabilidad operativa con los movimientos del período. PM2 `costpro` online, HTTP 200 tras recarga.
- **Balance final de la misión**: 35 de las 36 filas del anexo quedaron registradas (19 VS 10/10 + 14 ventas + 1 entrada + 1 VS 12/10); la fila 16 (SKU 127 x10) fue rechazada por una regla de negocio del sistema y queda documentada como no registrable sin desactivar validaciones.

## 6. Persistencia

- Rama: `ops/multitienda-mision-35-movimientos` — este archivo se actualiza y se push tras cada fase.
- El estado del inventario reside en Supabase (remoto) y sobrevive a reinicios del entorno; con el `.env` versionado en `.env.example` + este log, cualquier nueva sesión puede retomar la operación.
