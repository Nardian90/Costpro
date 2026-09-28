# PRE-F5 — 00 INTEGRATION BASELINE (GATE 0–6)

Fecha: 2026-09-29 (timezone usuario: America/Havana)
Agente: UI/UX Design Agent (CostPro exclusivo)
Operación: PRE-F5 — Integración y merge seguro F3 + F4 en `main`
Naturaleza: SOLO integración. No desarrollo, no UI, no backend, no CI.

---

## GATE 0 — Confirmación de SHAs (comandos reales)

```text
$ git remote -v
origin  https://github.com/Nardian90/Costpro.git (fetch/push)

$ git ls-remote origin refs/heads/main refs/heads/audit/f3-states-overlays-feedback refs/heads/audit/f4-information-architecture
60dd04acdcbb41d00c41e1b4067f557b1d475a0f   refs/heads/audit/f3-states-overlays-feedback
55b399202684e7d3dd148f74883b0c6b31856472   refs/heads/audit/f4-information-architecture
09ef9e979699e886aafdf6c148bb00f7593d38d5   refs/heads/main
```

| Ref | Esperado | Real remoto | Veredicto |
|---|---|---|---|
| F3 `audit/f3-states-overlays-feedback` | `60dd04ac` | `60dd04acdcbb41d00c41e1b4067f557b1d475a0f` | **MATCH** |
| F4 `audit/f4-information-architecture` | `55b39920` | `55b399202684e7d3dd148f74883b0c6b31856472` | **MATCH** |
| `main` | `a63d4fe9` (solo observación previa, no requerimiento) | `09ef9e979699e886aafdf6c148bb00f7593d38d5` | **HA AVANZADO** (ver §main) |

