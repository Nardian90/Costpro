# FASE F4-CI — 05 Reproducción local

## Comando exacto de CI reproducido

```bash
cd /home/z/my-project/costpro-main   # worktree git @ 9327ee33 (audit/f4-create-sale-v2-reconciliation)
node scripts/security-contract-test-static.cjs
```

(mismo binario node v24.21.0; sin secretos — el script es "CI-safe" por diseño)

## Reproducción ANTES del fix (main 9327ee33)

```text
▸ [Capa C] create_sale_v2(public.create_sale_v2/21) — divergencia sin baseline
  🚨 [CRITICAL] BODY_DRIFT_FROM_MIGRATION
     cuerpo LIVE ≠ replay de migraciones (última definición en 20260926000001_esec_price_integrity.sql)
🚨 VIOLACIONES BLOQUEANTES: 1 — BUILD BLOQUEADO
```

Exit code: **1** — reproducido 100% idéntico al fallo de CI (run 36334881755, job Security Audit, step "Security contract (static, CI-safe)").

## Reproducción intermedia (tras primer paso del fix — snapshot re-certificado)

```text
▸ [Capa C] create_sale_v2(public.create_sale_v2/24) — divergencia sin baseline
  🚨 [CRITICAL] UNEXPECTED_ACL_DRIFT
     grants EXECUTE divergentes: snapshot=[PUBLIC, anon, authenticated, service_role] replay=[PUBLIC]
```

Exit code 1 — segundo desajuste (ACL) descubierto y cerrado (ver 06-fix.md).

## Reproducción DESPUÉS del fix completo

```text
── Capa C — reconciliación source-of-truth (REM-INV-6): 141 funciones del surface
Representadas en migraciones: 141/141
Divergencias source-of-truth (bloqueantes): 0

🎉 CONTRATO OK — Capa A: 141/141 · Capa B: 189 verificadas, 17 baseline, 0 nuevas · Capa C: 141/141 representadas, 0 divergencias
```

Exit code: **0**

## Notas de no-reproducibilidad parcial (documentadas)

1. **Build**: el paso TypeScript embebido de `next build` muere por SIGKILL (OOM) en este host de 4GB con otros procesos activos; la compilación Turbopack completa exitosa (70s) y `bunx tsc --noEmit` standalone PASS. Precedente interno: commit `bbb74f4c` — "CI validation … confirms local build OOM was host-only". CI (runner GitHub 7GB) valida el build del PR.
2. **E2E completo**: `global-setup` exige `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` — en CI faltan (categoría D). Localmente el API-level E2E-POS-001 se ejecutó con éxito; E2E-POS-009 falla por fixture (tienda piloto sin productos activos → `product=N/A`), condición de datos preexistente ajena a F4.
