# FASE F4-CI — 02 Failing Job (identificación exacta)

## Identificación del check que falla

```text
CI workflow:   CI (ci.yml)
Job:           Security Audit (job id 108663716384 en run 36334881755 @ main 9327ee33)
Step:          Security contract (static, CI-safe)
Comando:       node scripts/security-contract-test-static.cjs
Exit code:     1
Primer error:  🚨 [CRITICAL] BODY_DRIFT_FROM_MIGRATION
```

## Salida exacta del primer error causal (log del job, run 36297405234 @ main 9d220a36 — idéntico en todos los runs fallidos posteriores)

```text
── Capa C — reconciliación source-of-truth (REM-INV-6): 141 funciones del surface
Representadas en migraciones: 141/141
Divergencias source-of-truth (bloqueantes): 1

▸ [Capa C] create_sale_v2(public.create_sale_v2/21) — divergencia sin baseline
  🚨 [CRITICAL] BODY_DRIFT_FROM_MIGRATION
     cuerpo LIVE ≠ replay de migraciones (última definición en 20260926000001_esec_price_integrity.sql)

🚨 VIOLACIONES BLOQUEANTES: 1 — BUILD BLOQUEADO
##[error]Process completed with exit code 1.
```

## Fallos secundarios descartados como causa raíz (fallos derivados / independientes)

| Job | Workflow | Error | Clasificación |
|---|---|---|---|
| E2E Tests (Playwright) | CI | `Error: [global-setup] Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY en .env` (e2e/global-setup.ts:93) | **D — CI-INFRA** (secrets ausentes en el repo; fallback `https://test.supabase.co` rechazado por el setup). Aparece desde el merge PR #1325; NO es fallo de código ni de F4. No modificado en esta fase (§7). |
| TypeScript Security Checks | Security CI Gate | `74 check(s) FAILED` (55 sin Zod, 19 sin auth) | **C — PREEXISTENTE** (deuda histórica documentada; §7 del mandato la excluye explícitamente del alcance). No modificado. |

## Nota sobre la denominación "LIVE" en el contract estático

El término `cuerpo LIVE` del mensaje refiere al **snapshot certificado** (`supabase/security-contract/contract-surface.sql`, exportado con `pg_get_functiondef` desde la base LIVE real por `scripts/export-contract-surface.cjs`), NO a una conexión en vivo durante CI. El step es "CI-safe" precisamente porque compara snapshot vs replay de migraciones sin secretos.
