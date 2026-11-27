# auditorias.md — Registro de auditorías del nivel 3 (auditor del watchdog)

Una sección por ejecución del schedule «Gaceta Auditor». La entrada más
reciente abajo. Formato: fecha-hora UTC, artefactos de la cadena, última
guardia del watchdog, salida literal del instrumento, resultado
(CADENA-OK | DOBLE-FALLO-REPARADO | BLOCKED | HALLAZGO-CRÍTICO), acción.

---

## 2026-11-27T20:55Z — auditoría fundacional (instalación de la cadena)

- Contexto: instalación de la misión ADN-GACETA-WATCHDOG-001; esta primera
  auditoría corre manualmente (por el agente instalador) tras la reparación
  del hueco del día por el nivel 2.
- Artefactos de la cadena (verificados en el repo, rama
  `feat/adn-gaceta-watchdog-001-20261127`):
  - `automation/gaceta-daily/SCHEDULER_ENTRYPOINT-WATCHDOG.txt` — PRESENTE.
  - `automation/gaceta-daily/SCHEDULER_ENTRYPOINT-AUDITOR.txt` — PRESENTE.
  - `scripts/gaceta/verify-gaceta-daily.mjs` — PRESENTE.
  - `docs/OPERATIONS/ADN-GACETA-WATCHDOG-001/PROGRAMA-WATCHDOG.md` — PRESENTE.
  - `docs/OPERATIONS/ADN-GACETA-WATCHDOG-001/guardias.md` — PRESENTE, con la
    guardia fundacional del nivel 2 registrada (resultado REPARADA).
- Salida del instrumento (read-only, resumen): «Edición de hoy publicada: SÍ ·
  Última fecha publicada: 2026-11-27 · RESULTADO: HUECO — hoy está publicado
  pero faltan días previos» (días previos = decisión editorial del
  propietario, fuera del alcance de la cadena).
- Schedules de la cadena instalados por el propietario desde su cuenta:
  nivel 1 «El Diario Contable» (10:30 La Habana, existente), nivel 2
  «Gaceta Watchdog» (11:30 La Habana), nivel 3 «Gaceta Auditor» (13:30 La
  Habana).
- Resultado: **CADENA-OK** (la edición del día existe; la cadena quedó
  instalada y auditada).
- Acción: ninguna escritura adicional (la reparación del día la hizo el
  nivel 2 y quedó registrada en guardias.md).
- Hallazgos para el propietario (no críticos): (1) huecos históricos
  2026-11-25 y 2026-11-26 sin edición — decisión editorial: rellenar o
  dejar; (2) rotación de credenciales recomendada (el expediente del ciclo
  CP-CI 2 ya lo recomendaba; reiterada por esta misión).

## 2026-11-27T21:30Z — auditoría fundacional, adenda de CI (PR #1741)

- El primer commit (37fbb781) rompió el check «Security Audit»: el gate
  CP-INFRA-019-FOLLOWUP detectó `scripts/gaceta/insert-edicion-20261127.mjs`
  como NUEVO ESCRITOR SIN DECLARAR (señal de endpoint Supabase + POST).
- Corrección en el segundo commit (90245550): script declarado en
  `scripts/lib/writers.manifest.json` → `exceptions` con justificación
  (publicación del Diario Contable: escribe SOLO en gaceta_posts, superficie
  designada ADN-011 para el editor automático). `node scripts/lib/check-writers.mjs`
  local → **CHECK-WRITERS OK: todos los escritores declarados y verificados**
  (318 escritores: 103 guardProtected + 55 isolationProtected + 162 exceptions).
- Check-runs del commit final 90245550 (GitHub Actions):
  - Unit & Integration Tests → success
  - TypeCheck + Lint + Unit Tests + Build → success
  - Security Audit → success
  - Vercel Preview Comments → success
- Resultado de la adenda: **CI-OK** (PR #1741 con todos los checks verdes
  en el head; el propietario decide el merge).