**Decisión GATE 0:** la condición de STOP sólo aplica a F3/F4 (ambos MATCH). El avance de
`main` estaba explícitamente anticipado por la tarea ("NO asumir que este SHA continúa siendo
el HEAD actual"). Se caracteriza el nuevo estado antes de operar.

### Qué contiene el main nuevo (a63d4fe9 → 09ef9e97)

```text
$ git log --oneline --decorate a63d4fe9..origin/main
09ef9e97 (origin/main, origin/HEAD) Merge pull request #1331 from Nardian90/security/sec-ts-05-purge-snapshots
ff307220 (origin/security/sec-ts-05-purge-snapshots) fix(security): fail closed purge snapshots cron auth
```

→ 2 commits nuevos, **ambos de seguridad** (PR #1331). Relevantes para GATE 11.1.
Además `git fetch origin --prune` reveló la rama `security/sec-ts-05-purge-snapshots`
(tip `ff307220`, ya fusionada vía #1331; no se toca).

## GATE 1 — Topología real

```text
$ git merge-base origin/main 60dd04ac        → 3af2ea5c698cbd2436774c2ef68b09b022d4fd6b
$ git merge-base origin/main 55b39920        → 3af2ea5c698cbd2436774c2ef68b09b022d4fd6b
$ git merge-base 60dd04ac 55b39920           → 60dd04acdcbb41d00c41e1b4067f557b1d475a0f
$ git merge-base --is-ancestor 60dd04ac 55b39920 → PASS (F3 ES ancestro de F4)
$ git merge-base --is-ancestor a63d4fe9 origin/main → PASS
$ git merge-base --is-ancestor 3af2ea5c a63d4fe9    → PASS
```

### Topología (ASCII)

```text
3af2ea5c ──┬───────────── 41c2d539 ── a63d4fe9 ── ff307220 ── 09ef9e97   (main / seguridad)
           │                PR#1330                  PR#1331
           └── 60dd04ac ─────────────── 55b39920                     (F3 → F4)
               (F3 certified)          (F4 certified)
```

### Inventario de commits exclusivos

| Lado | Commits | Contenido |
|---|---|---|
| F3 (3af2ea5c..60dd04ac) | 1 | `60dd04ac` feat(ui): certify F3 interaction states and overlays (22 archivos src/) |
| F4 (60dd04ac..55b39920) | 1 | `55b39920` feat(ui): F4 information architecture (74 archivos: 16 src/ + evidencia 00-09 + 28 PNG) |
| main (3af2ea5c..09ef9e97) | 4 | `41c2d539`+`a63d4fe9` (PR #1330 security), `ff307220`+`09ef9e97` (PR #1331 security) |

**Conclusión de topología:** F4 es descendiente directo de F3 → la integración debe preservar
la relación `F3 → F4` (estrategia: merge F3 primero, luego F4, ambos `--no-ff`, sin squash,
sin rebase). Simultáneamente main trae 2 fixes de seguridad que NO están en F3/F4 → merge
real de 3 bandas, no fast-forward.

## GATE 2 — Certificación F3 / F4 (evidencia existente, sin re-auditar)

### F3 — `60dd04ac` CERTIFIED

- **Mensaje del propio commit** (git show 60dd04ac): registra `F1 regression 44/44 PASS;
  tsc 0 errors; eslint 0 errors (pre-existing debt class warnings only); vitest 171/171`,
  más el alcance funcional certificado (StateRenderer onRetry, focus trap data-autofocus/
  onEscape/activation-edge, toaster canónico, 5 confirmaciones migradas a AlertDialog).
- **Evidencia cruzada en F4**: `audit-evidence/UI-DESIGN/F4/07-F4-REGRESSION.md` §F3 —
  tabla de checks F3 (modal, Escape, focus restoration, StateRenderer, retry, toaster) con
  veredicto **"F3 SIN REGRESIÓN FUNCIONAL"**, ejecutado sobre el tip 60dd04ac.
- **GAP DOCUMENTAL (registrado, no bloqueante):** la carpeta `audit-evidence/UI-DESIGN/F3/`
  no fue commiteada en la rama F3; la certificación queda atestiguada por el mensaje de
  commit y por la regresión cruzada F4. No se re-ejecuta la auditoría F3 (la tarea lo
  prohíbe salvo conflictos — no los hay).

### F4 — `55b39920` CERTIFIED

- Carpeta completa `audit-evidence/UI-DESIGN/F4/` (00–09 + 28 PNG BEFORE/AFTER) incluida
  en el commit `55b39920`.
- `09-F4-FINAL-VERDICT.md`: veredicto **"F4 — CERTIFIED"**; registra tsc 0 errores,
  eslint 0 errores, **vitest 2355 PASS**, deep-links 15/15, responsive 320–1440 sin
  overflow, regresiones F1/F2/F3 PASS.

## GATE 3 — Punto de recuperación (creado ANTES de cualquier merge)

```text
$ git tag backup/pre-f5-main-09ef9e97 09ef9e97
$ git rev-parse backup/pre-f5-main-09ef9e97
09ef9e979699e886aafdf6c148bb00f7593d38d5
```

Tag local `backup/pre-f5-main-09ef9e97` apunta EXACTAMENTE al HEAD real de `main`
(= `origin/main`) antes de integrar. NO se borra durante esta tarea.
(El tag se subirá a origin junto con los merge commits para sobrevivir a resets del
entorno; push de tag es adición de ref, nunca force.)

## GATE 4 — Actualización de referencias

```text
$ git fetch origin --prune
a63d4fe9..09ef9e97  main       -> origin/main
* [new branch]      security/sec-ts-05-purge-snapshots -> origin/security/sec-ts-05-purge-snapshots
```

NO se ejecutó `git reset --hard`, `git clean -fd`, force-push ni borrado de ramas.
Post-fetch re-verificación ls-remote: F3/F4/main SHAs idénticos a GATE 0 (remoto estable).

## GATE 5 — Simulación de estrategia

Preferencia de la tarea confirmada por topología:

```text
main actual (09ef9e97)
    ↓ merge F3 (60dd04ac)   [merge real 3-way: base común 3af2ea5c]
    ↓ merge F4 (55b39920)   [F4 contiene F3 → tras el paso anterior sólo aporta su commit propio]
```

- NO squash, NO rebase destructivo, NO force: los commits certificados `60dd04ac` y
  `55b39920` se preservan byte a byte.
- La relación F3→F4 se preserva por construcción (F4 se integra después y contiene a F3).

## GATE 6 — Detección de conflictos (análisis previo)

```text
$ git diff 3af2ea5c..origin/main --name-only        (main desde base)
src/__tests__/api/sec-ts-04-wallet-import-trm.test.ts
src/__tests__/api/sec-ts-05-purge-snapshots.test.ts
src/app/api/cron/purge-snapshots/route.ts
src/app/api/wallet/import-trm/route.ts
src/validation/api-schemas.ts

$ comm -12 <(main) <(F3)   → VACÍO
$ comm -12 <(main) <(F4)   → VACÍO
```

| Clasificación | Superficies |
|---|---|
| **NO OVERLAP** | main(security) ∩ F3 = ∅ ; main(security) ∩ F4 = ∅ |
| Superficies F3 | 22 archivos src/ (states, overlays, StateRenderer, useFocusTrap, toaster) |
| Superficies F4-only | 16 archivos src/ (shell/header/sidebar, navigation config, POS, receptions, settings, cost_sheet, management_hub, system-prompt-builder) + evidencia |

Especial atención requerida por la tarea: navigation (sólo F4), shell (sólo F4),
UI components (F3/F4), auth/session (**nadie**), seguridad (**sólo main**, sin cruce),
Supabase (**nadie**), configuración (sólo F4, sin cruce).
**Predicción: integración SIN conflictos.** Si el merge real produjera conflictos,
STOP y clasificar según GATE 8/10.

---

Estado al cierre de este documento: gates 0–6 PASS. Se procede a GATE 7 (checkout main
sincronizada + verificación pre-merge).
