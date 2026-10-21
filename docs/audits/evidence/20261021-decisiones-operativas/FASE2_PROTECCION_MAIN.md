# FASE 2 — PROTECCIÓN DE `main`: ANÁLISIS Y RECOMENDACIÓN INEQUÍVOCA

**Expediente:** CP-SEC-027 v5 · Fase 2 · **Fecha:** 2026-10-21
**Estado verificado:** `main` SIN protección (GET `/branches/main/protection` → 404 "Branch not protected") y SIN rulesets (GET `/rulesets` → `[]`). Confirmado el 21/10 con la API.

---

## 1. Sobre el archivo `ruleset-propuesta-main.json` original

El archivo citado por el expediente **no existe en el repositorio** (verificado con búsqueda global el 21/10: `find . -name "ruleset*"` → 0 resultados en el árbol). Formaba parte del expediente conversacional v4/v5 cuyo sandbox se perdió. Conforme a la orden del expediente («si detectas errores… prepara una versión corregida en el directorio de trabajo»), se preparó la **versión v2 reconstruida desde cero**: `RULESET_PROPUESTA_MAIN_v2.json` (misma carpeta), con dos correcciones estructurales frente a lo que la v1 pretendía:

1. **Nombres de checks verificados contra la realidad** (no contra documentos): los 7 contexts exactos son los publicados por GitHub Actions (`app_id` 15368) el 21/10 en el commit `c08a4038cc` — `Security Audit`, `Unit & Integration Tests`, `TypeCheck + Lint + Unit Tests + Build`, `TypeScript Security Checks`, `Allowlist Review`, `SQL Static Checks`, `SQL DB Security Checks`. Los 2 checks `E2E Tests (Playwright)` corren **skipped** (CP-INFRA-001 sigue abierto) y por eso quedan FUERA de los requeridos — exigirlos rompería todo merge hasta reactivar E2E.
2. **Corrección del modelo de bypass:** el repositorio es PERSONAL (usuario Nardian90). Los `bypass_actors` de rulesets son una feature de NIVEL ORGANIZACIÓN — en un repo personal NO existe el bypass silencioso de actor. El «bypass del propietario» se materializa como **control administrativo auditable**: el propietario siempre puede editar/desactivar el ruleset (Settings → Rules), y esa acción queda registrada en el audit log de GitHub. Esto es más fuerte que un bypass permanente: cualquier excepción deja huella.

## 2. Evaluación de las opciones del expediente

### Opción A — aprobación independiente obligatoria, sin bypass del propietario

- **Inviiable HOY.** El repo tiene un único revisor posible (el propietario fusiona el 100% de los PRs históricos verificados en git log; el ritmo del equipo era ~12 PRs/día). Exigir una aprobación distinta del propietario produce **deadlock permanente** hasta que exista un segundo revisor con permisos.
- Descartada sin cambios de equipo previos.

### Opción B — checks y reglas obligatorios, con bypass limitado al propietario

- **Viable hoy** y ES la recomendación. Implementación en repo personal: ruleset repo-level con (i) los 7 checks requeridos **non-strict**, (ii) prohibición de borrado de rama, (iii) prohibición de force-push. Efecto exacto:
  - Un **push directo** a `main` (sin PR) queda bloqueado: el push nuevo no trae los 7 checks en verde → rechazado. Esto cierra el hueco que motivó el PR #1433 (gates solo en PR) con una garantía de plataforma.
  - Un **merge vía PR** queda disponible para el propietario cuando los 7 checks están en verde — su flujo diario NO se rompe.
  - El escape de emergencia es administrativo, visible y auditable (editar/desactivar el ruleset), NO un bypass silencioso por push.
- **Modo `evaluate` primero** (no bloquea; solo reporta) durante ~14 días para observar impactos con el ritmo real de PRs; después `active` con autorización aparte. El paso a `active` es la única acción que cambia comportamiento de fusión.

## 3. Recomendación INEQUÍVOCA

**OPCIÓN B** — crear el ruleset `protect-main-v2` en modo `evaluate` ahora (cuando el propietario lo autorice), observar 14 días, pasar a `active` con autorización explícita. Artefacto listo: `RULESET_PROPUESTA_MAIN_v2.json` (con instrucciones de aplicación, comandos exactos, post-verificaciones y reversión).

**Qué NO se ha hecho:** NINGUNA llamada de escritura a la API de GitHub en esta fase. La protección de `main` sigue SIN instalar — exactamente como el expediente ordena hasta autorización expresa.

**Interacción con el PR #1433:** el ruleset protege el canal de fusión directa de forma contractual (nivel plataforma). El PR #1433 (ya fusionado, dictamen Fase 1: **APTO, sin defectos**) añadió los gates en `push` a nivel workflow — defensa complementaria verificada operando (corrida real push|main del 20/10 en success). Con ruleset `active`, la capa de plataforma es la garantía primaria y la de workflow queda como profundidad.
