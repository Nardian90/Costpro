# CP-INFRA-002 / CP-INFRA-002b — Procedimientos de reactivación (2026-10-23)

Retirada reversible de módulos y desconexión de integraciones para recuperar
despliegues válidos en el plan Vercel Hobby (límite de 12 funciones serverless
por deployment). Cada sección es **independiente**: se puede reactivar solo lo
que se necesite, sin restaurar lo demás. Ningún procedimiento requiere tocar
datos de Supabase: las tablas, migraciones y datos históricos de Pick3,
Billetera y Conciliación Bancaria NO fueron eliminados ni modificados.

El mecanismo de reversión global es `git revert` del commit de cada misión,
pero los procedimientos siguientes permiten reactivar por módulo sin revertir
los demás.

> **CP-INFRA-002b (continuación, misma fecha):** se retiraron además el módulo
> Academia, OpenTelemetry del runtime y las dependencias Baileys (con
> `@hapi/boom`), `pdf-parse` y `@types/pdf-parse`. Ver secciones 7-9.

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

## 4. WhatsApp — desconexión reversible (AMPLIADA por CP-INFRA-002b)

**Qué se hizo (CP-INFRA-002):**
- `/api/whatsapp/connect` responde `503 WHATSAPP_SESSIONS_DISABLED`: no se
  crean sesiones nuevas.
- `/api/cron/whatsapp-auto-publish` responde `200 {"status":"disabled"}` tras
  autenticar: no ejecuta publicaciones.
- `vercel.json` ya no declara el cron `whatsapp-auto-publish`.
- `ecosystem.config.js`: poller `whatsapp-cron-poller` comentado (no arranca
  con pm2).
- `server.ts`: el Socket.IO de WhatsApp no se adjunta al servidor custom.

**Qué se hizo ADEMÁS en CP-INFRA-002b (retirada del runtime de Baileys):**
- `@whiskeysockets/baileys` y `@hapi/boom` DESINSTALADOS de `package.json`
  (sin consumidores activos autorizados — WhatsApp permanece desconectado).
- `src/lib/whatsapp/baileys-client.ts` y `src/lib/whatsapp/handlers.ts`
  ELIMINADOS del árbol runtime (recuperables desde git). Las rutas y servicios
  leen ahora el estado de sesión desde `src/lib/whatsapp/session-info.ts`
  (stub puro: siempre «disconnected», sin socket).
- `publish.ts` e `invitation-queue.ts` degradan con elegancia a
  `reason: 'no_session'` (el manejo ya existía). Las rutas de estado
  (status/health/metrics/group) responden lo mismo que con Baileys caído.
- `connect` con la bandera habilitada responde `503 WHATSAPP_RUNTIME_UNAVAILABLE`
  con este procedimiento (nunca un éxito falso).

**Qué se conservó:** tokens/variables de entorno, archivos de sesión
`baileys-sessions/`, TODAS las rutas `/api/whatsapp/*` (contratos y autorización
intactos), `glm-orchestrator`, `anti-ban`, `invitation-queue`, `publish`,
`realtime-server` (compartido con Telegram), vistas, tablas y datos.

**Reactivación (CP-INFRA-002b — la bandera sola YA NO basta):**
1. `bun add @whiskeysockets/baileys @hapi/boom` (versiones del lockfile
   previo a CP-INFRA-002b, consultable en git).
2. Recuperar los módulos eliminados del último commit que los contiene:
   `git checkout <SHA> -- src/lib/whatsapp/baileys-client.ts src/lib/whatsapp/handlers.ts`
3. Restaurar los imports reales: en `publish.ts`, `invitation-queue.ts` y las
   rutas `status/health/metrics/group/messages/send/disconnect` cambiar
   `@/lib/whatsapp/session-info` por `@/lib/whatsapp/baileys-client`
   (`git diff` del commit de CP-INFRA-002b es la guía exacta), y en
   `connect/route.ts` restablecer la llamada a `connectStore`.
