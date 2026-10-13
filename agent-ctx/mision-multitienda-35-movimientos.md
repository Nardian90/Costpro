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

## 6. Persistencia

- Rama: `ops/multitienda-mision-35-movimientos` — este archivo se actualiza y se push tras cada fase.
- El estado del inventario reside en Supabase (remoto) y sobrevive a reinicios del entorno; con el `.env` versionado en `.env.example` + este log, cualquier nueva sesión puede retomar la operación.
