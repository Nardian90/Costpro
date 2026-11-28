# ADN-GACETA-WATCHDOG-001 — Watchdog del Diario Contable

**Documento rector del watchdog (nivel 2 de la cadena de publicación).** El
documento operativo por ejecución es `automation/gaceta-daily/SCHEDULER_ENTRYPOINT-WATCHDOG.txt`;
el instrumento de medición es `scripts/gaceta/verify-gaceta-daily.mjs`. Este
expediente guarda el diseño, la matriz de decisión y el registro de guardias.

## 1. Antecedente y causa raíz

- El Diario Contable (ADN-011, `/gaceta` de ADNegocio) se publica a diario
  en `public.gaceta_posts` (escritura solo service_role; lectura pública por
  `public.public_gaceta_v`, patrón CP-SEC-027).
- El 2026-11-27 se detectó con `verify-gaceta-daily.mjs` que la última
  edición publicada era la del **2026-11-24** (2 notas: 1 gaceta + 1 costpro,
  creadas 03:09 UTC del 24) — el publicador programado llevaba **3 días sin
  publicar** y la portada en vivo solo mostraba la edición del 24.
- Causa raíz [INFERIDO]: el schedule-publicador (nivel 1) dependía del
  sandbox para su ejecución y de credenciales incrustadas en el campo del
  schedule; entre reciclajes del sandbox la ejecución no se retomó. No existe
  ningún mecanismo que detecte el hueco — eso es exactamente lo que añade
  esta misión.

## 2. Diseño de la cadena (v2, 2026-11-28: 2 niveles)

> v1 (2026-11-27) definió 3 niveles. El propietario redujo la cadena a DOS
> schedules de gaceta el 2026-11-28 (plan gratis de Z.ai: máximo 3 jobs y el
> tercero lo ocupa el programa CP-CI). Se eliminó el nivel 3 (auditor); su
> función esencial (auditar los artefactos de la cadena) la absorbió el
> watchdog como PASO 1A de cada guardia.

| Nivel | Rol | Mecanismo | Qué hace |
|---|---|---|---|
| 1 | Publicador | Z.ai Schedule «El Diario Contable» (existente) | Publica la edición diaria (1 gaceta + 1 costpro) sobre las 10:30 La Habana |
| 2 | **Watchdog v2** (esta misión) | Z.ai Schedule «Gaceta Watchdog», 11:30 La Habana | Audita sus propios artefactos (PASO 1A), mide (read-only) y **repara**: si falta la edición del día, la publica él mismo |

Reglas de la cadena:
- Schedules activos del propietario en Z.ai (plan gratis, 3 en total):
  «El Diario Contable» (10:30), «Gaceta Watchdog» (11:30) y el programa
  CP-CI. El auditor (13:30) fue eliminado con su schedule.
- Ambos niveles usan el MISMO instrumento de medición y el MISMO contrato
  de publicación (ADN-011): una sola verdad.
- La defensa contra la pérdida de artefactos (p. ej. expolio de main) ya no
  es un schedule separado: es el PASO 1A del propio watchdog (auditoría de
  artefactos al inicio de cada guardia, hallazgo CRÍTICO si falta alguno).
- Huecos históricos: nadie los rellena automáticamente; se listan al
  propietario (decisión editorial).

## 3. Contrato de publicación (formato ADN-011, reutilizado por todos los niveles)

`INSERT` en `public.gaceta_posts` (service_role) con:
`fecha` (La Habana), `slug` único `gaceta|costpro-<fecha>-<slug>`, `tipo`
'gaceta'|'costpro', `titular`, `bajada`, `cuerpo` = array de bloques
`{t: h2|p|li|quote|dato, v}`, `etiquetas` (≤4), `fuente` (URL real o null),
`destacado` bool, `estado` 'publicada'. Idempotencia por slug único
(HTTP 409 = ya publicado, no reintentar). Escritura SOLO en esta tabla.

## 4. Matriz de decisión del watchdog

| Medición (PASO 1) | Estado | Acción |
|---|---|---|
| exit 0 "OK" | al día | informe SATISFECHA, no tocar BD |
| exit 2 "HUECO" (falta hoy) | hueco del día | PASO 2: publicar edición del día (tipo según novedades verificables) |
| exit 3 (x3 reintentos) | entorno | informe BLOCKED, detener |
| sin credenciales | entorno | informe BLOCKED, detener |

## 5. Registro de guardias — `guardias.md`

Cada guardia añade una sección con: salida literal antes, decisión, acción,
salida literal después, resultado (SATISFECHA | REPARADA | BLOCKED), huecos
históricos pendientes. El nivel 3 lee este registro para auditar.

## 6. Seguridad

- Read-only estricto para medir (anon sobre la vista pública).
- La única escritura posible es el INSERT idempotente en `gaceta_posts`.
- Cero migraciones, cero RLS/policies, cero tablas nuevas.
- Credenciales solo por entorno (.env gitignored), jamás en schedules,
  informes o commits. Rotación recomendada si alguna vez se expusieron
  (hallazgo repetido del ciclo CP-CI 2).
