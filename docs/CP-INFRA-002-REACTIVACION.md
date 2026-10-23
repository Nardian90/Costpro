# CP-INFRA-002 — Procedimientos de reactivación (2026-10-23)

Retirada reversible de módulos y desconexión de integraciones para recuperar
despliegues válidos en el plan Vercel Hobby (límite de 12 funciones serverless
por deployment). Cada sección es **independiente**: se puede reactivar solo lo
que se necesite, sin restaurar lo demás. Ningún procedimiento requiere tocar
datos de Supabase: las tablas, migraciones y datos históricos de Pick3,
Billetera y Conciliación Bancaria NO fueron eliminados ni modificados.

El mecanismo de reversión global es `git revert` del commit de esta misión,
pero los procedimientos siguientes permiten reactivar por módulo sin revertir
los demás.

---

## 1. Pick3 (módulo de lotería)

**Qué se retiró:** rutas `/api/pick3/*` (6), páginas SEO `/pick3/combinacion/*`,
vista `pick3-intelligence` (menú EN DESARROLLO + shell), tips, redirect
`/pick3`, cron `/api/pick3/sync` de `vercel.json`, doc del endpoint en
`openapi-spec.ts`, tests del módulo.

**Qué se conservó:** `src/services/pick3/*` (engines y servicios), 
`src/types/pick3.ts`, `scripts/pick3_pdf_parser.py`, tablas y datos en
Supabase, categorías `PICK3` del logger.

**Reactivación (en un PR propio):**
1. Restaurar `src/app/api/pick3/`, `src/app/pick3/` y la vista
   `src/components/views/terminal/views/pick3/` (git checkout del commit previo
   a CP-INFRA-002 restaura los árboles completos).
2. Restaurar la entrada `pick3-intelligence` en
   `src/config/navigation/navigation-definition.ts`, el tip en
   `view-tips.ts`, el case en `TerminalShell.tsx`, el id en el union
   `ViewType` (`src/store/index.ts`), el redirect en `next.config.ts`,
   el cron en `vercel.json` y el bloque en `openapi-spec.ts`.
3. Restaurar los tests eliminados (`pick3-*.test.ts`, `sprint1-4`).
4. Verificar que el conteo de funciones del deployment sigue ≤ 12 (el módulo
   se retiró precisamente por el límite del plan Hobby: reactivarlo puede
   volver a superarlo — evaluar contra un Preview antes de mergear).

**Impacto de la retirada en terceros:** ningún módulo esencial importa Pick3
(verificado por barrido de imports; solo `TerminalShell` montaba la vista).

## 2. Billetera (Wallet)

**Qué se retiró:** rutas `/api/wallet/*` (7: data, export, import-excel,
import-trm, reset, transaction, users), vista `wallet` (menú + shell), tips,
entrada en `viewRegistry.ts`, esquemas de validación
`walletImportExcelSchema`/`walletImportTrmSchema` en `api-schemas.ts`, tests
SEC-TS-03/04 de las rutas.

**Qué se conservó:** `src/lib/transfermovil/` (parser de backups .trm), el
tipo de método de pago `'wallet'` (etiquetas de ventas/caja son del flujo
operativo de ventas, no del módulo Billetera), tablas y datos en Supabase.

**Reactivación (en un PR propio):**
1. Restaurar `src/app/api/wallet/` y la vista
   `src/components/views/terminal/views/wallet/`.
2. Restaurar la entrada `wallet` en `navigation-definition.ts`,
   `view-tips.ts`, `viewRegistry.ts`, `TerminalShell.tsx` y el union
   `ViewType`.
3. Restaurar los esquemas en `src/validation/api-schemas.ts` y los tests
   `sec-ts-03/04`.
4. Evaluar el conteo de funciones en Preview (nota del punto 1.4 aplica).

## 3. Conciliación Bancaria

**Qué se retiró:** rutas `/api/bank-reconciliation` y `/match`, vista
`bank-reconciliation` (menú + shell), entrada en el union `ViewType`.

**Qué se conservó:** IPV (el banco de trabajo de conciliación experimental,
que NO forma parte de esta retirada), tablas y datos en Supabase, el núcleo
Multi-Tienda. La vista era solo lectura (beta).

**Reactivación:** restaurar los mismos puntos de los módulos anteriores
(rutas, vista, navegación, union ViewType). La vista estaba bajo
roles `['admin']`.

## 4. WhatsApp — desconexión reversible

**Qué se hizo:**
- `/api/whatsapp/connect` responde `503 WHATSAPP_SESSIONS_DISABLED`: no se
  crean sesiones Baileys nuevas (el resto del endpoint queda intacto).
- `/api/cron/whatsapp-auto-publish` responde `200 {"status":"disabled"}` tras
  autenticar: no ejecuta publicaciones.
- `vercel.json` ya no declara el cron `whatsapp-auto-publish`.
- `ecosystem.config.js`: poller `whatsapp-cron-poller` comentado (no arranca
  con pm2).
- `server.ts`: el Socket.IO de WhatsApp no se adjunta al servidor custom.

**Qué se conservó:** TODA la implementación (`src/lib/whatsapp/*`, rutas,
vistas), tokens/variables de entorno, archivos de sesión
`baileys-sessions/`, librería Baileys en `package.json`, el endpoint
`/api/whatsapp/disconnect` (operación segura de limpieza).

**Reactivación:**
1. Poner `WHATSAPP_SESSIONS_ENABLED=true` y `WHATSAPP_AUTOPUBLISH_ENABLED=true`
   (variables de entorno del proyecto, o cambiar los literales de
   `src/lib/messaging-flags.ts`).
2. Restaurar el cron en `vercel.json` (Hobby: solo crons diarios) o
   descomentar el poller en `ecosystem.config.js` para despliegues pm2.
3. Para el Socket.IO del servidor custom: `MESSAGING_REALTIME_ENABLED=true`.

## 5. Telegram — desconexión reversible

**Qué se hizo:**
- `/api/cron/telegram-auto-publish` responde `200 {"status":"disabled"}` tras
  autenticar: no ejecuta publicaciones.
- `vercel.json` ya no declara el cron `telegram-auto-publish`.
- `ecosystem.config.js`: poller `telegram-cron-poller` comentado.

**Qué se conservó:** TODA la implementación (`src/lib/telegram/*` — el bot
client es HTTP puro sin dependencias pesadas, verificado funcional), rutas,
vistas, token/variables de entorno. Los endpoints manuales siguen operativos
(publicar/enviar es acción explícita del usuario, no un proceso activo).

**Reactivación:**
1. `TELEGRAM_AUTOPUBLISH_ENABLED=true` (env o literal en
   `src/lib/messaging-flags.ts`).
2. Restaurar cron/poller como en el punto 4.

## 6. Ajustes de tracing / empaquetado

Si la misión añade ajustes de `outputFileTracingExcludes` o similares en
`next.config.ts`, la reversión es `git revert` del commit correspondiente:
ningún cambio de esta misión altera datos, esquemas ni variables de entorno.

---

**Nota sobre el conteo de funciones:** antes de reactivar CUALQUIER módulo,
desplegar un Preview y verificar en Vercel → Deployment → Functions que el
total sigue ≤ 12 (límite del plan Hobby). La retirada de módulos redujo el
bundle precisamente para volver a ese límite.
