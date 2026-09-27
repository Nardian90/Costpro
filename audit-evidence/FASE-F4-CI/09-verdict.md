# FASE F4-CI — 09 Veredicto

## Caso aplicable (criterio de éxito §25): Caso 1 — el fallo era (la ausencia de) F4

```text
F4 (reconciliación pendiente desde 09-26)
  ↓ fix mínimo (snapshot re-certificado + migración ACL /24 + REVOKE anon en LIVE)
  ↓ CI PASS (Security Audit SUCCESS en run 36336731519)
  ↓ regression PASS (static · LIVE · BOLA · V2-only · tsc · lint · unit 2269 · E2E-POS-001 · §20 19/19)
```

## Resumen ejecutivo

**CI fallaba** porque la FASE F4 (reconciliación definitiva de `create_sale_v2`) **nunca se había completado**: E-SEC-FINAL (D1–D5) se desplegó a LIVE y se commiteó a main el 09-26 **sin re-certificar el snapshot del security contract**. El detector Capa C comparaba el snapshot stale (`/21` pre-E-SEC, certificación 09-15) contra el replay de migraciones (entrada fantasma `/21` con cuerpo R-SEC-1, porque el parser no procesa `DROP FUNCTION`) y bloqueaba el build con `BODY_DRIFT_FROM_MIGRATION`. El fallo **no** fue causado por el merge E2E #1325 (ya fallaba en `main@9d220a36` pre-merge) ni por F3.

El fix cerró el drift **sin alterar la lógica funcional certificada de E-SEC-FINAL** (cuerpo LIVE intacto, 26981 chars, 19/19 propiedades §20 verificadas) y **sin tocar el detector** (sin allowlist, sin severidad, sin checks eliminados).

## VEREDICTO

```text
VEREDICTO: CERTIFIED
```

**Alcance de la certificación**: el diagnóstico forense y la corrección del fallo CI causado por F4 (job Security Audit → BODY_DRIFT_FROM_MIGRATION). El fix queda entregado en la rama `audit/f4-create-sale-v2-reconciliation` (PR #1326) — **pendiente de merge por el responsable** (esta fase no mergea ni cierra PRs, §23).

## Deudas preexistentes registradas (NO absorbidas, §7)

| Deuda | Categoría | Estado en CI tras F4 |
|---|---|---|
| 74 TS checks históricos (55 sin Zod, 19 sin auth middleware) — job TypeScript Security Checks (Security CI Gate) | C/B preexistente | Sigue rojo (por diseño: fuera de alcance) |
| 17 funciones ⚪ baseline Capa A/B (SEARCH_PATH_NOT_SET, ANTI_SPOOFING_GUARD_MISSING) | histórica | No bloqueante (baseline revisado) |
| Secrets de E2E ausentes en GitHub Actions (`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY`) | D — CI-INFRA | E2E sigue fallando en CI (`continue-on-error: true`, no bloquea). Requiere configurar secrets en el repo |
| Fixture E2E-POS-009: tienda piloto sin productos activos (`product=N/A`) | fixture/datos | Solo afecta ejecución local UI-level; en CI el E2E aborta antes (secrets) |
| Build local: fase TS embebida SIGKILL (OOM host 4GB) | entorno local | No aplicable a CI (runner 7GB — build PASS en run 36336731519). Precedente `bbb74f4c` |

## Condición operativa posterior (recomendación)

Tras el merge de #1326, el siguiente push a main ejecutará el CI con el Security Audit en verde por primera vez desde el 09-26. Los secrets de E2E quedan como única acción CI-infra pendiente para que el flujo E2E vuelva a ser ejecutable en CI (recomendación: FASE dedicada, no absorber en F4).