4. `WHATSAPP_SESSIONS_ENABLED=true` y `WHATSAPP_AUTOPUBLISH_ENABLED=true`.
5. Restaurar el cron en `vercel.json` (Hobby: solo crons diarios) o
   descomentar el poller en `ecosystem.config.js` para despliegues pm2.
6. Para el Socket.IO del servidor custom: `MESSAGING_REALTIME_ENABLED=true`.
7. Desplegar un Preview y verificar conteo de funciones ≤ 12 ANTES de mergear
   (Baileys es una de las dependencias que más pesa en el bundle).

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

CP-INFRA-002b añadió `outputFileTracingIncludes` ESPECÍFICOS en
`next.config.ts` (knowledge/, docs/knowledge/, data/, JSON de arquitectura para
system-health/intelligence). Son INCLUYOS aditivos: garantizan que las rutas
que leen archivos con `process.cwd()` los reciban en la lambda. No se usaron
exclusiones globales. Reversión: `git revert` del commit correspondiente.

## 7. Academia (retirada de CP-INFRA-002b)

**Qué se retiró:** rutas `/api/academy/*` (3: generate, review, review/[cardId]),
vistas `academy/` (AcademyView, Flashcard, MasteryDashboard), `useAcademyStore`,
`resolve-model.ts` (utilidad AI exclusiva de academy), entrada de menú
«Academia», ViewType `academy`, tips, breadcrumb, schemas Zod, endpoints de
`openapi-spec.ts`, accesos desde ficha de costos (botón/dropdown) y
`x-costpro`… Ver el diff de CP-INFRA-002b para la lista exacta.

**Qué se conservó:** tablas `learning_cards` y `user_progress` (datos
históricos de progreso de usuarios) y el resto del sistema de ayuda.

**Reactivación:** `git revert` del commit de CP-INFRA-002b restaura rutas,
vistas, menú y tests (los archivos viven íntegros en el historial). Verificar
conteo de funciones ≤ 12 en Preview antes de mergear: la ruta
`/api/academy/generate` generaba su PROPIA función serverless de ~138 MB por
el acceso a `knowledge/` + SDK de IA.

## 8. OpenTelemetry (retirada de CP-INFRA-002b)

**Qué se retiró:** dependencias `@opentelemetry/*` (5), `src/instrumentation.ts`
(entry OTel), `setupTracing` (`observability/tracing.ts`), `supabase-traced.ts`
(wrapper de rpc() con spans), `types/otel-modules.d.ts`, externalización en
`next.config.ts`, `OTEL_ENABLED` de `ecosystem.config.js`. `tracing-core.ts` y
`api-tracing.ts` conservan la MISMA interfaz pública como no-op / logging.

**Qué se conservó:** logger estructurado, `withTracing` (logging por request),
`/api/health`, system-health, auditoría de negocio, Sentry (independiente, opt-in
por DSN), migraciones SQL de trace_id (columnas/triggers intactos en BD).

**Reactivación:** `git revert` del commit de CP-INFRA-002b + `bun install`
(restaura los 5 paquetes @opentelemetry/* con las versiones del lockfile).
La variable `OTEL_ENABLED` vuelve a tener efecto solo tras eso.

## 9. pdf-parse (retirada de CP-INFRA-002b)

**Qué se retiró:** `pdf-parse`, `@types/pdf-parse` y su único consumidor,
`src/services/pick3/Pick3PdfService.ts` (código muerto: cero importadores).
**Reactivación:** `bun add pdf-parse @types/pdf-parse` +
`git checkout <SHA> -- src/services/pick3/Pick3PdfService.ts`.


---

**Nota sobre el conteo de funciones:** antes de reactivar CUALQUIER módulo,
desplegar un Preview y verificar en Vercel → Deployment → Functions que el
total sigue ≤ 12 (límite del plan Hobby). La retirada de módulos redujo el
bundle precisamente para volver a ese límite.
