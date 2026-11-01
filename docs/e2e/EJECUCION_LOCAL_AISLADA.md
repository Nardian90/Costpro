# E2E AISLADO EN LOCAL — Correr la suite contra la BD `CostproE2E` con PM2

**CP-INFRA-011 · Complemento local de `.github/workflows/e2e-isolated.yml`**

El workflow `e2e-isolated` corre manualmente en CI. Este runbook documenta el
procedimiento equivalente para ejecutar la suite E2E en un entorno local
(PM2 + bun) contra la **base aislada `CostproE2E`** (ref `lguovmvrozxgssupkwpf`),
sin tocar nunca producción (`wthkddeleylijmonclxg`). El guard
`e2e/fixtures/assert-isolated-db.ts` lo hace cumplir de forma fail-closed:
rechaza la URL de producción y exige que el ref de la URL coincida EXACTAMENTE
con `E2E_ALLOWED_REMOTE_REF` y que el centinela `public.e2e_is_isolated_db()`
devuelva `true`.

## 1. Requisitos

- bun `1.3.14` (misma versión que CI — con 1.4.x falla `--frozen-lockfile`
  por cambio de formato de `bun.lock`), pm2, Node 20+.
- Dependencias y Chromium: `bun install --frozen-lockfile` y
  `bunx playwright install chromium`.
- Un `.env` LOCAL (jamás versionado — `.gitignore` cubre `.env*`) con:
  - La configuración normal de la app (`DATABASE_URL`, `NEXTAUTH_*`, etc.).
  - Las variables lógicas E2E (mismas que los secretos del Environment
    `e2e-isolated`): `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`,
    `E2E_SUPABASE_SERVICE_ROLE_KEY`, `E2E_ALLOWED_REMOTE_REF`,
    `E2E_TARGET_KIND=project`, además de `E2E_ISOLATION=1` y
    `E2E_SKIP_PROTECTED_GUARD=1` (los recursos protegidos de producción no
    existen —ni deben existir— en la base aislada).
  - Opcional para el apilador con transporte pg: `E2E_SUPABASE_DB_URL`.
  La plantilla completa vive en `.env.example` (§ E2E BD AISLADA).

## 2. Validar configuración y base aislada (solo lectura)

Con las variables exportadas (`set -a; source .env; set +a`):

```bash
node scripts/e2e/check-e2e-config.mjs --target project   # variables lógicas completas
node scripts/e2e/build-migrations-replay.mjs --check     # manifiesto sin deriva
node scripts/e2e/verify-remote-e2e.mjs                   # ref + centinela=true + REST 200
```

La salida esperada del verificador es `Base aislada PREPARADA`. Si la base
estuviera vacía (proyecto nuevo), el procedimiento de preparación está en
`docs/e2e/E2E_AISLADO.md` §6 (`--inspect` → `--bootstrap` → `--apply-replay`
→ `--verify`), que exige `SUPABASE_ACCESS_TOKEN` con acceso al proyecto aislado.

## 3. Apuntar la app local a la base aislada (técnica de alias del CI)

La suite y el servidor deben hablar con el MISMO proyecto. El workflow de CI
consigue esto exportando `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` con los valores E2E. En local se replica con un
swap del `.env` (todas estas copias quedan ignoradas por la regla `.env*`):

1. Backup del `.env` principal → `.env.main`.
2. Generar `.env.e2e-run`: copia del `.env` con las tres variables de app
   apuntando al proyecto aislado.
3. `cp .env.e2e-run .env && pm2 restart costpro` y esperar
   `curl -f http://localhost:3000/api/health`.
4. Al terminar, restaurar: `cp .env.main .env && pm2 restart costpro`.

Tras el swap la app compila con los valores aislados (Next inlining de
`NEXT_PUBLIC_*`), de modo que UI, API y fixtures usan la misma base.

## 4. Ejecutar la suite (smoke set CP-INFRA-011)

```bash
set -a; source .env; set +a
PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/report.json \
bunx playwright test --project=core --reporter=line,json --retries=0 \
  'health-api|isolated-db-sentinel|auth.spec.ts|data-hygiene-probe|isolation-proof|inventory.spec.ts|pos-checkout|inventory-integrity'
```

- El global-setup (`e2e/fixtures/run-env.ts`) provisiona identidad sintética
  por corrida (`E2E_ISOLATION=1`): usuarios + tenant + pilotos A/B propios;
  el global-teardown reconcilia al terminar. Los specs de creación incluidos
  en el filtro quedan ignorados bajo `--project=core` (igual que en CI, que
  no define `E2E_ALLOW_CREATION`).
- `isolated-db-sentinel.spec.ts` verifica desde el runner que el centinela
  responde `true` vía REST con la anon key.

## 5. Corrida de referencia (2026-11-01, local con PM2)

| Paso | Resultado |
| --- | --- |
| `check-e2e-config --target project` | OK — variables lógicas completas |
| `build-migrations-replay --check` | MATCH — manifiesto sin deriva (`5ac8977a…`) |
| `verify-remote-e2e` | OK — ref verificado, centinela `true`, REST 200 |
| PM2 + swap a base aislada | `/api/health` 200 |
| Suite smoke (filtro CP-INFRA-011) | **45 passed / 0 failed (3.3m)** — 45/45 verde |
| Guardrail net-zero (global-teardown) | Detectó 1 residuo **preexistente** (2026-10-31, `E2E OTHER-STORE MCmvwfx2eb` + su tenant — ajeno a esta corrida) |
| Remediación | Hard-delete del residuo con `hard-cleanup.ts` canónico (guardas anti-protegidos activas) |
| `data-hygiene-guard.cjs` re-corrida | **PASS — net delta = 0** (stores=0, users=0, 5 protegidos intactos) |

## 6. Seguridad

- Nada de esto se versiona: `.env`, `.env.txt`, `.env.main`, `.env.e2e-run`
  quedan cubiertos por la regla `.env*` del `.gitignore`. Los valores reales
  viven solo en el `.env` local o en los secretos del Environment
  `e2e-isolated` de GitHub.
- El smoke corre contra la base aislada; si por error el `.env` apuntara a
  producción, el guard aborta antes de escribir (fail-closed).
